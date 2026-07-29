# Brief — #202: tab re-activation re-reads the whole file (USER-DIRECTED)

Task file: `.invar/tasks/active/202-tab-reactivation-rereads-whole-file/` — read it
fully first; it carries the user's own diagnosis, the mechanism, the falsifiable
check, and the ranked repairs. This brief adds procedure only.

## Order of work

1. **Run the falsifiable check FIRST**, by driving the real app (Rule Zero):
   dirty tabs are never dehydrated, so a dirty round trip must be instant while a
   clean round trip on a large fixture pays a full reload. Measure both arms and
   quote the asymmetry. If it is absent, STOP and report — the diagnosis is
   wrong and the fix would be built on a false frame.
2. Implement repair 1 — **a bounded hydrated set** (N most-recently-active
   documents stay hydrated; alternating between two files becomes free; memory
   bounded by N). Full descriptive names; make N a setting only if a natural
   settings home already exists, otherwise a named constant with the reasoning.
3. Do NOT attempt repair 3 (streaming/lazy line index) in this task — it is the
   deepest fix but a separate project (it pairs with launch-time/RSS work in
   #205/#175). If your measurements make repair 2 (persisted derived geometry)
   cheap and safe, you may note it as a follow-up; do not build it here — its
   stale-cache failure mode is silent mis-rendering.

## The contract (counts, not milliseconds)

Add a behavioural check: full-document reads per switch cycle must not grow with
file size, and for a re-activated recent buffer must be ZERO. Positive control
required: a reload-counting check that can only fail toward "pass" when its
counter never increments is not an instrument — plant a forced dehydration (or
drop the hydrated set to size 0) and show the check goes red, then restore.

## Verify by driving

Drive the real user path at real scale (the existing large fixtures — 100k and
500k line corpus): open two large files, alternate tabs repeatedly, then the
dirty/clean asymmetry from step 1 — after the fix the clean round trip within
the hydrated window must match the dirty one. Also confirm background-memory
boundedness is not regressed: many-tab idle RSS must not grow unbounded (that is
what the flyweight bought; do not sell it back).

## Standard verification

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`bunx prettier --check .`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` —
quote exact exit codes, never `$?` after a pipeline.

## Repo rules

- Prettier gate is live; the pre-commit hook formats staged files. 80 columns.
- Full descriptive identifier names, no abbreviations.
- ivue conventions per [AGENTS.md](../../../../AGENTS.md) (Static-manifest shape, `$Class` anchor rule).
- Invariant records at `src/modules/<domain>/<domain>.invariants.md`, cited by
  root-relative path. Update editor/workspace records your change implicates.
- Do not run `scripts/merge-gate.sh`; commit with
  `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
- Another builder is live on `src/modules/terminal/` (#114). Do not touch the
  terminal module; if your seam forces a terminal-side edit, report it as a
  finding instead of making it.
- Report bycatch explicitly; write the report to
  [/tmp/202-tab-reactivation-rereads-whole-file-READY.md](../../../../../../../../../../../tmp/202-tab-reactivation-rereads-whole-file-READY.md) when done.
