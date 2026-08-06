# project-inversion-design.md — local Invar over remote capabilities (M4, #511)

Design only. No implementation rides with this document. The decision it
prices: run Invar's model and UI on the user's machine while a remote daemon
owns the workspace's filesystem, processes, terminals, and language servers.
This is the VS-Code-server inversion the channel protocol reserves
([docs/iv-channel-protocol.md](docs/iv-channel-protocol.md), "Inversion
constraint").

## In plain words

Today, remote editing means running the whole app on the remote machine and
watching its screen through ssh. The inversion flips that. The app runs on
your machine, and only file reads, git calls, and terminals travel over the
wire. The price is that every place in the code that reads a file and expects
the answer NOW must learn to wait. This document counts those places. There
are 70, and each kind has a stated cost.

## Inputs

- [The wave draft, M4 section](.invar/tasks/completed/508-local-drop-opens-the-dropped-file/the-wave-draft-blessed.md)
- [The GUI feasibility note](project.gui-feasibility.md), the Bun-coupling census of 2026-08-04
- [Invar channel protocol 1.0](docs/iv-channel-protocol.md), the transport the proxies would ride
- The sync census script:
  [census-511-sync-call-sites.ts](.invar/tasks/in-progress/511-inversion-design-and-sync-census/census-511-sync-call-sites.ts)

## 1. Topology

Two processes, one protocol.

- **Local Invar** is the full app: ivue model graph, renderer, keybindings,
  themes, settings, panels. It draws every frame locally, so typing and
  scrolling never cross the wire.
- **Remote capability daemon** is `iv --channel-server` grown up. The same
  binary that today receives drop uploads becomes the host for `fs.*`,
  `process.*`, `pty.*`, and watcher streams. It runs with the workspace root
  as its confinement boundary and never renders anything.
- **Transport** is the channel protocol as shipped: framed request/response
  plus streams, bidirectional, over the existing `iv ssh` control master. The
  protocol already satisfies the inversion constraint. Requests flow both
  ways, and capability names do not encode ownership.

The seam that makes this cheap already exists. Capability classes are
`Static()` slots with a mutable `Class` selection
(record: [Capability classes are stateless and Static wrapped](src/modules/system/system.invariants.md#capability-classes-are-stateless-and-static-wrapped)).
A "remote kernel" is a boot-time installation of proxy classes into the same
slots (`Files.Class = RemoteFiles`, `Processes.Class = RemoteProcesses`)
with zero changes at consumer sites. The blocker is not the seam. It is that
the proxies cannot keep the synchronous signatures, which is what the census
below prices.

## 2. The capability classes, judged one line each

The feasibility note counted 12 Bun-coupled files on 2026-08-04. The same
census re-run today finds 16. Four grew in since: the channel trio from
#509 (iv ssh, the channel client) and `RuntimeSample`. All sixteen, judged:

| File | Verdict for inversion |
| --- | --- |
| `system/OpenPty.ts` | REMOTE: shells run where the workspace is. It becomes the daemon-side pty provider behind `pty.*`. |
| `terminal/OpenPtyBackend.ts` | SEAM STAYS: a `RemotePtyBackend` twin joins it behind the same one-backend seam. Bytes stream over the channel. |
| `database/SqliteDatabaseConnection.ts` | REMOTE: the .db file lives in the workspace. The connection becomes a proxied handle (`db.*`). |
| `system/Processes.ts` | SPLIT: the one launch chokepoint gains a routing key. Workspace tools (git, rg, language servers, tasks, ffmpeg) spawn remote, user-surface tools (clipboard, TTS, native dialogs) spawn local. |
| `lsp/TypeScriptProvider.ts` | REMOTE: the server must see the workspace fs. Stdio tunnels as a stream, LSP semantics unchanged. |
| `lsp/CodexRewriteProvider.ts` | REMOTE: codex operates on workspace files. |
| `media/FfmpegVideoSource.ts` | REMOTE spawn, streamed frames: the media file is remote, and frame delivery is already a byte-stream shape. |
| `narration/SystemTtsBackend.ts` | LOCAL: audio plays on the user's machine. |
| `agent/AgentProviderRegistry.ts` | REMOTE: agents work on the workspace. |
| `monitoring/LinuxProcessSampler.ts` | LOCAL: it samples the Invar process itself, which is local after the inversion. A remote-host sampler is a later, separate ask. |
| `monitoring/RuntimeSample.ts` | LOCAL: same subject, same reason. |
| `tasks/TaskConfiguration.ts` | REMOTE data, local parse: tasks.json arrives through the fs proxy, the JSONC parse stays local, and task PROCESSES spawn remote. |
| `vendors/NetworkAdmission.ts` | LOCAL: it governs the local app's own network fetches. |
| `channel/ChannelClient.ts`, `ChannelServer.ts`, `Dropzone.ts` | THE WIRE ITSELF: they run on both ends by construction. Not proxied, extended. |

Not Bun-coupled but decisive: `system/Files.ts` (node:fs) is the fs
capability that goes remote, and it is where most of the bill lives. Theme,
settings, keybindings, and the whole ivue/render stack are engine-neutral
and stay local untouched. Clipboard stays local (OSC 52 / local tools),
because copy must land in the user's clipboard.

## 3. The sync census — the migration bill

Script: [census-511-sync-call-sites.ts](.invar/tasks/in-progress/511-inversion-design-and-sync-census/census-511-sync-call-sites.ts)
(its header explains method, output, and controls. Run it with
`bun .invar/tasks/in-progress/511-inversion-design-and-sync-census/census-511-sync-call-sites.ts`).

Stamped at commit `88316755591a675317087b00cc8b0ca10add333b`:

- **70 synchronous capability call sites** would need conversion:
  **55 on `Files`** sync-I/O methods, **15 on `Processes.spawn`**.
- 93 further `Files` calls are pure path math (join, dirname, confineToRoot,
  and their siblings). No I/O, no conversion, excluded from the bill.
- The method sets are DISCOVERED from the capability sources (a `Files`
  method is sync-I/O when its body references a node:fs `*Sync` import),
  never hand-listed, so the census re-prices itself as the code moves.
- Both control arms pass. Positive: known live sites in `TextDocument` and
  `Clipboard` are found. Negative: 56 sync-named calls on non-capability
  receivers are seen and none counted, and the seam files contribute zero.
  Completeness: every value-importer of `Files` is explained. A deliberately
  broken receiver-matcher collapses the count to 13 and exits 1, so the
  census can go red.

Shape of the bill, by nearest enclosing function:

| Shape | Sites | Meaning |
| --- | ---: | --- |
| already async | 10 | the conversion is a local `await`: free |
| sync function | 59 | the function goes async and its CALLERS ripple |
| constructor | 1 | `FfmpegVideoSource`: cannot await, needs a factory step |
| getter | **0** | the impossible class is EMPTY: no sync I/O hides in a reactive getter |

The zero-getter row is the census's best news. Nothing reads the filesystem
from inside ivue's reactive derivation layer, so no site requires the
cache-or-nothing redesign. The 59 sync-function sites are the true bill, and
they ripple: each conversion makes its enclosing function async, which makes
that function's callers await, transitively. The census counts direct sites
and classifies their containers. It does not compute the transitive closure.
That needs whole-program call-graph analysis and would still undercount
dynamic dispatch. Treat 70 as the floor and the ripple as the multiplier.

Concentration, top modules: agent 10, lsp 7, git 6, terminal 5, text 5.
Five modules hold 33 of 70. Roughly 12-15 of the 70 sit in capabilities
judged LOCAL above (settings 3, narration 3, clipboard 3, channel wrapper 3,
parts of app), so the REMOTE conversion bill is nearer **55-58 sites across
~25 files**.

Hot-path honesty: three sites matter more than their count.

1. `search/QuickOpen.ts` enumerates directories per keystroke
   (`listNamesResult`, `isDir`). Awaiting a network round-trip per keystroke
   is not a conversion, it is a redesign. Enumeration must move daemon-side
   or run against a mirrored index.
2. `text/TextDocument.ts` reads file content and polls `mtimeMs` on the
   open/reload path. It converts cleanly to async open plus watcher push.
3. `terminal/TerminalRcfile.ts` writes rcfiles into a temp directory for the
   shell. After inversion the shell is remote, so these writes must target
   REMOTE tmp through the proxy, not just become async.

## 4. Latency plan

What caches, what invalidates it, what stays chatty.

**Cached at the local end (mirror caches, invalidated by remote watcher
streams):**

- Directory listings. The file tree and breadcrumb pickers read a local
  mirror. The daemon pushes fs watcher events as stream frames (the protocol
  already lets a stream attach to a long-lived `watch.subscribe` request).
  An event invalidates exactly the listed directory.
- Document content. Read once (async) at open. Edits are local to the
  PieceTable, and save is one async write. The current `mtimeMs` polling in
  `TextDocument` is REPLACED by watcher push, which deletes two census sites
  and removes a polling loop.
- Git status and blame. Already produced by async `Processes.run`. Results
  cache locally and invalidate on watcher events under `.git` and the
  worktree, exactly as `GitWatcher` does today.
- Settings, themes, keybindings. Local capabilities, no cache needed.

**Chatty and acceptable (inherent request/stream shapes, latency-tolerant):**

- Terminal pty bytes: already a byte stream. Keystroke echo is produced by
  the remote shell, exactly as ssh behaves today, so it is never worse than
  the status quo.
- LSP traffic: completion and hover are request/response with visible
  spinners already. Tunneling stdio adds one RTT, tolerable at the 50-100ms
  the UI already absorbs.
- Agent streams, task output, drop uploads: event streams by construction.

**Chatty and NOT acceptable (redesign, not conversion):**

- QuickOpen per-keystroke enumeration (above) moves daemon-side: the query
  travels, the matches return. Or a background-mirrored name index serves
  matches locally. Either way this is the one interactive path where the
  naive proxy would be felt on every keystroke.

## 5. Invariants the design must respect (cited, none edited)

- **[File access is confined to a single root](src/modules/system/system.invariants.md#file-access-is-confined-to-a-single-root)**.
  The confinement check moves to the DAEMON side of the trust boundary. The
  remote `fs.*` provider enforces `confineToRoot` against its configured
  root and must not trust the client's path math. A client-side check alone
  would make the invariant vacuous against a compromised or buggy client.
- **[External tools share one launch policy](src/modules/system/system.invariants.md#external-tools-share-one-launch-policy)**.
  The daemon-side `process.*` provider applies `hermeticEnvironment` at the
  remote end. The routing key (workspace tool vs user-surface tool) lives in
  the one existing chokepoint, never at call sites. Two live violations of
  this record exist today (see the #511 report's bycatch). The inversion
  hardens this seam and must not inherit the bypasses.
- **[Terminal bytes cross exactly one backend seam](src/modules/terminal/terminal.invariants.md#terminal-bytes-cross-exactly-one-backend-seam)**.
  The remote pty arrives as a new `TerminalBackend` implementation behind
  the SAME seam. No second byte path.
- **[Capability classes are stateless and Static wrapped](src/modules/system/system.invariants.md#capability-classes-are-stateless-and-static-wrapped)**.
  Remote proxies install via the mutable `Class` slots. Consumers never
  learn which kernel they run under.

## 6. Protocol reservations (proposed, doc-only)

Version 1 reserves `drop.*`, `dialog.*`, `fs.*`, `pty.*`. The inversion
also needs, and a future protocol minor should reserve:
`process.*` (spawn/stdio streams/exit), `watch.*` (fs event subscriptions),
and `db.*` (proxied sqlite handles). LSP needs no namespace of its own:
carry it inside `process.*` stdio streams, since LSP is already a
subprocess protocol. No protocol edit rides with this document.

## 7. The honest recommendation

**Defer. Do not build now, and do not park.**

The bill is real but small: 70 direct sites, 55-58 on the remote path, zero
in getters, one in a constructor. That is roughly a one-to-two-week
mechanical conversion plus one genuine redesign (QuickOpen) and one
relocation (TerminalRcfile). The seam architecture already fits, and the
protocol already reserves the door. Waiting does not grow the bill. The
census is committed and re-runnable, and the conventions keep new sync I/O
flowing through the same two seams it counts.

What makes deferral right is that the alternative already ships. `iv ssh`
runs full Invar on the remote host today, at zero migration cost. The
inversion only beats it when one of these numbers moves:

- **Round-trip time.** Remote-rendered TUI feels the RTT on every keystroke.
  At LAN and near-region RTTs (up to ~40ms) the shipped path is fine. If
  real usage shows sustained RTTs above 80-100ms, where remote echo visibly
  lags typing, the inversion becomes the fix, because it moves rendering
  local and hides the wire behind caches and streams. Measure this on real
  `iv ssh` sessions before deciding. The number is cheap to collect, since
  the channel already round-trips frames that can be timestamped.
- **The GUI decision.** If the Electron/Tauri experiment
  ([project.gui-feasibility.md](project.gui-feasibility.md)) is green-lit,
  the renderer becomes local by construction and the inversion stops being
  optional. Build it then, and the two tracks share the daemon.
- **The census itself.** If a re-run shows the sync-site count rising past
  ~150, conversion cost starts compounding and "defer" flips toward "build
  now while it is cheap": the ratchet argument. Re-run the script at each
  wave boundary. It exits 1 if its controls rot.

Park is wrong because both triggers above are live possibilities this
quarter. Build-now is wrong because it spends a week on a door nobody has
yet needed to walk through, ahead of measurements that could redirect the
design. The RTT profile decides how much caching machinery is actually
needed.
