# Brief — #220: the editor registers as a contributor with a manifest

Read first, in order:
1. `.invar/tasks/active/220-editor-registers-as-contributor-with-manifest/task-220-editor-registers-as-contributor-with-manifest.md`
2. `report-219-...md` in #219's completed folder — `SourceTextPaneContent`,
   `PaneProjection`, and the release path (`releaseSourceTextViews`) you will
   wire to uninstall. Boundary 2 there (scrollbar projection getters) stays
   out of scope unless registration forces it; report if it does.
3. #114 Wave B reports — `registerPaneRuntime` precedent, `releasePane`,
   uninstall symmetry with positive controls.

## The objective

The editor becomes a registered contributor: a manifest, registration through
`ApplicationContributionContext`, default occupancy of the editor column
expressed as a default rather than host knowledge. Uninstall symmetry is
mandatory: disabling the editor releases every view and surface it built
(#219 built the path; you wire and prove it). A planted leak must red the
manifest smoke, the way Wave B's status-projection and pane-release plants did.

Done-test, quoted before and after — all three #122 censuses for
`modules/editor/`, including the three invariant citations (they zero when the
host stops consuming editor geometry; if any citation remains, name the
consumer and why it is honest).

## Hazards

- The fourth verse of the folder/comment/order/habit lesson: any host branch
  you remove carries a rule — write its invariant first.
- Fingerprint contract at 10/100k/500k, #218's gesture, unchanged.
- "Disabling the editor" must leave the app usable and honest: an empty editor
  column with a stated affordance, not a crash and not a blank lie (Wave B's
  degraded-affordance precedent).
- #228 (keyboard routing) is filed and NOT yours. The pane still declares no
  keybinding context; leave it.

## Verification

Exact exit codes: tsc, bun test, conventions-gate, prettier, check_invariants
(at or above 972/67/0), coverage ratchet. Drive the manifest smoke including
the new uninstall arms; every smoke you cite must be driven green before your
first edit too. Scratch tooling per AGENTS.md: your task folder, full names,
header comments.

Do not run `scripts/merge-gate.sh`. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Leave the tree
clean. Prose STE-flavored. Report bycatch explicitly.
