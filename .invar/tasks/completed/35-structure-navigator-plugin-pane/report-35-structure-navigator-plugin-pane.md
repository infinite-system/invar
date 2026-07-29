# READY — #35 (the structure navigator pane — the proof task)

Branch `fleet/35-structure-navigator-plugin-pane`, two commits:

- `88c2d795` — The structure navigator lands as a plugin pane with zero host edits (#35)
- `215724d1` — smoke-activitybar derives activity orders from the manifest it observes
  (#35 gate follow-up; see `## Gate follow-up` at the end)

Worktree clean. `scripts/merge-gate.sh` was not run. Nothing pushed, merged, tagged, or deleted.

## The done-test — PASSED

```sh
git diff --stat b8525832..HEAD -- src/modules/ui src/modules/app src/modules/workspace
# prints NOTHING — zero lines, invariant citations included
```

The pane landed with ZERO edits to the host. Not one line, not one citation. 29 files changed:
a new `src/modules/structure/` module, additions inside `src/modules/lsp/`, one manifest line in
`src/modules/plugins/DefaultPlugins.ts`, one smoke arm, and the new domain record. The capstone's
claim holds for its first new citizen.

## What the pane is

A structure navigator in the primary dock beside Files, Git, and Extensions. It lists the active
document's symbol outline — nested, document-ordered, marked through the theme's ONE symbol-mark
table — with the symbol's line number on each row. `Ctrl+Shift+U` shows it. Up/Down move the
selection. Enter, Space, or a click jumps the editor to the symbol's name, records both ends of
the jump for Back/Forward, and returns focus to the editor. The wheel glides it through the same
Momentum seam the file tree uses.

Symbols come from `textDocument/documentSymbol` through the LSP provider. Where no source
answers, the pane SAYS so — a stated headline and reason for every rows-absent state (no file
open, no source installed, unsupported file type, the provider's own size-budget notice, an empty
document, a truncated outline). A blank pane is impossible; a unit test and a driven positive
control both prove it.

## The seam finding — the one thing the proof surfaced

The brief said any seam I had to bend is the real deliverable. One seam is CLOSED, and I did not
bend it: **the host's provider registry is host-only.** `Workspace.provider(identifier)` and the
`contributions` list are `protected`. The host resolves `LanguageProvider` for its own features
(hover, completion, definition), but a PEER plugin cannot resolve another plugin's provider
through any public seam. The structure pane is the first citizen to need that: a contributor
consuming a provider it does not own.

The escape that kept the host untouched is the `RewriteProvider.interface` precedent
(inline-rewrite consumes a provider class that lives in `lsp/`): the CONSUMER owns the interface.
`src/modules/structure/StructureSource.interface.ts` states what the pane asks;
`StructureSources` is a consumer-owned, per-workspace, reactive registry; `LspWorkspaceProvider`
implements the interface and registers itself on attach, withdrawing on `disposed()`. Neither
plugin names the other's concrete class, and either uninstalls alone.

The cost, named honestly: the tree now holds TWO provider rendezvous — the host's protected one
and this consumer-owned one. That is exactly the duplication pressure #222 (provider-seam
analysis) and #223 (database plugin proves the provider seam) are working on. The conductor
should weigh: either the host registry opens as a public generic seam, or the consumer-owned
registry becomes the blessed pattern for peer-plugin consumption and gets a convention line. I
built the second without deciding the first; the decision is a design call above this task.

## What was added where

`src/modules/structure/` — the new citizen, seven production files plus tests:

- `StructureSource.interface.ts` — what the pane asks. `null` = "cannot answer"; `[]` = "no
  symbols"; `truncated` states a capped answer; `structureNotice` carries the provider's reason.
- `StructureSources.ts` — the per-workspace registry with a reactive revision; register returns
  the disposer.
- `StructureOutline.ts` — the per-workspace model. One fingerprint watch (observation, document
  identity, revision, source revision) funnels into one debounced refresh: 30ms on a switch,
  350ms across edits (the diagnostics windows). Requests are generation- and revision-guarded;
  stale answers are discarded and the last honest rows stay. `requestCount` publishes the
  load-invariant cost.
- `StructurePaneRenderer.ts` — windowed rows; every empty state paints its name and reason.
- `StructurePaneContent.ts` — the cells citizen: `render` returns a StyledText; pointer, wheel,
  resize, and scroll getters through the generic pane seams; keybinding context `structure`.
- `StructureWorkspace.ts` — Momentum glide wiring, mirroring `FileTreeWorkspace`.
- `StructurePlugin.ts` — the contributor: manifest row `structure-navigator`, the pane, five
  commands, six keybindings, the `structure*` status projection, and `paneIsObserved` — the gate
  that makes a hidden pane cost zero requests.
- [structure.invariants.md](../../../../src/modules/structure/structure.invariants.md) — the new domain record: one reality invariant (*Symbol structure is
  analyzer knowledge*) and four chosen (*pane content citizen*, *answers or declines never
  blanks*, *cost tracks the observed document*, *jumps through the source-text view contract*).

`src/modules/lsp/` — the source side:

- `LanguageClient.documentSymbols` — advertises `documentSymbol` with hierarchical support on
  initialize; sends only when the server advertised `documentSymbolProvider`; parses BOTH wire
  shapes (`DocumentSymbol[]` nested, `SymbolInformation[]` flat); converts positions through the
  existing UTF-16↔grapheme boundary; caps at 10,000 nodes (nested counted) and STATES the cap
  through `truncated`, never silently.
- `SymbolKinds.ts` — SymbolKind 1–26 → the theme's symbol classes. A separate table from
  `CompletionItemKinds` because the two protocol enumerations share no numbering. No glyph is
  chosen here; the one mark table resolves every mark.
- `LanguageCapabilities.documentSymbols` — the provider capability flag, true for TypeScript.
- `LspWorkspaceProvider` — implements `StructureSource`; registers on construction, withdraws on
  disposal; `supportsDocument` is the cheap path check (no server start);
  `structureNotice` relays the size-budget message.
- [lsp.invariants.md](../../../../src/modules/lsp/lsp.invariants.md) — *LSP is a provider plugin* refined in place: Scope gains document
  symbols, and the Components name the structure-source registration as a peer-plugin port that
  leaves the host-never-imports-LSP clause untouched.

`src/modules/plugins/DefaultPlugins.ts` — the ninth contributor, before Extensions.

## Driven at all three scales

Real app, real `tsgo`, through the PTY harness. The instrument is committed as
`.invar/tasks/in-progress/35-structure-navigator-plugin-pane/drive-35-structure-pane.sh`
(header explains the run command and how to read each number) and was cold-run AFTER the commit,
exit 0:

| drive | file | result |
| --- | --- | --- |
| small TS (100k workspace) | `small.ts` | `structureStatus="ready"`, `structureRows=7`, `structureRequests=1` |
| 100,000 lines | `huge.ts` 7.5 MB | `unavailable`, notice `Large file — language features off (7591 KB > 2048 KB limit)`, ONE declined request, no hang |
| 500,000 lines | `huge.ts` 38 MB | same shape at 5x size: the KB number grows, the request count does not; `small.ts` in the same session still answers `ready` |
| unsupported `.txt` | 10 lines AND 500,000 lines | `unavailable`, notice `No installed source answers for this file type.`, `structureRequests=0` at BOTH sizes |

The scale-parity claim is load-invariant: outline cost is a count of requests about the observed
document, and it does not move with file size. A hidden pane issues zero requests (unit-tested
and gated by `paneIsObserved`). The hand drive on a real workspace also confirmed the jump:
Down, Down, Enter on `widgets.ts` lands the cursor at `{line:4, col:13}` — the class name — with
focus back on the editor.

## The smoke arm

`smoke-plugin-manifest-harness` gained `== plugin manifest: the structure navigator outlines,
jumps, degrades, and reinstalls ==`, six assertions, all against the REAL language server:

```text
PASS  the structure pane lists the real documentSymbol outline
PASS  Enter jumps the editor to the symbol through the view contract
PASS  an unsupported file states its affordance at zero request cost
PASS  the pane degrades and recovers with the source plugin lifecycle
PASS  the structure navigator uninstalls and reinstalls symmetrically
```

The lifecycle arm is BOTH symmetries: uninstalling Language Intelligence under the open pane
degrades it to `No structure source is installed…` and reinstalling feeds it an outline again;
then the Structure Navigator itself uninstalls (pane gone from the dock, `structure*` keys
ABSENT not stale, its chord inert) and reinstalls to a `ready` outline with the same row count —
#220's fourth-verse lesson, proved on day one.

## Positive controls — six, each made to fail on purpose

| control | planted defect | result |
| --- | --- | --- |
| plugin release symmetry | `disposeApplication` kept the status projection | `Expected: 1 Received: 0`, 1 fail on the uninstall test |
| stale-answer discard | disabled the revision guard in `StructureOutline.refresh` | `Expected: 3 Received: 0` — stale empty answer wiped the rows |
| observation gate | removed the `isObserved` early return | `Expected: 0 Received: 1` — a hidden pane issued a request |
| server capability guard | removed the `documentSymbolProvider` check | `a server that never advertised documentSymbolProvider is never asked` fails — the request went out |
| source withdrawal | made the registry disposer keep the source | 3 fails across `LspWorkspaceProvider.test` and `StructureSources.test` — a disposed provider still resolved |
| empty affordance (DRIVEN) | `render` returned a blank for zero rows | smoke exit 1: `Timed out waiting for grid condition: the unsupported degrade is painted, never a blank pane` |

Each returned to green when the plant was removed. (The driven control's first read looked like
exit 0 because I read `$?` after a pipeline — the exact mistake [AGENTS.md](../../../../AGENTS.md) rule 9 names; the
rerun captured the smoke's own exit 1.)

## Verification — exact exit codes

```text
bunx tsc --noEmit                                            exit 0
bun test                                                     exit 0
  1807 pass, 0 fail, 68092 expect() calls across 276 files
bash scripts/conventions-gate.sh                             exit 0
  conventions-gate: PASS
bunx prettier --check .                                      exit 0
node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs   exit 0
  1016 annotations, 77 lattice links, 0 problems
bun scripts/check-coverage-ratchet.ts                        exit 0
  322 files inspected, no undeclared decrease against 831e5cf
bun scripts/check-file-grammar.ts                            exit 0
  0 legacy violations — the new module carries no grammar debt
```

1016/77/0 is above #220's 993/67/0. Eighteen smokes driven green BEFORE the first edit (scratch
worktree at `b8525832`, the branch base) and again AFTER on this tree, using #220's committed
runner: `FAILED: none` on both sides. The after-side run includes the extended manifest smoke.

## What I did not do

- **I did not open the host's provider registry.** That is a design decision (#222/#223
  territory), and making it inside the proof task would have been a host edit. Reasoned above.
