# 31 — post-campaign getter census → scoped invalidation

State: TODO — hold, partly overtaken
Created: 2026-07-28
Engine: claude
Environment: linux
Model: fable-5
Effort: high
Priority: architecture-hygiene
Assignment note: On hold pending #110; resuming means re-judging whether it is still worth doing.

## Outline

Follow-up from the PTY-harness campaign (#30): census which reactive getters are re-derived too
broadly, then narrow their invalidation scopes. A performance-hygiene sweep of the ivue graph, with the
deterministic suite as the net that proves behaviour did not move.

### Why it is on hold rather than queued

**Partly overtaken, from two directions:**

- #73's dropped-signal audit landed and covered the CORRECTNESS half — signals that were being missed
  entirely, which was the sharper of the two problems.
- The PERFORMANCE half may be answered by #110's latency investigation anyway.

The recommendation on record: hold until #110 reports. If the residual latency traces to reactive
re-derivation, this task becomes that fix and gains a measured subject. If it does not, this is
low-value hygiene competing against work with evidence behind it.

That conditional is the useful content here — dispatching it now would mean censusing getters with no
measurement saying any of them cost anything.

### Its position in the sequence

Repeatedly listed as scheduled-but-not-user-blocking, alongside #32 (sweep) and the capsule arc, and
named as one of the items the capsule work comes AFTER. If the capsule/workspace-membrane surgery
happens, the census should FUSE with it — one deep `Workspace` surgery rather than two passes over the
same file.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
