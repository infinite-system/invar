# Brief #90 round 1 — test-isolation census, then per-run diagnostic provenance

Read [CLAUDE.md](../../../../CLAUDE.md) and [AGENTS.md](../../../../AGENTS.md) fully first. Load the /invariants skill
before governed work. Reason with IBR.

## The user's order (verbatim intent)

"Test isolation is critical — find out every instance where we are
violating test isolation and writing to the same file polluting the
results." Then fix the artifacts log provenance defect that #337 measured.

## Part 1 — the census FIRST (deliverable even if the fix stalls)

Enumerate every shared mutable path the harness and smokes touch
concurrently. Known classes to sweep (add what you find):
- relative-path logs written from the app cwd (the artifacts tui log —
  every boot in every worktree appends to one file; #337 measured foreign
  lines in a reader's newest-boot slice, 2/2 concurrent pairs);
- fixed /tmp names (status files, fifos, sockets, quiet-lock journal);
- shared HOME or settings paths not per-run mktemp'd (the smoke-isolate-
  persisted-HOME lesson);
- .perf-history appenders (gate-retries ndjson) under concurrent gates;
- fixed ports.
For EACH: who writes, who reads, per-run-isolated or shared, and whether
pollution can flip a verdict — false green AND false red both count. Use
#337's method: plant a foreign line/file, watch the reader accept or
reject it. Every check needs both polarities. Deliver the census as a
table in the report.

## Part 2 — the fix, worst class first

1. Instance identity for the diagnostic log: per-run path (environment
   override) or instance-tagged lines — pick the seam that keeps every
   existing reader working, and migrate the readers (scrollbars +
   plugin-manifest smokes both read it; both set the debug-bars flag).
2. Provenance guard in the readers: reject lines that are not this
   instance's; positive control = plant a foreign line, watch it rejected.
3. Fix any OTHER verdict-flipping shared write the census finds; smaller
   pollution (report-only) gets filed in the report, not chased.

## Rules

- Do NOT run scripts/merge-gate.sh yourself; do NOT use SKIP_GATE. Commit
  through the hook; a GATE_EXIT=0 chain is part of DONE. Known flaky
  pre-existing classes: #214 panel-chrome, #359 panel-split, #362
  markdown preview clipping — name them if they bite, do not chase.
- Builders never push; the conductor lands.

## Invariants in scope

- [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md) — "The terminal emulator is the
  harness screen oracle" (#337 proposed refinement: the debug-log side
  source is named nowhere), "Harness app homes are complete and isolated",
  "Every wait names itself". Answer record by record: upheld / violated /
  needs refinement, plus records this list missed. The oracle record
  likely needs the refinement #337's report drafted — propose its wording.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy. Include a ## Bycatch section
even when it reads: None observed.

## Definition of done

READY report in this folder, standard naming (report prefix, number 90,
the task slug, md extension): the census table with both-polarity
evidence, the fix with positive controls, gate chain, invariants answered,
bycatch. Commit BEFORE writing READY state into the report; the report's
header carries the real commit hash and GATE_EXIT, never placeholders.
