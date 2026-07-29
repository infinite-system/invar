# Brief — #288: every doc reference in task records is a resolving md link, mechanically

Read first: `.invar/tasks/in-progress/288-task-doc-link-lint-mechanical/task-288-*.md`
— the user's verbatim intent and the three deliverables.

Short form: build `scripts/tasks/lint-task-links.ts` (resolve-check all
relative md links; flag bare task/report/brief/probe references with the
suggested link; --fix rewrites unambiguous ones; both-polarity
self-test). Wire it: dispatch.sh + round-brief.sh REFUSE a failing brief
(same law as the two-section guard); [AGENTS.md](../../../../AGENTS.md) report contract gains
"lint links before READY" with the exact command; land.sh WARNS on
report dead links (legacy folders must not block landings). Record the
convention in the manage-tasks skill + [AGENTS.md](../../../../AGENTS.md). NO retro-sweep of
existing folders here — name it as the follow-up.

The linter is an instrument: it must fail loudly (planted dead link
reds, planted bare ref reds, clean file silent — quote all three runs).

## Invariants in scope

- manage-tasks skill contract; dispatch/round-brief guards; [AGENTS.md](../../../../AGENTS.md)
  report contract; #276's link-walk records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## End state (mechanical)

READY report: the linter with its three quoted control runs, the wired
guards each shown refusing/warning once, the recorded convention, green
`bun test`. The conductor gates at landing.
