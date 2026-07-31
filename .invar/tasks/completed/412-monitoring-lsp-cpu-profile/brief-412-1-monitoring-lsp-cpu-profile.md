# Brief 412-1 — LSP CPU profile rows in the Monitoring plugin

User request (verbatim): "monitor should include LSP cpu profile, and
not just for tsgo, any potential one as well, possible?"

Read the task file in this folder first — its Design direction section
is the spec. Key constraints, restated:

- Pids come from the LSP manager's spawn registry (the single spawn
  path). NEVER grep the process table by name.
- CPU% is a per-tick delta of utime+stime from /proc/<pid>/stat,
  CLK_TCK scaled over the window. NEVER ps %cpu (lifetime average).
  Also show RSS.
- A dead server shows GONE, not 0% — different facts.
- Generic: any registered server appears. Keep the /proc sampler
  behind an interface so a macOS ps-based one can slot in later;
  Linux ships now.
- Inner loop is DRIVING: run the real app, open the Monitoring view,
  watch tsgo idle near 0 while you type in a TS file and see it rise.
  Iterate until the rows read true. Write the contract test AFTER the
  symptom-free drive, to lock it in: fixture-driven, both arms (a
  busy child rises, an idle child reads ~0), count/ordering based,
  no wall-clock thresholds.
- Do NOT run scripts/merge-gate.sh. Do not push. Commit on your
  branch; write the READY report into this folder.
- ivue conventions per the /ivue skill for any UI class work; follow
  [AGENTS.md](../../../../AGENTS.md) fully.

End state: report file exists here; Monitoring view shows a live LSP
section (server name, pid, CPU% over window, RSS, GONE state); the
two-arm contract passes; real-app drive described in the report.

## Invariants in scope
- Check [src/modules/lsp/lsp.invariants.md](../../../../src/modules/lsp/lsp.invariants.md) if present, and the monitoring plugin's contract if one exists; answer record by record in the report. If neither implicates, say so and refute or confirm.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) bycatch taxonomy; include a ## Bycatch
section even when it reads: None observed.
