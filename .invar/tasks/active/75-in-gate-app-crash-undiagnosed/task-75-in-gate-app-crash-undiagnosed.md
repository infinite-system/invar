# 75 — in-gate crash (exit 1) with no diagnosable reason

State: ACTIVE — reproduced, mechanism still open
Created: 2026-07-28
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
Priority: verification-integrity
Assignment note: Two live candidates and an empty output tail; picking one without measurement went 0-for-5 elsewhere.

## Outline

### The title is misleading, and re-reading the premise was the useful move

The task says "in-gate APP crash." The test in question spawns
`[process.execPath, '-e', recordedStreamProgram]` — **a tiny `bun -e` helper, not the Invar app** — and
prompt exit is that program's INTENDED behaviour. So the framing was wrong twice over: wrong process,
and the "crash" is partly by design. It was pointing at the render path while the evidence points at
the spawn path.

Re-reading a task's PREMISE rather than its symptom is what surfaced this.

### The reproduction

It finally reproduced in a unit test, with the added instrumentation firing:

> `Invar exited before the awaited frame (exit 1); output tail: ""`

**An EMPTY tail means the process died before writing a single byte** — a pre-output failure, not a
crash mid-render. That is a strong constraint on the remaining candidates.

### Two candidates, deliberately not narrowed to one

1. **An exit-vs-read race in the harness.** Fits the population shape: fails under load, passes 12/12
   alone.
2. **A genuine spawn failure.** It reported **exit 1**, and a recorded-stream program should exit 0.

Both survive the empty-tail evidence. Picking one without measurement is exactly the move that went
0-for-5 elsewhere this week.

### The defect class it named

**`await-after-terminal-action`**: when an action's intended outcome is PROCESS EXIT, the assertion must
await the *exit*, never a frame. Same family as the sample-without-wait sweep — wait on what the action
actually produces.

Scope registered against this task:
- a sweep across every quit-class action;
- a harness invariant recorded beside the two existing wait rules;
- verification **under artificial load**, not quiet, since quiet is where it passes.

### Cross-branch note

When this signature appeared on a feature branch, the failure identity read **inherited, not
branch-caused** — the same `Invar exited before the awaited frame` race. The fix therefore belongs on
main, not in whatever branch happens to surface it.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
