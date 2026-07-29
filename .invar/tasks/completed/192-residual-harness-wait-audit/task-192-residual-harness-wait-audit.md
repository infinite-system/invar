# 192 — five residual harness waits from #168's mass conversion

State: COMPLETED
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

**One audit, not five fixes.** Five sites left behind by #168's conversion, treated as a single class so
the repair would be one rule applied five times rather than five local patches.

### The instance that was the gate blocker, with its provenance

`smoke-editor-harness` sends **six** rightward Option-wheel SGR events and confirms a greater published
`editorScrollLeft` — then sends **EIGHT** leftward Option-wheel events and waits only for a generic
screen/caret change.

**Eight leftward against six rightward over-scrolls. The viewport clamps at `scrollLeft 0`, and the
remaining events have nothing left to repaint.** Both full-gate attempts timed out, and the final grids
showed the README editor **at the line head** — the app was correct and the wait was impossible.

Provenance recorded to the standard #188 established:
- **Reproduced a second time:** YES (attempt 1 and retry).
- **Verified at merge base:** YES, and proven properly — gate HEAD and merge base were both `f3f313e`,
  with **no diff** in `src/`, `PtyTestDriver.ts`, or `smoke-editor-harness.ts`.
- **Logs:** `/tmp/merge-gate-failures.400064/smoke-editor-harness-.attempt1.log` and `.log`.

That is what a merge-base verification looks like when it is done rather than asserted.

### The rule

A wait must observe what the action actually produces. Counting events is not the same as knowing the
subject can still move — and when the gesture is idempotent at its boundary, the count is exactly what
makes the wait unreachable.

Gained **panel-split** as a fifth site from #191's bycatch.

## Sources

- [brief-192-1-residual-harness-wait-audit.md](brief-192-1-residual-harness-wait-audit.md)
- [report-192-residual-harness-wait-audit.md](report-192-residual-harness-wait-audit.md)
- Detail above additionally recovered from the session transcript (`faf7e858-…jsonl`).
