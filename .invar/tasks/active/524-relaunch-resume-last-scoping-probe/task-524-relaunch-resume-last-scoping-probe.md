# 524 — relaunch resume last scoping probe

Priority: verification-integrity
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: medium

## In plain words

Our relaunch script resumes the most recent codex conversation. If "most
recent" is global instead of per-directory, relaunching lane A while lane
B ran later would resume B's conversation inside A's worktree. Prove which
it is with two lanes.

## Evidence (from #517 bycatch, 2026-08-06)

- `scripts/fleet/relaunch.sh` uses `codex resume --last`. Labeled suspect
  by the #517 builder: not reproduced, and auto-restore has worked in
  practice.

## Outline

Two scratch worktrees, two codex sessions, deliberate interleaving; kill
lane A's session; relaunch lane A; prove whose conversation resumed (the
rollout file identity is the evidence). If --last is global, fix
relaunch.sh to resolve the lane's own rollout (see #525's resolver) and
resume it by id. Both polarities: a control where the right session
resumes, and the crossing case.
