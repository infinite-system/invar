# 288 — every doc reference in tasks/briefs/reports is a resolving md link, mechanically

State: COMPLETED — 6e83766e — record links lint mechanically; dispatch and round-brief refuse dead references
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: USER-DIRECTED (2026-07-29 12:1x, verbatim intent)

## Outline

User: bare references like "report-237-...md, Bycatch 3" should be REAL
md links you can click (the #276 walkability made them walkable — now
make them exist); ALL briefs/tasks/reports use md links for referenced
docs; and the check is MECHANICAL on both sides: the conductor cannot
file a task/brief with dead or bare references, and a builder cannot
submit a report without linting its links.

Deliverables:

1. **The linter** (one script, e.g. scripts/tasks/lint-task-links.ts):
   given a task-folder file, (a) every relative md link resolves to an
   existing file; (b) bare references to task/report/brief/probe files
   (regex classes: task-N-, report-N-, brief-N-, probe-N-, *.md,
   *.invariants.md) that are NOT already links are flagged with the
   suggested link; (c) --fix mode rewrites bare references it can
   resolve unambiguously. Both polarities self-test: a planted dead link
   reds; a planted bare reference reds; a clean file passes silently.
2. **Wire the guards**: dispatch.sh and round-brief.sh refuse a brief
   that fails the lint (same law as the two-section guard); the
   [AGENTS.md](../../../../AGENTS.md) report contract gains "lint your report's links before
   READY" with the exact command; land.sh warns (not refuses) on a
   report with dead links, so legacy folders do not block landings.
3. **Convention recorded** in the manage-tasks skill + [AGENTS.md](../../../../AGENTS.md): all
   doc references in task records are md links, written relative to the
   file they sit in.

Do NOT retro-sweep all ~285 existing folders in this task — that is a
follow-up sweep once the linter exists (name it in the report).

## Invariants in scope

- The manage-tasks skill contract; dispatch/round-brief guard records;
  [AGENTS.md](../../../../AGENTS.md) report contract; #276's link-walk records (the consumer this
  serves).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- User message 2026-07-29 12:1x; [#276](../276-task-md-links-walkable/task-276-task-md-links-walkable.md).
