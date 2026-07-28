# READY — Plugin canvas: Workspace stops knowing Git

Branch: `refactor-plugin-canvas-git`  
Commit: `3f6a00d6cba1e6ea2c1a5c9b0779de02dc37628c`

## Outcome

Git is now a default-composed plugin rather than a `Workspace` or app-core
capability. `GitPlugin` installs one `GitWorkspace` contribution per workspace;
that contribution owns repository discovery, watcher suspension/resumption,
per-document head state and diff projection, blame, log/panel state, commands,
status projection, and source-control UI.

`Workspace` exposes generic contribution ports and contains no Git import, type,
construction, field, command identifier, or other Git name. The production app
core composes only the generic `DefaultPlugins` application boundary and likewise
contains no Git name.

The pre-existing project invariant “The core is complete without plugins”
conflicted literally with the directed design, because it listed Git as a feature
that could not be supplied by a plugin. I refined it to “The host canvas is
complete without plugins”: the editor/workspace canvas remains useful with
`plugins: []`, while shipped domain capabilities may be default plugins without
being known by the host. This was a necessary explicit design decision, not a
half-application of the old record.

## Four contribution ports and their existing customers

1. **Document lifecycle and stable identity**
   - Port: `DocumentLifecycle`, carrying `DocumentHandle.Model` through
     `opened`, `becameActive`, and `closed`.
   - Customer 1: `GitWorkspace`, whose `Map<DocumentHandle, GitDocumentState>`
     owns head text and diff marks per stable handle.
   - Customer 2: the workspace language adapter, which opens, activates/syncs,
     and closes LSP documents from the same lifecycle.

2. **Per-document gutter decorations**
   - Port: `GutterDecorations`, whose contributors implement
     `byLine(handle)`.
   - Customer 1: Git modified/added/deleted line projections.
   - Customer 2: LSP diagnostic gutter marks and diagnostic ranges.
   - The diagnostics drive edits one TypeScript document in a Git repository
     and observes both the Git modified-line mark and red LSP diagnostic
     decoration through this one projection port.

3. **Status-bar segments**
   - Port: ordered `StatusBarSegments`.
   - Customer 1: the Git plugin's current-line blame segment.
   - Customer 2: `CoreStatusBarSegments` for the existing non-Git editor,
     position, language, encoding, and line-ending segments.

4. **Panes and popups**
   - Port: the existing `PaneContent`/`PanelHost` canvas and
     `BoundedListPopup`; no parallel host was introduced.
   - Pane customers: `GitPaneContent` and the existing
     `FileTreePaneContent`.
   - Popup customers: Git branch selection and the existing bounded
     buffer/list selectors.

Each port has an invariant record with Scope and all required fields. The
document-handle record's Impossible-if-true explicitly names cross-document
head/diff confusion.

## Mechanical boundary proof

Command:

```text
rg -n -i '\bgit\b' src/modules/workspace/Workspace.ts \
  src/modules/app --glob '*.ts' --glob '!*.test.ts'
```

Result: no output, exit `1` (no matches).

`scripts/conventions-gate.sh` now checks production `Workspace.ts` and app-core
TypeScript for concrete plugin imports, `Git*` names, or Git command/domain
identifiers. The rule is **enforcing**: a match sets `fail=1`; it is not a
report-only census. The full conventions gate exits `0`.

## Why the stale-head bug class is no longer expressible

The public gutter contribution contract requires
`byLine(handle: DocumentHandle.Model)`. `GitWorkspace` can reach a projection
only by looking up that exact stable handle in
`Map<DocumentHandle, GitDocumentState>`. Each `GitDocumentState` captures one
readonly handle and exposes only its own `decorationsByLine()`; there is no
workspace-wide `activeHeadText` slot and no API accepting one document together
with another document's head.

`GitWorkspace.test.ts` contains the compile-time counterfactual:
an unkeyed `contribution.byLine()` call is marked `@ts-expect-error`. Removing
the expected error makes `tsc` fail. `GitDocumentState.test.ts` also constructs
two stable handles and proves their head/diff state cannot cross-project.
Within the typed contribution route, the former error requires bypassing the
type system deliberately; it cannot be written accidentally in the old shape.

## Lifecycle and activation measurements

An unresolved paint barrier was used while alternating between two plugin-backed
workspaces for 101 switch-path samples:

- median synchronous switch cost: `0.005083 ms`
- p95 synchronous switch cost: `0.021792 ms`
- maximum synchronous switch cost: `0.141459 ms`

The driven workspace-tabs fixture measured:

- tiny tree: `2` bulk ignore queries, `5` retained watches
- wide 500-directory tree: `2` bulk ignore queries, `522` retained watches

Repo width therefore does not increase ignore-query subprocess count; it remains
depth-bounded. The brief's historical `9/8/6` counts came from different fixture
depths; those exact three fixtures are not in the current workspace-tabs harness.
The current required tiny-versus-wide harness reports the exact `2/2` result
above.

The same drive proves:

- the selected workspace frame paints before the watcher walk completes;
- completed deferred work retains the watcher-identity check;
- two open workspaces own exactly one live `GitWatcher`;
- the completed wide walk repeats the same depth-bounded query count.

`GitWorkspace` obtains `nextViewPaint()` before watcher establishment and passes
that barrier into `GitWatcher`. Establishment, reconciliation, and refresh
continue only after paint, and deferred callbacks compare watcher identity before
applying.

## Verification and exact exit codes

Required gates:

| Command | Exit |
| --- | ---: |
| `bunx tsc --noEmit` | 0 |
| `bun test` | 0 |
| `bun scripts/check-file-grammar.ts` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | 0 |
| `bash scripts/conventions-gate.sh` | 0 |
| `bun scripts/check-coverage-ratchet.ts` | 0 |
| `bash scripts/behavioral-contracts.sh` | 0 |

Unit result: `1359 pass`, `0 fail`, `15968 expect()` calls across 217 files.
Invariant refs: `704` annotations resolved, `45` lattice links resolved,
`0` problems. Behavioral contracts report `ALL-PASS`, including
`idle-quiescence` and `pane-independence`.

Repeated driven smokes:

| Smoke | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| `scripts/smoke-gutter-diff.sh` | 0 | 0 | 0 |
| `scripts/smoke-git-watch.sh` | 0 | 0 | 0 |
| `scripts/smoke-git-log.sh` | 0 | 0 | 0 |
| `scripts/smoke-git-blame.sh` | 0 | 0 | 0 |
| `scripts/smoke-diagnostics.sh` | 0 | 0 | 0 |
| `scripts/harness/smoke-workspace-tabs-harness.ts` | 0 | 0 | 0 |

The diagnostics smoke passes for both `tsgo` and
`typescript-language-server`.

Additional hygiene:

- `git diff --check`: exit `0`
- `git status --porcelain=v1`: exit `0`, no output
- `git ls-files | grep '^TASK'`: exit `1`, no matches
- post-commit core Git grep: exit `1`, no matches

## Capsule track / unproved items

No membrane or capsule concept was needed, and no partial #33 capsule work was
introduced. The extraction is completed entirely with the four justified
contribution surfaces and the already-landed pane/popup seams.

All requested behavior was proved. The only measurement qualification is the
historical fixture-count difference documented above: the present repository's
tiny/wide smoke has two directory depths and therefore reports `2/2`, rather
than the brief's older `9/8/6` fixture series.
