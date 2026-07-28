# 206 — the gate's retry population: find shared causes

State: DONE — eabe010 (merged as fleet/205-flake-population; the label predates this ID)
Created: 2026-07-28

## Outline

Dispatched to find whether the gate's persistent retry population had one shared cause. It did not —
**it had two distinct ones**, both real:

1. **`terminal-stage`'s single click was TWO PTY writes racing a mouse-up toggle.** Not a timing
   sensitivity; an input the harness sent twice, where the second arrival undid the first.
2. **`clipboard-frame-boundary` waited for a TRANSIENT first-loop value** that a loaded run can skip
   entirely — a condition that is true only briefly and can be missed rather than one that is never
   true.

**My stale-coordinate guess was refuted by measurement**, and `scrollbars` was deliberately left
untouched rather than folded in on a guess.

### Bycatch that became a mechanism elsewhere

The investigation's bycatch supplied **#90**'s mechanism (harness diagnostic provenance — a stale
`artifacts/tui.log` line satisfying an assertion).

### The numbering violation this task carries permanently

**Its branch is `fleet/205-flake-population`, labelled before the task existed** — the tracker then
assigned 205 elsewhere. Both records carry a note and **the branch was not renamed**, because branches
are never renamed or deleted here.

That produced the standing rule:

> **Create the task folder BEFORE dispatching**, so the number is BACKED rather than guessed. **Numbers
> are permanent** — a number is never reused even for an abandoned task, because branches carry it
> (`fleet/<n>-<slug>`) and branches are never deleted, so a number must resolve forever.

### The ledger conventions settled alongside it

- Status vocabulary: `OPEN` · `IN FLIGHT <branch>` · `DONE <commit>` · `DECLINED <reason>` ·
  `SUPERSEDED BY #n`.
- **Every entry states the EVIDENCE**, not just the intent: what was measured, what refuted what, what
  is still hypothesis. **A task that records only a conclusion is unusable to whoever picks it up.**

## Sources

None in this folder — no brief was written under this number (it was dispatched as
`fleet/205-flake-population`; see the numbering note above). Detail recovered from the session
transcript (`faf7e858-…jsonl`).
