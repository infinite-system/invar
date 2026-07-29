# 269 — sweep: smokes that hard-code editor geometry instead of measuring

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: verification-integrity

## Outline

Bycatch of #268 (which fixed exactly this class in `smoke-editor-harness`:
measure the pane at assert time, never assume full width). Known remaining
members, from #268's report:

1. `scripts/smoke-editor.sh:83` (legacy tmux tier) — the identical fixed
   `slice(37,44)` gutter window; suspect red under the auto-open default
   when the `INVAR_FULL_TMUX=1` tier runs (the gate skips it). CONFIRM the
   red first, then fix by measurement. The wrap-off record's Evidence and
   Verification lines in `src/modules/ui/ui.invariants.md` cite this legacy
   check — update the citations if the instrument changes.
2. `scripts/harness/smoke-wrap-harness.ts:357,363` — clicks at fixed
   column 60 (holds today only because its fixture is not markdown).
3. `scripts/harness/smoke-horizontal-extent-harness.ts:112,156` — wheels at
   fixed column 70, row 15.
4. `scripts/harness/smoke-search-mouse-harness.ts:146,166,172` — mouse
   moves at fixed columns 31–32.
5. Latent row-order dependency inside `smoke-editor-harness.ts` itself: the
   remaining whole-grid `findText` waits ('tiny project', 'X', 'src',
   'greeter.ts') target the editor's copy only because it paints at a lower
   row than the preview's copy — layout luck. Scope them to the measured
   editor pane like #268 did for the wrap-off arms.

Sweep BOTH polarities: fixed coordinates that break when a pane opens, AND
whole-grid text waits satisfiable by a different pane's copy of the same
text. #268's measured-pane helpers are the pattern — extract a shared
helper if two smokes want the same measurement (seam at the shared
generator; don't copy it five times).

Each fix needs its positive control: break the measured property, watch the
assertion catch it.

## Invariants in scope

- `src/modules/ui/ui.invariants.md` wrap-off record (its Evidence cites the
  legacy check); the harness records for each smoke touched.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-268-editor-smoke-vs-auto-open-red-main.md`, Bycatch 1, 2, 4.
