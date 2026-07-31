# READY — Monitoring LSP contract records

Task: #425 (monitoring LSP contract records)

Commit: `c25cc900fd49a4ada79ec79605b18f88204bdf39`

## Outcome

The two proven LSP monitoring disciplines now have separate provisional records.

- [The LSP contract](../../../../src/modules/lsp/lsp.invariants.md) now records that monitored server
  identity comes only from the owning `LanguageClient` through `LanguageServerProcessRegistry`.
- [The Monitoring contract](../../../../src/modules/monitoring/monitoring.invariants.md) now records
  that a missing process sample reads `GONE`, never idle `0%`.
- The existing runtime-delta record now covers registered child processes, `ProcessSampler`, and
  `MonitoringStats`.
- Six new annotations point from the enforcement sites back to these records. The reference count
  increased from 1,302 to 1,308.

The change contains contract text and annotation comments only. It changes no behavior.

## Scope

The derived scope is the [Monitoring contract](../../../../src/modules/monitoring/monitoring.invariants.md)
and the [LSP contract](../../../../src/modules/lsp/lsp.invariants.md).

Path implication came from the two contract files and annotations in their modules. Content
implication came from `LanguageClient`, `LanguageServerProcessRegistry`, `MonitoringStats`, and
`ProcessSampler`. The root records about observed cost and separate failable processes remain
upheld. This task changes no root record.

## Driven evidence

The [#412 (monitoring LSP CPU profile) drive](../../completed/412-monitoring-lsp-cpu-profile/412-lsp-cpu-profile-drive.ts)
ran before the contract edits at both required scales.

| Lines | Positive control | Idle row | Post-edit peak | Population |
|---:|---:|---:|---:|---|
| 10 | `125.3715%` | `tsgo 0%` | `0.4308646%` | One ordered live row |
| 10,000 | `127.5792%` | `tsgo 0%` | `0.3328070%` | One ordered live row |

Both positive controls completed 30,000,000 counted operations and produced a positive processor
delta. Both application drives kept owner-derived server identity at small and large source scales.

## Contract verdicts

### Monitoring records

| Record | Verdict |
|---|---|
| A runtime reading is a delta over a named window | Refined and upheld. Scope and Evidence now include registered children, `ProcessSampler`, and `MonitoringStats`. |
| A live heap figure is only true just after a collection | Untouched. Child RSS remains an instantaneous count and makes no retention claim. |
| A missing process is gone not idle | Added and upheld. The fixture distinguishes busy, idle, and gone rows. |
| The monitor names its own cost and pays it only when observed | Upheld. LSP sampling still runs only through the observed monitor cadence. |
| Retained document bytes come from the buffer set | Untouched. |
| The monitor excludes itself from its own verdict | Untouched. |
| The monitor is a pane content citizen | Upheld. The new records use the existing plugin input and status projection. |

### LSP records

| Record | Verdict |
|---|---|
| Byte streams do not preserve message boundaries | Untouched. |
| LSP positions cross through UTF-16 | Untouched. |
| LSP is a provider plugin | Upheld. The registry remains inside the LSP module. |
| Completion is provider-neutral | Untouched. |
| The LSP attaches only to documents within the size budget | Untouched. |
| LSP activation follows semantic demand | Upheld. Registration follows successful demand-driven process and transport startup. |
| Monitored server identity comes from its owner | Added and upheld. Owner-keyed registrations supply ordered names and PIDs without process-table search. |
| Client disposal releases the server | Upheld. Normal disposal unregisters the owner before releasing the process. |
| Server failures remain contained | Upheld. A crashed registered process remains observable as `GONE`. |
| A definition gesture jumps to the declaration | Untouched. |
| Diagnostic updates match current revisions | Untouched. |
| Diagnostic storage stays compact and bounded | Untouched. |
| Diagnostics reach the store by push or pull | Untouched. |

## Verification

- The missing-process fixture command passed: `1` test, `3` assertions, `0` failures.
- The full registry and monitoring fixture command passed: `17` tests, `53` assertions, `0`
  failures.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` passed. The LSP contract has
  `2` reality and `11` chosen records. The Monitoring contract has `2` reality and `5` chosen
  records.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` resolved `1,308`
  annotations and `259` lattice links with `0` problems.
- `git show --check HEAD` passed.
- The worktree is clean at `c25cc900fd49a4ada79ec79605b18f88204bdf39`.

I did not run `scripts/merge-gate.sh`, the full test suite, or the full behavioral contract suite.
The brief excluded the merge gate and required the scoped fixture and invariant checks.

## Bycatch

- Comment and tool-index drift: [project.tools.md](../../../../project.tools.md) and the
  [#412 drive header](../../completed/412-monitoring-lsp-cpu-profile/412-lsp-cpu-profile-drive.ts)
  still name the old `.invar/tasks/in-progress/412-monitoring-lsp-cpu-profile/` command path. The
  old path returned exit `1`; the current `completed` path returned exit `0`. The explicit path
  check reproduced this once. I left both files unchanged.
- Pre-existing contract-format drift: the baseline and final `--all` checks reported `15`
  punctuation-bearing record names across `10` contracts. The checker also reported `22` records
  without annotations across `11` contracts and `3` lattice coverage notes. This task added no new
  note or coverage gap. I left these unrelated records unchanged.
- No unrelated runtime defect appeared during either real application drive.
