# Brief — #219: retrofit the source-text view onto the PaneContent seam

Read first, in order:
1. `.invar/tasks/active/219-source-text-view-onto-pane-content-seam/task-219-source-text-view-onto-pane-content-seam.md`
2. `.invar/tasks/completed/218-workspace-buffer-splits-document-from-view/report-218-...md`
   — "The boundary I stopped at" maps your starting line exactly. Read it twice.
3. `.invar/tasks/completed/114-modularity-umbrella-provider-runtime/` — both reports:
   the seam vocabulary (capability, claimsContextAction, releasePane) and both
   regression lessons.

## The objective

The editor renders through the pane seam like every other citizen. #218 left two
view seams: `PaneContent` (renders StyledText for a region) and `SourceTextView`
(does not render; RootView mounts native OpenTUI renderables and drives native
selection and the native caret directly).

#218's builder recommends, and I endorse as the starting hypothesis:
**`SourceTextView` stays as the source-text SPECIALISATION that a `PaneContent`
may also implement** — do not rewrite the native render path into StyledText.
The seam should express "this pane owns native renderables" as a capability,
the way `terminal-commands` is a capability. You may refute this with evidence;
say so plainly if the fold-in reading turns out cheaper or truer.

## Hard constraints

1. **The fingerprint is the contract.** `documentLineReads / foldProjectionLookups /
   wrapProjectionLookups / layoutComputations` identical at 10/100k/500k, before
   and after, same gesture set as #218's report. The editor is the hottest
   surface; a seam that costs a frame is a wrong seam.
2. **The #114 lesson, both layers**: before deleting any RootView branch that
   special-cases the editor, write down the rule it silently enforces and check
   an invariant records it. Add the invariant FIRST. And uninstall symmetry is
   #220's to wire, but the seam you build must make releasePane expressible for
   editor views (#218's viewsByLiveBuffer already enumerates them).
3. **Native selection and the native terminal caret must keep working** — driven,
   not asserted: mouse selection, copy, caret placement at both scales.
4. Drive before and after per Rule Zero. Use #218's workaround for the broken
   drive on-ramp: directory workspaces outside the repo, open via the tree
   (`scripts/make-scale-workspace.ts`; see its report, Scale parity).
5. Do not start #220 (manifest/registration). Report the boundary.

## Verification

Exact exit codes: tsc, bun test, conventions-gate, prettier --check,
check_invariants (at or above 957/67/0), coverage ratchet, moved tests declared.
Positive control for every new guard or seam rule. Smokes you drive green must
also have been driven green BEFORE your first edit, so silence is a comparison.

Do not run `scripts/merge-gate.sh`. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Leave the tree
clean. Prose per `.claude/skills/ste-expression/SKILL.md`, flavored. Report
bycatch explicitly.