- **No breadcrumb segment picker.** The task file marks the breadcrumb documentSymbol pairing
  do-not-build-now; the `documentSymbols` seam it will need now exists.
- **No horizontal scroll in the pane.** Rows window-truncate to the pane width. The file tree
  scrolls horizontally; the outline does not need it yet, and adding the members unread would be
  code no one reads.
- **`handleKey` returns false.** Structure keys ride the command layer like every dock sibling;
  keyboard routing stays #228's (source-text keys through pane context).

## Bycatch

- **SEAM (the headline, restated for triage): the provider seam is closed to peer consumers.**
  `Workspace.provider` is protected; a contributor consuming another plugin's provider has no
  public path. `StructureSources` is the second, consumer-owned rendezvous built to route around
  it (the first is inline-rewrite's construct-your-own pattern). Two registries answering "who
  provides X" is generator drift in the making. Needs a decision: open the host seam, or bless
  and record the consumer-owned pattern. NOT fixed — design call.
- **Distillation possibility: the settings→MomentumOptions mapping is re-rolled.**
  `FileTreeWorkspace.flingMomentum` and now `StructureWorkspace.flingMomentum` build the same
  options record from the same five settings, line for line. Same generator (settings-sourced
  fling physics); a third copy will appear with the next scrolling pane. Sites:
  `src/modules/filetree/FileTreeWorkspace.ts:40` and
  `src/modules/structure/StructureWorkspace.ts:44`. Not unified — the seam call is a design
  decision ([AGENTS.md](../../../../AGENTS.md) bycatch rule).
- **Distillation possibility: the selectable-row-list renderer.** `TreePaneRenderer` and now
  `StructurePaneRenderer` share the row loop: window slice, indent, mark, width-clamp, pad,
  selection-over-hover background, focus-dimmed intensity. `GitPaneRenderer` has relatives of
  it. One "listed rows with item-anchored selection" generator likely underlies all three. Named,
  not unified.
- **Comment drift in `src/modules/ui/PaneContent.interface.ts`.** The first header paragraph
  still says the seam is "Deliberately NOT retrofitted onto the existing editor/git/tree/markdown
  panes yet" while the second paragraph (and reality, since #219/#220) says the tree and the
  editor ARE citizens. The two paragraphs disagree inside one comment. NOT fixed: it sits in
  `src/modules/ui/`, which this task may not touch — the proof produced its own example of why
  the rule "no host edits" and the rule "fix small drift where you see it" can collide.
- **`Enter` on a freshly opened directory workspace still does not open the selected tree row**
  (focus starts on the editor). Unchanged from #219's bycatch; it cost this task's first drive
  one wrong turn, exactly as predicted there. [drive.md](../../../../scripts/harness/drive.md) still does not say it.
- **`bun run drive --size N` still cannot open the file it creates** (ripgrep absent, Quick Open
  falls back to `git ls-files`, `.gitignore` hides `tmp/`). Unchanged from #218/#219/#122/#220;
  worked around with self-made workspaces, `git init`, and tree clicks, as every predecessor did.
- **The Write tool planted two literal NUL bytes in a string literal** of my own
  `StructureOutline.ts` (the fingerprint `join` delimiter), making `file` classify it as data
  and every grep on it silently empty while tests still passed. Caught only because the
  invariants checker could not see the file's annotations. FIXED in place (the delimiter is now
  `':'`), inside the task commit since it was my own uncommitted file. Tooling note for other
  builders: a grep that returns nothing on a file you can read may mean the FILE is the problem.
