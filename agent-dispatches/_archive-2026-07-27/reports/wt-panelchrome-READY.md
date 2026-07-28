# READY — Panel chrome wave 2

Branch: `feat-panel-chrome`

Commit: `8722f6682ffa3781c49265f69a8fac1e34b704e3` (`feat: add multi-instance panel chrome`)

Rebase / ancestry:

- Fetched `origin` and rebased onto `origin/main`; branch was already up to date.
- `origin/main`: `945218489fa1d2b060d01b94aae02ca081610048`
- `git merge-base --is-ancestor origin/main HEAD`: PASS
- Commit parent and merge base both equal the verified `origin/main` hash above.

Delivered:

- Shared right-aligned panel heading controls: Add dropdown, Expand/Restore, and per-region Close.
- Add reuses `BoundedListPopup` and creates independent Terminal/Agent instances.
- Registered hidden instances remain selectable in the docked contents list; list close disposes only
  the selected session.
- Expanded panel replaces the editor-center rows while leaving both dock geometries unchanged and
  restores the exact prior panel height.
- Unexpanded panel drag reaches the one-editor-row maximum.
- UI, layout, and terminal invariant contracts and their evidence were updated.
- Added `smoke-panel-chrome-harness.ts` to the merge gate.

Verification:

- `bash scripts/merge-gate.sh`: ALL-PASS.
- Full PTY smoke phase passed, including panel chrome, panel split, layout, agent, agent pane UX,
  agent engine/permissions/search, terminal, terminal staging/follow, and paste harnesses.
- Performance instruments ran with valid measurements; one soft pre-existing budget target miss was
  reported non-blocking by the gate.
- `bash scripts/conventions-gate.sh`: PASS after the final rebase.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 0 problems after rebase.
- Focused panel/layout/factory suite: 56 pass, 0 fail after rebase.

Worktree state: clean except the task-provided untracked `TASK.md`.

No push, merge, tag, or branch deletion was performed.
