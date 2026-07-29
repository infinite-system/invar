# Brief — #122: the editor becomes the final contributor (capstone extraction)

Read first, in order:
1. `.invar/tasks/active/122-editor-becomes-final-contributor/task-122-editor-becomes-final-contributor.md`
2. `.invar/tasks/completed/114-modularity-umbrella-provider-runtime/` — Wave B's brief
   (`brief-114-2-...`) and BOTH reports. All conventions there apply verbatim. Wave B built
   the seam you will use: `PaneRuntime` / `PaneRuntimes`, `PaneContent.capability`,
   `claimsContextAction`, pane-declared keybinding contexts, `registerPaneRuntime` on
   `ApplicationContributionContext`.
3. `project.decisions.md` — the Wave B design decision and the agent-profile reasoning.

## The objective

The source-text view stops being a privileged built-in. It becomes an ordinary contributor
that happens to occupy the editor column by default. Done is mechanical, by the same
standard git, LSP, and the terminal already meet: `modules/editor/` host references go
4 → 0.

Run THREE censuses, before and after, and quote all three (the mechanical string count
under-reports — that is the #114 bycatch):

```sh
grep -rln "modules/editor/" --include='*.ts' src/modules/app src/modules/workspace src/modules/ui | grep -v '\.test\.'
grep -rn "from ['\"][^'\"]*\.\./editor/" --include='*.ts' src/modules/app src/modules/workspace src/modules/ui | grep -v '\.test\.'
# third: name the editor's host-facing classes the way Wave B named TerminalPaneContent etc., and grep for them, tests included
```

## Known hazards, from the record

1. **A rule that exists only implicitly dies in the generalisation that removes it.**
   Wave B's regression was a hand-written action-name list that silently enforced "a
   focused pane consumes only its own scoped bindings". Before you delete or generalise any
   host branch that special-cases the editor, write down what rule that branch enforces,
   then check an invariant records it. If none does, add the invariant FIRST.
2. **Uninstall symmetry covers panes, not only registrations.** Wave B's second defect. If
   the editor contributor can be disabled, disabling it must release everything it built.
   If disabling the editor is not meaningful, say so and record the decision instead of
   building a hollow uninstall path.
3. **`modules/agent/` is imported at ~25 host sites** (Bootstrap.ts, RootView.ts,
   AppStatusProjection.ts) despite scoring 0 on the string census. If your extraction
   collides with those sites, report the collision; do not extract the agent pane — that is
   #35's proof-of-seam territory and later work.
4. **Scale parity is the app's name.** The editor is the hottest path in the product. Drive
   at 10 lines and at 100k/500k before and after, and compare the fingerprints. The
   flyweight (#196/#203/#202) is what made this extraction reachable; do not regress it.
   `bufferLiveCount` behaviour at 3 clean tabs is now an exact-count contract (= 2).

## Method — Rule Zero

Drive the real app first: open, edit, scroll, fold, tab-switch, find, diff. Then extract.
Then drive again. Contracts after the extraction holds. One instrument at a time.

## Verification

Everything Wave B's report quotes, exact exit codes: tsc, bun test, conventions-gate,
prettier --check, check_invariants (stay at or above the current 945/67/0), coverage
ratchet. Plus the three censuses above and the before/after drive fingerprints at both
scales.

Do not run `scripts/merge-gate.sh`; commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
Write prose per `.claude/skills/ste-expression/SKILL.md` (flavored). Report bycatch
explicitly. Report to `/tmp/122-editor-becomes-final-contributor-READY.md`.
