# 173 — grid predicates assert contiguous strings that wrapping legitimately splits

State: TODO
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

Predicates search for contiguous text **in a surface whose job is to wrap it.**

### The observed instance

The app rendered `/resolver-smoke ARGUMENTANCHOR` **correctly**, wrapped across two rows. The predicate
could not see it, so the smoke failed — and passed on retry, which means **the retry tally absorbs it as
noise when it is really presentation-coupling.** That is the expensive part: the defect is invisible in
the flake census because it looks like ordinary flakiness.

### What the repair must and must not do

- **Do NOT widen the wait or add a retry.** The content is already painted when the predicate runs, so
  waiting longer cannot help — and that is itself the tell that this is not a timing defect.
- **Positive control in BOTH directions**: force a wrap in the middle of the target string and require
  the repaired predicate to still find it; then plant a genuinely absent string and require a red. **A
  matcher that cannot fail is worse than the flake it replaced.**
- **If joining rows would hide a REAL defect** — a case where the app wrapped somewhere it should not —
  say so. The goal is an assertion that tests CONTENT, not one that tolerates anything.
- **Do not point-fix other flaky smokes while here.** #177 holds an open hypothesis that the gate's
  one-retry-per-run pattern has a single shared cause; point-fixing destroys the evidence that
  measurement needs.

### Family

Same brittleness, on the assertion side, as **#90** (harness diagnostic provenance) — both are "an
artifact that looks like evidence." **#137**'s one-command exploratory driver is the tool that makes
either reproducible.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`), where a
full brief for this task was drafted under the title *"predicates that search for contiguous text in a
surface whose job is to wrap it."*
