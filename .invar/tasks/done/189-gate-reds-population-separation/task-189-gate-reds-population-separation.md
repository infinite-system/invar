# 189 — two gate reds after eight landings

State: DONE
Created: 2026-07-28

## Outline

Two reds after eight landings: the diff horizontal bar moving 28→44, and `reserved-chord`'s Quick Open
inside the concurrent pool. The brief's demand was **population separation** — establish which tree each
red belongs to before proposing any cause.

### The result, and it refuted the brief's own premise

**#189 measured 8/8 green and refuted the reachability mechanism I had briefed**, by reading the fixture
rather than reasoning about it.

That mattered beyond this task: I had already recorded reserved-chord as a **confirmed** load-dependent
flake in doctrine. The correction was made **in place** — the doctrine section was rewritten and #190's
premise reworked — rather than quietly softened. **Two gate failures and eight subsequent passes is an
unreproduced red**, not a demonstrated pool defect.

**Why that correction was worth the effort:** a brief that names a cause spends the builder's effort on
CONFIRMING it. Filing reserved-chord as pool-caused would have sent the next builder to verify my
population instead of finding the real one — which, when it was eventually found (#194), turned out to
be an inherited `ripgrep` binary and nothing to do with the pool at all.

### The separation method it established

Run the failing subject at the merge base and on the branch, N times each, and report the two
populations — not a rate. **A rate destroys the shape a sequence reveals**: "50% failure" says nothing,
while a clean `0,1,0,1` alternation names wall-clock phase instantly.

## Sources

- `brief-189-1-gate-reds-population-separation.md`
- `report-189-gate-reds-population-separation.md`
- Detail above additionally recovered from the session transcript (`faf7e858-…jsonl`).