- No mispainted cell, focus jump, stall, or wrong glyph was seen in any drive, at any of the
  three scales, before or after.

## What this task says

The capstone's claim survives its first real test. A genuinely new citizen — pane, keybindings,
commands, status keys, provider consumption, uninstall symmetry — landed without touching
`src/modules/ui`, `src/modules/app`, or `src/modules/workspace`, and the done-test is a
zero-line diff anyone can rerun.

The seams that made it possible were exactly the ones the campaign built: the contribution
context carried every registration, `PaneContent` carried the pane whole, the theme's one mark
table marked the symbols, and the source-text view contract carried the jump. The seam the proof
EXPOSED is the provider registry: closed to peers, it forced the first contributor-consuming-a-
provider to build a parallel rendezvous. That finding — one closed seam, one workaround with a
name, one decision owed — is the report the brief said would be worth more than the pane.

## Gate follow-up

Two gate reds were routed to me. One was mine and is fixed; the other does not reproduce here,
with the evidence below.

**Red 1 — `smoke-activitybar-harness`, mine, FIXED in `215724d1`.** Reproduced in this worktree
on the first run: exit 1, `Timed out waiting for Alt+Up moves the active Extensions item through
the activity order`. The cause is the class this repo keeps refinding: the smoke asserted
LITERAL orders — `'files,extensions,git'` after Alt+Up and `['git','files','extensions']` after
the pointer drag — a rotted enumeration of `DefaultPlugins`, red the moment a ninth contributor
existed while the reorder behaviour it guards stayed correct. My insertion point is per the
stated design (structure before Extensions), so the fix is on the smoke's side: both
expectations now DERIVE from the observed initial order (Alt+Up expects the active item one slot
up; the drag expects Git at Explorer's index). The smoke is ALL-PASS, exit 0. Two positive
controls on the fix: a planted wrong derivation (active item up TWO slots) reds the exact wait,
exit 1, quoted from the run; and the FIRST plant I tried — expecting the initial order —
PASSED, because that expectation is already true before the keystroke. That second result is
itself evidence of the pre-satisfied-wait hazard (#182/#198's class) sitting latent in this
smoke's `awaitStatus` arms; noted here as bycatch of the fix, not fixed.

**Red 2 — `behavioral-contracts.sh` plugin-manifest arm.** Ran once on this branch as asked:
exit 0, `behavioral-contracts: ALL-PASS`, the plugin-manifest arm green through all eight
sections including my structure arm. I cannot reproduce its gate red here; given red 1, the gate
composition likely hit an order-shaped or load-shaped variant. If it stays red in the batch
after `215724d1`, send me the arm's transcript.

**Red 3 — the `smoke-completion-harness` interaction with #233 (isolated harness env): CANNOT
REPRODUCE, four solo runs, exact composition.** I rebuilt the gate's population precisely:
scratch worktree at current main `220d5143` (which includes #244's lazy agent-SDK boot), merged
`fleet/35-structure-navigator-plugin-pane`, then merged
`fleet/233-wrap-contract-red-settings-leak` (only its own task-folder files conflicted; resolved
theirs), `bun install --frozen-lockfile`. `smoke-completion-harness` ran solo four times:
exit 0, ALL-PASS, all four, mock-provider first arm included — `status.ready` arrives every
time. On the boot-path suspicion: my boot additions are synchronous and small
(`LspWorkspaceProvider`'s constructor gains one registry insert; `LanguageCapabilities` gains a
boolean; the ninth contributor's activation registers a pane, commands, and bindings — no
process, no I/O, no await). Nothing in them can hold `status.ready` open. A negative result is
the deliverable: on this machine the composition is green. If the gate machine still reds it, I
need its failing `status.json` tail or boot-stage log — and the remaining suspects are load or
environment on that runner, or a 233-side env difference `scripts/tui-harness.sh` applies that
the completion smoke's own driver does not, which would route it to #233 (wrap contract red —
settings leak).

**Resolution (conductor, after the above):** reds 2 and 3 were a gate-tree artifact — an
UNINSTALLED node_modules on the gate's scratch tree, masked by Bun auto-install for 57 steps
until the unlinked provider binaries broke exactly these two arms. The four green solo runs
above were correct. Filed as #251 (the gate will refuse an unlinked tree). Nothing further owed
from this branch.

Verification after the follow-up: `smoke-activitybar-harness` exit 0 ALL-PASS,
`behavioral-contracts.sh` exit 0 ALL-PASS, `bunx tsc --noEmit` exit 0, and the worktree is
clean at `215724d1`. The follow-up touches one smoke file; no production code moved, so the
main report's numbers stand.
