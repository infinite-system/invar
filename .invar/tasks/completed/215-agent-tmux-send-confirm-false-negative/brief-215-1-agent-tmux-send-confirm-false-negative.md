# Brief — #215: agent-tmux send-confirm false negative (three sightings)

Read first: `.invar/tasks/active/215-agent-tmux-send-confirm-false-negative/task-215-agent-tmux-send-confirm-false-negative.md`,
then `.claude/skills/agent-tmux/scripts/agent-tmux.sh` (the `send` verb) and
`.claude/skills/agent-tmux/SKILL.md`.

## The defect

Three times on 2026-07-28/29, `send` printed
`send: NOT CONFIRMED — composer never returned to its pre-send state and no
new queued marker` for a CLAUDE builder that was verifiably streaming tokens
seconds later. Codex confirmations were correct all night. A confirm that
false-negatives trains its reader to ignore it; then a real unsubmitted paste
(the failure it exists to catch) walks through.

## The work

1. Reproduce: launch a scratch claude in tmux (agent-tmux launch, throwaway
   worktree or empty dir — NOT a builder session), send a multi-line paste,
   and capture what the composer and busy markers actually look like through
   the confirm window. Compare against codex. The suspects: claude's composer
   redraw timing, its busy-marker vocabulary changing, or the poll reading the
   wrong pane region.
2. Fix the observation, not the timeout. The confirm must key on structure
   that claude cannot utter in ordinary output (the family-2 rule).
3. Both polarities proven: a genuinely submitted turn confirms; a deliberately
   unsubmitted paste (send text without Enter) still reports NOT CONFIRMED.
   Quote both.
4. Fold-in from the same seam: dispatch.sh's claude session-link timing (the
   store file appears lazily, so the in-dispatch resolution warns spuriously;
   the worktree-derived path in dispatch.sh is now primary — verify the
   warning only fires when the project directory truly never appears, e.g.
   by waiting the same 15s window the transcript check uses).

## Verification

Drive the real thing: at least one full scratch launch+send per engine, exit
codes quoted. No production app code is in scope. Scratch tooling in your
task folder, full names, header comments. Do not touch live builder sessions.

Do not run `scripts/merge-gate.sh`. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose
STE-flavored. Report bycatch explicitly.
