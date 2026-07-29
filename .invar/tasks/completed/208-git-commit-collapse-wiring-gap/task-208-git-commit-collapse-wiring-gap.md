# 208 — an expanded commit cannot be folded back

State: COMPLETED — merged 15f51dc
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

**User-reported:** *"the git commits — you can expand a commit but you cannot fold it back."*

### The mechanism — a wiring gap, not a missing feature

`CommitExpansion.toggle()` **exists** at `src/modules/git/CommitExpansion.ts:53` and correctly calls
`collapse()`. But `GitWorkspace.ts:501` and `:522` call **`expand()` directly**, so the toggle is never
reached from the pointer path.

**Only the TEST callers used `toggle`.** That is the diagnostic detail: the method was covered, the
behaviour was not, and coverage counted it either way. A method exercised solely by tests is a method
with no production caller — and nothing in a call-count census distinguishes that from a working one.

### The fix

Route the **real pointer path** — `onPointerDown → toggleLogRow → CommitExpansion.toggle` — keeping
cache eviction intact and leaving the keyboard drill-down alone.

### Landing note

This landed in the same gate as #204, which was also **the first gate to exercise the new retry-history
writer** — the monitor watched for its `RETRY TALLY: appended` line, so that green both landed the two
fixes and confirmed the persistence works on a real run rather than only against fixtures.

## Sources

- [brief-208-1-git-commit-collapse-wiring-gap.md](brief-208-1-git-commit-collapse-wiring-gap.md)
- Detail above additionally recovered from the session transcript (`faf7e858-…jsonl`).
