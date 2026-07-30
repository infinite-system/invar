# Summary — #323 quit confirmation dialog

Landed: e8e57083 (merge of afcaef70), 38 minutes dispatch-to-landing.
Builder: codex / gpt-5.6-sol / high.

## What happened

Quit (Ctrl+Q, Cmd+Q, F10, Quit command) now routes through one modal
confirmation at the shared overlay seam. No is the default; Yes is the
only product path to shutdown; negative answers preserve buffer, cursor,
and dirty state. The dialog is now the quit guard — the old path exited
at once with no dirty-file check.

The brief's hard warning (harness teardown must survive the
confirmation) was answered by design, not by accident: teardown-only
Ctrl+Q rides INVAR_HARNESS_DIRECT_QUIT=1; Drive and the quit contract
force 0. The builder ran the positive control in both directions and
quoted the red. Landing verified the two-way control before merging.

## What the conductor got wrong / friction

- Nothing refuted in the report.
- Main had moved with #329's code since this branch's base. Instead of
  a hold-and-regate (blocked anyway by the live #322 builder), the
  landing verified the file-set intersection mechanically (comm empty)
  and recorded that in the override reason. Disjointness plus the
  branch-tree green was the deliberate exception.
- Session archive failed UNRESOLVED again (second in a row). Root cause
  found and FIXED in dispatch.sh: the codex arm did a single immediate
  scan while rollouts appear ~15s after launch; it now waits on the
  same bounded window as the claude arm. The next dispatch is the
  positive control for the fix.

## Left undone (converted, not dropped)

- #331 filed: ui.lattice.md hand-written record count drift (61 vs 63).
- #332 filed: smoke-tabs.sh frozen close glyph off the panelClose seam
  (legacy tmux tier, unrun by the gate).
- #214 census extended (37th-39th pool events).
