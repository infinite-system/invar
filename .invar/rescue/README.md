# Rescued scratches from retired /tmp worktrees — 2026-07-29 02:5x

Swept before worktree removal (user request). Each folder is named for the
/tmp worktree it came from and holds ONLY its uncommitted files. The branches
themselves are parked, never deleted.

- `conductor-activitybar/` — ActivityBar.ts + test. Main HAS ActivityBar.ts;
  this is a probably-superseded draft. Kept because diffing is cheaper than
  regret.
- `conductor-shortcuts/` — ShortcutsView.ts + test. Main has NO
  ShortcutsView; possibly unlanded work (a shortcuts pane predating the
  shortcut-help agent worktree).
- `conductor-quickopen/`, `conductor-ripgrep/` — early `src/modules/search/`
  QuickOpen drafts from before the search module landed by another path.
- `foldfeel-round3-old-e07314b/` — a bisect-era mutation of Momentum.ts as a
  patch; almost certainly probe noise, kept as a patch only.

Judge by content, not provenance: anything wanted here should be re-landed
through a task; the rest can be deleted with this folder when the user says.
