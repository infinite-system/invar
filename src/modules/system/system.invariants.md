# System — Invariants

Load-bearing rules for `src/modules/system/` — the stateless capability layer (`Files`, `Clock`,
`Environment`, `Logging`, `Processes`, `StatusChannel`, `TaskStatePath`) plus the vendored
`Static.ts`. Stands on `project.invariants.md`.

## Reality-based invariants

_None specific — the system layer wraps the underlying OS/tool realities named at project scope
(language and git tools are separate failable processes) rather than adding its own._

## Chosen invariants

### Clipboard emissions flush at frame boundaries

**Invariant:** If Invar emits an OSC 52 clipboard sequence, then the renderer's serialized terminal
writer emits the complete sequence between synchronized frames.

**Scope:** `Clipboard.copy`, the renderer binding in `Bootstrap.boot`, and raw stdout shared with
OpenTUI. Local clipboard tools and clipboard reads are outside this output-ordering rule.

**Mechanism:** `Bootstrap.boot` binds `Clipboard.setOsc52Emitter` to the renderer's `writeOut`
authority. `Clipboard.copy` constructs one complete `OSC 52 ; c ; base64 BEL` string and submits it
through that binding, so no independent `process.stdout.write` can splice it into a renderer frame.

**Generates:** One renderer-coordinated OSC 52 emission seam for Settings, terminal, agent
transcript, and agent composer copy; complete canonical base64 payloads outside DEC 2026 frame
markers.

**Rejected alternatives:** Write directly to `process.stdout` — OpenTUI owns the same byte stream
and may flush a native-thread frame concurrently.

**Evidence:** The user's cmux host accepted a hand-run OSC 52 sequence on 2026-07-25;
`src/modules/system/Clipboard.test.ts`; `scripts/harness/TerminalOutputAudit.test.ts`;
`scripts/harness/smoke-clipboard-frame-boundary-harness.ts` (active and idle copy, 5/5 per surface).

**Impossible if true:** OSC 52 begins inside CSI, OSC, DCS, APC, or a DEC 2026 synchronized frame;
copy reports OSC 52 delivery when no renderer owns the output seam; terminal, transcript, and
composer copy use different emission paths.

**Verification:** `bun test src/modules/system/Clipboard.test.ts
scripts/harness/TerminalOutputAudit.test.ts && bun
scripts/harness/smoke-clipboard-frame-boundary-harness.ts`

**Status:** established

**Last refined:** 2026-07-27

### Capability classes are stateless and Static wrapped

**Invariant:** If a class in this layer is a capability (behavior only, no per-instance state),
then it is wrapped in `Static()` so its methods stay bound to the selected class when retained as
a callback; anything with instance identity or lifetime is NOT a capability and stays a plain
instance class.

**Scope:** `system/*` capability classes vs stateful non-reactive classes elsewhere
(`PieceTable`, `LspProcess`, `UndoStore`, `GitWatcher`, …).

**Mechanism:** `Static()` from `ivue/extras` wraps the immutable `$Class` anchor for every class
declaring statics. It lazily binds visible static methods and caches get-only `$` accessors per
receiving class. `Class` remains the selected mutable seam. Realizes `project.decisions.md` #7
(capability vs plain vs reactive) without making the inheritance anchor mutable.

**Generates:** callback-safe passable capability methods (command actions, key handlers, watcher
callbacks); native static `super` + kernel composition of capabilities; the `system/*` `Static()`
wrapping.

