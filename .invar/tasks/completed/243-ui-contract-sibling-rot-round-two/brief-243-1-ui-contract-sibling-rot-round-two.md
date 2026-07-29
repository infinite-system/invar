# Brief — #243: three more drifted citations, and the exhaustion question

Read first:
`.invar/tasks/in-progress/243-ui-contract-sibling-rot-round-two/task-243-*.md`
— the three sites with exact lines, from #239's bycatch (its report in the
completed folder carries the grep evidence).

Same method as #239, which is the precedent to copy: read each replacement
owner's code before the edit (a repointed citation that is also wrong is
worse than the rot), AST-verify ownership, one planted positive control
(wrong root-relative citation, quote the checker naming it, remove it),
zero problems and stable lattice-link count after.

NOTE the world moved since the task was filed: #219/#220/#35/#245 may have
relocated more owners. Verify each of the three against CURRENT main, and
read the neighborhoods for siblings — round one found six, round two found
three; the trend is the question. Your report must answer: is rot exhausted,
or is the honest next step a systematic sweep (every citation AST-verified)
as its own task?

## Invariants in scope

- [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — the three sites, plus any siblings
  your reading finds.
- [src/modules/ui/ui.lattice.md](../../../../src/modules/ui/ui.lattice.md) — links stable (217) after, counts quoted.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy — comment drift above all; you are reading rot's
favorite neighborhoods. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Verification

`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
at zero problems, counts quoted before and after. Contract-only: no
production code. Do not run merge-gate. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose
STE-flavored.
