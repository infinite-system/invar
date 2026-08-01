# Navigation — Invariants

Load-bearing rules for `src/modules/navigation/` (`NavigationHistory`) and its wiring into
`Workspace` (Go Back / Go Forward). Stands on `project.invariants.md`.

## Reality-based invariants

_None specific to navigation — it consumes the project reality invariants (a referenced resource
stays alive; bounded memory) rather than adding its own._

## Chosen invariants

### Programmatic history navigation does not record new history

**Invariant:** If history replays a registered editor-area view state, then the restore records no
new entry and truncates no forward history; only a fresh user navigation records a state.

**Scope:** `NavigationHistory` registration, capture, and replay; the `Workspace` capture points;
and the source editor, Git comparison, and Markdown preview history contributors.

**Mechanism:** Each contributor owns `captureCurrentState`, `restoreState`, and `samePlace` for its
opaque payload. `NavigationHistory.navigate` runs any restore through `runWithoutRecording`, so
`recordCurrentState` ignores capture calls from every contributor until replay ends. A fresh state
truncates entries after `currentIndex`; the source editor alone collapses same-document, same-line
cursor drift. An absent contributor or rejected payload removes that dead entry and navigation
continues.

**Generates:** One trail across editor-area view kinds; escapable back and forward walking; a
forward trail discarded by a fresh branch; a 100-entry bound; distinct entries for each opened Git
comparison; same-line source cursor collapse; dead entries that cannot trap navigation.

**Evidence:** `src/modules/navigation/NavigationHistory.test.ts` (`replay suppresses recording by
every contributor`, truncation, collapse, cap, and rejected-entry tests);
`src/modules/workspace/Workspace.navigation.test.ts` (`a programmatic back/forward does not itself
record new history`); `src/modules/git/GitWorkspace.test.ts` (`forty opened comparisons produce
forty distinct history entries`); `src/modules/markdown/MarkdownWorkspace.test.ts` (`restores a
rendered Markdown view between source editor states`);
`scripts/harness/smoke-navigation-history-harness.ts` (Alt+Left/Right and the protocol-safe
fallbacks drive file to comparison to file, then back and forward through all three states in the
real PTY).

**Impossible if true:** Back from a source file skips an available Git comparison; a replay adds an
entry; a new branch keeps its old forward trail; one comparison replaces another comparison's
entry; a missing contributor leaves a permanent dead target; cursor drift on one source line grows
the stack.

**Verification:** `bun test src/modules/navigation/NavigationHistory.test.ts src/modules/workspace/Workspace.navigation.test.ts src/modules/editor/EditorNavigationHistoryContribution.test.ts src/modules/git/GitWorkspace.test.ts src/modules/markdown/MarkdownWorkspace.test.ts && bun scripts/harness/smoke-navigation-history-harness.ts`

**Status:** provisional

**Last refined:** 2026-08-01
