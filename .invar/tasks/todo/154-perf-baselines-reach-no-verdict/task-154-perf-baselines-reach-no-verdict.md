# 154 — perf-baselines is soft, so its failures reach no verdict

State: TODO
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: performance-behaviour

## Outline

### The reduction

**Soft means "does not block." It does not mean "does not need reading."**

The gate printed **ALL-PASS while its own log said `FAIL` and `EXIT 2`**. That is honest behaviour by
the letter — `perf-baselines` is declared soft — but the run had leaked a live editor at ~2.8% CPU, and
**a leaked process is not a soft opinion. It is state that contaminates the NEXT run's quiet
measurement.** A soft tier whose output nobody reads converts a real finding into noise on the way out.

### The second half: the orphan detector may itself be the defect

The soft tier printed `FAIL orphan bun processes from this run: 3340795`. **Ninety seconds later that
process had exited on its own, with no intervention.**

So the detector may be SNAPSHOTTING while a process is still shutting down, and calling normal
termination a leak. That is the same defect family as the wait failures — a verdict that depends on
*when* it looks rather than on a condition.

**Establish which it does and say so**: does it wait for exit, or merely snapshot? If it snapshots, the
detector is the defect, and that belongs to this task.

This sharpens the first half rather than replacing it: **a soft tier that cries leak on healthy shutdown
trains everyone to ignore it**, which is exactly how the one real leak went unread.

### A correction on the evidence, worth keeping

Two editors initially counted as gate leaks were **not**. Both were the user's own — parented to an
interactive `-bash` on `pts/0` and `pts/19`, with no workspace argument. The gate's harness spawns apps
with a workspace path under a tmux parent, which is what the actual orphan
(`bun run src/main.ts /tmp/tui-perf-workspace.5rrqmR`) looked like before it exited.

**#154 stands on the one confirmed orphan, not on those two.** The parent-and-argument test is how to
tell a harness process from a user's.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