**Evidence:** `system/{Files,Clock,Environment,Logging,Processes,StatusChannel,TaskStatePath}.ts` →
`const $Class = Static($X); Class = $Class`. No capability class holds instance state or uses
`this.#private` (which `Static()`'s subclass receiver would reject).

**Impossible if true:** a capability method that loses its `this`/binding when passed as a
detached callback; a `system/*` capability class that holds per-instance state; a stateful
class (identity + lifetime) wrapped in `Static()`.

**Verification:** a test that retains a capability method as a detached callback and asserts it
still executes correctly; the static-cache contract test; the namespace grammar checker.

**Status:** provisional

**Last refined:** 2026-07-21

### External tools share one launch policy

**Invariant:** If production code launches an external tool, then it uses
`Processes.spawn(argumentVector, options)` so the launch is shell-free and strips every ambient
`GIT_*` variable.

**Scope:** External tools launched by system, LSP, agent, narration, git, search, and future
production modules. `OpenPtyBackend` is outside this scope because an interactive shell requires
the complete user environment and slave-file-descriptor standard streams.

**Mechanism:** `Processes.spawn` accepts only an argument vector, rejects an `env` option, and
supplies `Processes.hermeticEnvironment()` after all caller options. `Processes.run` layers output
capture over that method. `OpenPtyBackend` calls the runtime launcher directly at the documented
PTY boundary.

**Generates:** One shell-free and hermetic launch chokepoint; streaming and captured subprocesses
inherit the same external-tool policy; the PTY keeps its distinct interactive environment
generator.

**Rejected alternatives:** Let streaming consumers call the runtime launcher directly — each
consumer silently loses the shared environment policy.

**Evidence:** `src/modules/system/Processes.ts` (`spawn`, `run`, `hermeticEnvironment`);
`src/modules/system/Processes.test.ts`; `src/modules/terminal/OpenPtyBackend.ts` (documented
interactive exemption).

**Impossible if true:** A production external tool inherits `GIT_DIR`, `GIT_INDEX_FILE`,
`GIT_AUTHOR_NAME`, or any other ambient `GIT_*` variable; a production module launches an external
tool directly outside `Processes.ts`; the PTY loses the user's interactive environment.

**Verification:** `bun test src/modules/system/Processes.test.ts && grep -rn "Bun[.]spawn" src/`;
the grep reports only `Processes.ts` and the documented `OpenPtyBackend` exemption.

**Status:** established

**Last refined:** 2026-07-24

### File access is confined to a single root

**Invariant:** If a file path is read or listed through `Files`, then it is confined to the active
workspace root — traversal outside it is rejected.

**Scope:** `Files` read/list/path operations.

**Mechanism:** `Files.confineToRoot` normalizes and checks paths against the root before access.
Realizes the security/robustness posture (path-traversal boundary).

**Generates:** the path-traversal guard; safe file-tree listing.

**Evidence:** `Files.ts` `confineToRoot` (`Files.ts:91`); `looksBinary` NUL-sniff for binary files.

**Impossible if true:** a `../../etc/passwd`-style read that escapes the workspace root through
`Files`.

**Verification:** a test asserting a traversal path outside the root is rejected.

**Status:** provisional

**Last refined:** 2026-07-21

### Observability never crashes the app

**Invariant:** If writing the status side-channel or a log fails, then the failure is swallowed —
observability is best-effort and never propagates into the app.

**Scope:** `StatusChannel.flush`/`settle`, `Logging.write`.

**Mechanism:** IO in these paths is wrapped so errors are caught and dropped; the status file is
written atomically (temp + rename).

**Generates:** the crash-proof status channel the tmux harness reads; non-fatal logging.

**Evidence:** `StatusChannel.ts` flush/settle swallow errors + atomic write; `Logging.ts` guarded.

**Impossible if true:** a full disk or unwritable `artifacts/` dir crashing the editor via the
status channel or logger.

**Verification:** a test forcing a write failure and asserting the app path continues.

**Status:** provisional

**Last refined:** 2026-07-21

### Graph observation reads and never mutates

**Invariant:** If the harness OBSERVES the app through the graph channel (get, waitFor, a miss's
discovery list), then no observed state changes as a consequence — resolving a path never calls
behavior, only reads state. Mutation exists only as the separate explicit `set` request shape,
never as a side effect of a read.

**Scope:** `GraphChannel` (`src/modules/system/GraphChannel.ts`): the resolver walk, the
discovery list on a miss, and the serializer. Applies equally to every future observation
surface: an observation that mutates is an input in disguise. The `set` shape is OUT of this
record's scope by design — it is an experiment primitive (user decision 2026-08-02), and it is
excluded from verification: smokes and gates drive real PTY gestures only.

**Mechanism:** a read request carries `{id, path, mode}` and its handling path (`resolve`)
performs property reads only (ivue getters evaluate on read by design); `availableKeys`
classifies by descriptor without evaluating; class instances serialize as name-plus-keys
instead of mass-evaluating their getters, so only the getters a path names ever run. A write
requires the distinct `set: {value}` field — absent that field, no code path can assign. All
write outcomes (readonly accessor, frozen object, throwing setter) answer as loud errors, never
crashes. The channel is inert unless `StatusChannel.observing`.

**Generates:** the harness split — graph reads for asking, graph set for hypothesis experiments,
real PTY input for acting and verifying; `DriveSession.get`/`waitFor`/`set` staying primitive.

**Rejected alternatives:** mutation implied by the read protocol (a path that assigns on
resolve) — makes every read a potential write and kills the observation guarantee. Full
read-only (no set at all) — rejected by the user 2026-08-02: agents need quick hypothesis
confirmation; the boundary moved from "no writes" to "no writes through reads, no writes in
verification".

**Evidence:** `GraphChannel.ts` — `respond` branches on `request.set`; `resolve`/`walk` assign
nothing; `availableKeys` descriptor-only; serializer's instance guard; `write` wraps assignment
in try/catch. `GraphChannel.test.ts` covers both arms of read and write.

**Impossible if true:** a drive script changing app state through `app.get`/`app.waitFor`; a
graph request WITHOUT a `set` field that causes any state transition beyond answering; a failed
set crashing the app instead of answering with an error.

**Verification:** `bun test src/modules/system/GraphChannel.test.ts`; inspect `resolve`/`walk`
in `GraphChannel.ts` for any assignment into walked nodes.

**Status:** provisional

**Last refined:** 2026-08-02

### The composition graph reaches every installed contributor

**Invariant:** If a contributor is installed in the running app, then its state is reachable
through the observation graph by path, rooted at the composition object — with no per-contributor
membership decision anywhere.

**Scope:** `GraphChannel` roots (`src/modules/app/Bootstrap.ts` BootedApp composition) and
`src/modules/app/ApplicationContributions.ts`. Applies to every current and future contributor.

**Mechanism:** ApplicationContributions exposes every installed contributor by its own
identifier automatically; Bootstrap builds one BootedApp composition object owning the
contributors, tab strips, and renderer; GraphChannel roots at that object. A membership list is
a future gap, so none exists — reach follows installation.

**Generates:** graph paths for contributor state (`contributors.file-tree.activeWorkspace.rowCount`,
`contributors.git.activeWorkspace.changedCount`); the #470 wait migration's model conditions;
the drive-pty discovery loop over contributors.

**Rejected alternatives:** a curated ports list — rebuilt the publish tax at root granularity
(the pre-#471 gap: file tree and git state unreachable because their instances were Bootstrap
locals).

**Evidence:** `src/modules/app/ApplicationContributions.ts`; contributor paths locked by
`scripts/harness/smoke-tree-scroll-harness.ts` and `scripts/harness/smoke-git-watch-harness.ts`
(driven: a real click moved rowCount 3 to 4; a saved edit moved changedCount 0 to 1 to 0).

**Impossible if true:** an installed contributor whose state the graph cannot reach; a
contributor that becomes reachable only after someone edits a membership list.

**Verification:** `bun scripts/harness/smoke-tree-scroll-harness.ts` and
`bun scripts/harness/smoke-git-watch-harness.ts`; or drive `app.get('contributors.<id>...')`
against a warm server for any installed identifier.

**Status:** provisional

**Last refined:** 2026-08-03

### Copy reaches the host terminal

**Invariant:** If the user copies selected text from Settings, a `TextInputModel` field, the terminal
pane, agent transcript, or agent composer, then the exact selected UTF-8 text is emitted as OSC 52
through Invar stdout so the host terminal receives it across cmux, SSH, or a VM boundary.

**Scope:** `Clipboard.copy`, every selected `TextInputModel`, Settings selection, terminal-pane
selection, agent-transcript selection, and agent-composer selection. Clipboard reads remain
local-tool or in-app-buffer operations because OSC 52 is write-only.

**Mechanism:** Every selectable surface reconstructs text grapheme-safely, then calls the one
`Clipboard.copy` seam. That seam buffers in-app, submits one complete
`OSC 52 ; c ; base64 BEL` string through the renderer-coordinated `writeOut` binding, and also writes
a local clipboard tool when available.

**Generates:** Remote copy without `DISPLAY`; one raw-byte assertion shared by every copy surface;
frame-boundary emission; local clipboard compatibility and in-app paste remain available.

**Rejected alternatives:** Shell out only to xclip or wl-copy — those tools address the remote
machine clipboard and commonly fail across SSH or VM boundaries.

**Evidence:** The user's cmux host accepted a hand-run OSC 52 sequence on 2026-07-25;
`src/modules/system/Clipboard.ts`; `scripts/harness/smoke-paste-harness.ts`;
`scripts/harness/smoke-agent-pane-ux-harness.ts`;
`scripts/harness/smoke-clipboard-frame-boundary-harness.ts`.

**Impossible if true:** A successful in-app copy status with no OSC 52 bytes crossing the app PTY;
Settings swallowing its registered copy action; terminal selection sending Ctrl+C to the child
instead of copying; copied Unicode being sliced by UTF-16 units; OSC 52 beginning inside another
terminal control sequence or synchronized frame.

**Verification:** `bun scripts/harness/smoke-paste-harness.ts && bun
scripts/harness/smoke-agent-pane-ux-harness.ts && bun
scripts/harness/smoke-clipboard-frame-boundary-harness.ts`

**Status:** established

**Last refined:** 2026-07-27
