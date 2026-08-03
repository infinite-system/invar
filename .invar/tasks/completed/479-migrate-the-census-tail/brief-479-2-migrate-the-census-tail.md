# Brief #479 round 1 — migrate the census tail

## In plain words

The census found about 125 waits that are already true when issued, so they
return stale frames and flake under load. The graph now reaches the model
facts those waits should observe. Convert them, worst first.

## Read first

1. [task-479](task-479-migrate-the-census-tail.md)
2. [the census](../../completed/470-harness-wait-defect-census/census-470-harness-wait-defect-census.md) — the work list, per-site evidence
3. [the 471 report's migratable table](../../completed/471-graph-reaches-the-whole-app/report-471-graph-reaches-the-whole-app.md) — live paths per census fact
4. [the drive-pty skill](../../../../.claude/skills/drive-pty/SKILL.md) — the wait discipline

## Order of attack

1. Round 1 (task 478, LANDED) already did the five positive controls and
   panel-chrome. Your FIRST targets: smoke-plugin-manifest-harness.ts (14
   class-1 sites, census-named) and smoke-scrollbars-harness.ts — the live
   gate flakes. Both arms per converted control.
2. Then the Quick Open idiom files (bracket-match, git-blame, image-preview,
   breadcrumb, diagnostics) — one fix shape, six sites.
3. Then the class-1 tail, file by file. Class-3 sleeps only where the
   condition is obvious. DECLARE every wait-count decrease in
   [project.coverage-deltas.md](../../../../project.coverage-deltas.md) — round 1 forgot one and the ratchet caught it.
4. Sites the census marks "no model path" that #471 did NOT unlock: fix the
   pre-satisfaction on the screen (wait on what CHANGES), do not invent paths.

Run each touched smoke after converting it. If the full sweep is too large
for one round, STOP CLEANLY at a file boundary and report exactly which
files are done and which remain — a partial migration honestly stated beats
a rushed total.

## Invariants in scope

- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md)
- [Every wait names itself](../../../../scripts/harness/harness.invariants.md)
- [Async-published state is always awaited](../../../../scripts/harness/harness.invariants.md)
- [The composition graph reaches every installed contributor](../../../../src/modules/system/system.invariants.md) — new record, the paths you migrate onto
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, even when None observed.

## PTY usability — still tracked

Report the `## PTY usability` section: easy, confusing, missing.

## Verification

Every touched smoke run green; `bun test` FULL; `bunx tsc --noEmit`;
`bash scripts/conventions-gate.sh`; checker `--all` and `--refs`.
Do NOT run scripts/merge-gate.sh. Commit with SKIP_GATE=1.

## End state

A report file in this folder, number-first, opening with `## In plain words`,
with the files-done/files-remaining table, invariant verdicts, bycatch, and
PTY usability.
