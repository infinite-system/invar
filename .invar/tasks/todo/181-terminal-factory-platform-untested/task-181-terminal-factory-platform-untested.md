# 181 — `TerminalFactory`'s platform choice has no test

State: TODO — pairs with #180
Created: 2026-07-28

## Outline

The `process.platform === 'darwin'` branch is **the single decision determining which PTY
implementation a user gets**, and it is the one thing the suite cannot assert — the darwin arm never
executes on Linux, and (per #180) nothing executes at all on darwin.

### The fix

A **`protected static get platform()`**, so a subclass can vary it and both arms become reachable from
a Linux test run. Same shape as the rest of the repo's testability idiom — the decision moves onto the
class where a subclass can override it, rather than being read inline from the global.

### The question worth deciding while in there

**The real constraint PR #1 documented is the arm64 ABI, not macOS.**

So the condition may be **wrong for Intel Macs** — an x86_64 Mac would take the darwin branch and get
the implementation chosen for an ABI it does not have. Testing the branch and fixing the predicate are
two different repairs, and doing the first without asking the second just locks in a possibly-wrong
condition with a test around it.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
