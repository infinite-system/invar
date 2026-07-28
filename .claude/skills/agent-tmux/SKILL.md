---
name: agent-tmux
description: >-
  Drive an interactive CLI agent (claude / codex) inside tmux — launch it, send prompts/turns, wait
  for it to finish, peek its output, steer it, reap it. Use this WHENEVER you need to run, watch, or
  converse with a nested claude/codex session through tmux (orchestration, the fleet/director,
  cross-model review, or just steering a long-running agent). Do NOT hand-roll `tmux send-keys` — the
  recipe is fragile (send races, startup dialogs, busy-detection) and is already encapsulated, tested,
  in scripts/agent-tmux.sh. Read this before driving any agent in tmux.
---

# Driving interactive agents in tmux — use `scripts/agent-tmux.sh`

**Rule: don't hand-roll `tmux send-keys`.** Driving an interactive agent through tmux is fragile in
four ways (send races, startup/approval dialogs, "is the turn done?", bounded reads) — all of them
already handled, deterministically, by `scripts/agent-tmux.sh`. Call its verbs.

```
agent-tmux launch <name> [--cwd D] -- claude --model <m> [--dangerously-skip-permissions]
agent-tmux send       <name> "<prompt / relayed verifier findings>"
agent-tmux wait       <name> [cap]        # block until idle
agent-tmux send-wait  <name> "<msg>"      # send + wait + return the reply
agent-tmux peek       <name> [lines]      # bounded capture, plain text
agent-tmux status     <name>              # idle | busy | starting | dead
agent-tmux kill       <name>
agent-tmux list
```

Run it from the toolchain `scripts/` dir, e.g.
`bash <repo>/.claude/worktrees/<wt>/scripts/agent-tmux.sh launch …`.

Key facts (don't re-discover):

- **Quota:** interactive sessions (what this drives) bill the **interactive** bucket — the one we
  want. `claude -p` bills the small Agent-SDK pool; we don't use `-p`.
- **Persistence:** the `claude` profile launches promoted + persisted, so a worker survives a
  tmux/host death and is `--resume`-able.
- **Single-owner:** a live session has one owner. A human watches/steers any worker live with
  `tmux attach -t at_<name>`; don't expect two drivers on one session.
- **Verdicts come from artifacts** (`tmp/STATUS` + `git`), not from scraping the pane.
- **codex** profile markers are `[UNVERIFIED]` — confirm + tune before relying on codex auto-drive,
  or pass `--ready`/`--busy` overrides.

Full reference: `scripts/agent-tmux.readme.md`. Design context: `scripts/fleet.design.md`. Tests:
`scripts/agent-tmux.test.sh` (`AGENT_TMUX_LIVE=1` for the live claude smoke).
