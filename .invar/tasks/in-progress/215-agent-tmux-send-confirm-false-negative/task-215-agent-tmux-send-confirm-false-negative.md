# 215 — agent-tmux send reports NOT CONFIRMED while the claude builder is working

State: IN-PROGRESS
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: verification-integrity

## Outline

Twice tonight (dispatch of #114 and dispatch of #122, both claude engine),
`agent-tmux.sh send` printed `send: NOT CONFIRMED — composer never returned to its
pre-send state and no new queued marker` while the pane showed the agent actively
streaming tokens seconds later. Both were false negatives. The message arrived and
the turn ran.

Why it matters: a confirmation that false-negatives trains the conductor to ignore
it, and then a real unsubmitted paste (the failure the confirm exists to catch)
slips through. An instrument must fail loudly AND truthfully.

First question: what does the confirm poll actually observe on the claude
composer, and did claude's UI change its busy marker? Compare against the codex
profile, which confirmed cleanly all night (`submitted`). Fix the observation,
not the timeout. Positive control required both ways: a deliberately unsubmitted
paste must still report NOT CONFIRMED.

## Sources

- Session evidence 2026-07-28: #114 dispatch (~21:26) and #122 dispatch (~00:0x)
  both printed NOT CONFIRMED; both builders were verifiably working within
  seconds (pane capture showed token streaming).
