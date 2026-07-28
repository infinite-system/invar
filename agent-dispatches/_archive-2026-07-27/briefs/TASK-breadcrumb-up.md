# TASK — Breadcrumb drill-down needs a visible upward step (#87)

You are a builder on the Invar terminal IDE. Work ONLY in this worktree. Do NOT run
`scripts/merge-gate.sh`, do NOT push, merge, tag, or delete branches — the conductor does that.
Commit to this branch when done with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`,
leave the worktree clean (`git ls-files | grep '^TASK'` must return nothing), and report to
/tmp/breadcrumb-up-READY.md.

## House rules

- Full descriptive identifier names, no abbreviations. `.prettierrc`, 80 columns.
- `Static()`/`Reactive()` ivue conventions, `protected` floor, late-read discipline,
  file-name-follows-class, `X.interface.ts` for contracts.
- Read `src/modules/ui/ui.invariants.md` and `src/modules/theme/theme.invariants.md` BEFORE editing,
  including Rejected-alternatives.
- Every wait observes the condition its assertion reads. No bare sleeps, no vacuous predicates, no
  clock-based silence assertions, and never wait on FRAME PRODUCTION — a no-op keystroke emits no
  frame under the idle-quiescence contract, which cost three gate retries tonight.
- Another builder is editing `scripts/smoke-*.sh` and `scripts/harness/*` right now, and a third is in
  `src/modules/{workspace,git}`. Keep your diff to the breadcrumb/popup UI and its own smoke.
- Invariant record for the new affordance with every field including **Scope**; verify the checker with
  EXIT CODES, never a log tail.
- Run and report exact exit codes: `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`,
  both invariant checker passes, `bash scripts/conventions-gate.sh`,
  `bun scripts/check-coverage-ratchet.ts` (declare any assertion decrease WITH COUNTS in
  coverage-deltas.md — the checker now verifies the declared numbers), and every smoke you touch three
  times.

## The task

USER-DIRECTED (2026-07-26), verbatim: "the Breadcrumb dropdown drill down should have a back button to
go back to the folder above in the hierarchy, so drill upwards back haha".

WHAT EXISTS. #66 landed the breadcrumb segment picker: clicking a breadcrumb segment opens a searchable
popup of that folder's contents. The shared `BoundedListPopup` already drills BOTH ways by keyboard — its
smoke asserts "Right drills into the selected directory without dismissing", "Left drills back out one
filesystem level", and "Enter re-roots the shared popup without dismissing it".

THE GAP is discoverability, not capability. A user who opened the popup by CLICKING has no visible way
back up; the only upward exit is a key they cannot see. That is the same defect class as the panel-heading
controls before #68 — the mechanism existed, the affordance did not.

REQUIRED:

1. A visible upward control in the popup's own chrome, so the whole drill path is reachable by mouse.
   Resolve its glyph through `ThemeIcons` at all three tiers rather than hardcoding a character. It must
   measure exactly one display cell under `EditorCoordinates.Class.lineWidth` at every tier and must not
   collide with any reserved mark: `▎` (diff bar), `●` (dirty), `❯` (separator), `↗`/`↙` (panel
   expand/restore), or the activity glyphs `☰ ⑂ ⊞ ⚲ ⚙`.
2. It must be the SAME operation as the existing Left key, not a parallel implementation. One generator
   for "move up one level", driven by key and by click. If the click path calls something Left does not,
   the seam is drawn wrong — that is the whole point of this task, not an aside.
3. State what happens at the workspace ROOT: the control must be absent or visibly inert, never present
   and silently dead. A control that looks live and does nothing is worse than no control.
4. Preserve the popup's existing contracts: stepping up must NOT dismiss it; decide and state whether the
   search query is cleared or preserved and why; and leave selection somewhere sensible — the folder just
   left is the obvious choice so the user can step straight back down.

VERIFY BY DRIVING:
- Click the control from two levels deep: assert the popup re-roots upward WITHOUT dismissing.
- Assert Left and the click produce IDENTICAL published state (same folder, same item set). That is the
  assertion that proves one generator rather than two, so do not skip it.
- Assert the root case behaves as you specified.
- Assert the popup still opens and dismisses exactly as before.
- Address the control by its PUBLISHED GEOMETRY, never by hunting for its glyph text. The panel-heading
  smokes were decoupled that way in #68 and two more smokes tonight; a test that finds a control by its
  appearance re-breaks on every vocabulary change.
