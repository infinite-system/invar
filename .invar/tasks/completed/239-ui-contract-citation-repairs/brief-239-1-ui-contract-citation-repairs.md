# Brief — #239: repair ui.invariants.md's rotted citations

Read first: `.invar/tasks/active/239-ui-contract-citation-repairs/task-239-ui-contract-citation-repairs.md`
— it enumerates all six edits with exact lines, and
`report-230-author-ui-lattice.md` in #230's completed folder carries the grep
evidence for each.

Contract-only, surgical: repoint three dead-symbol citations at the current
owners (verify each owner by reading the code it names — a repointed citation
that is also wrong is worse than the rot), fix the two `ui/` paths that
belong to `src/modules/editor/`, delete the duplicated selection paragraph.
Nothing else in the file changes.

Positive control: plant one wrong root-relative citation, quote the checker
naming it (`contract not found:`), remove it. Then the final pass.

## Invariants in scope

- `src/modules/ui/ui.invariants.md` — the six edit sites, named in the task.
- `src/modules/ui/ui.lattice.md` — every link must still resolve; quote the
  link count before and after (217 expected stable).

## Bycatch expected

Per AGENTS.md's taxonomy, all seven categories — comment drift especially:
you are reading the exact neighborhoods where three rots already lived; look
for their siblings. The READY report carries `## Bycatch` even if it reads
`None observed`.

## Verification

`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` at
zero problems, counts quoted. No production code. Do not run
`scripts/merge-gate.sh`. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose
STE-flavored.
