#!/usr/bin/env bash
# Dispatch a builder, and make its record a BYPRODUCT of dispatching.
#
# WHY THIS EXISTS
#
# Seven bycatch findings were reported correctly by builders on 2026-07-27 and
# five were lost, for exactly one reason: recording them required a SEPARATE
# ACTION from the work that produced them. Any record that depends on a second
# step eventually does not happen. Every brief written by hand had the same
# latent defect — it survived only because someone chose to keep a copy, and
# nothing would have noticed if they had not.
#
# So this script REFUSES TO LAUNCH AN AGENT WITHOUT COMMITTING ITS BRIEF FIRST.
# That single ordering is the whole design; everything else here is convenience.
#
# Usage:
#   scripts/fleet/dispatch.sh <task-number> <slug> <brief-file> [engine]
#
#   scripts/fleet/dispatch.sh 168 frame-ordinal-wait /tmp/brief.md
#   scripts/fleet/dispatch.sh 171 tasks-json-displaces-builtin /tmp/brief.md claude
#
# engine defaults to codex.

set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <task-number> <slug> <brief-file> [engine]" >&2
  exit 2
fi

task_number="$1"
slug="$2"
brief_file="$3"
engine="${4:-codex}"

case "$task_number" in
  ''|*[!0-9]*) echo "dispatch: task number must be digits, got '$task_number'" >&2; exit 2;;
esac
case "$slug" in
  ''|*[!a-z0-9-]*) echo "dispatch: slug must be lowercase letters, digits, hyphens" >&2; exit 2;;
esac
[ -f "$brief_file" ] || { echo "dispatch: brief not found: $brief_file" >&2; exit 2; }

# VALIDATE EVERY ARGUMENT BEFORE ANY SIDE EFFECT. The first version of this
# script checked the engine name at launch time — step 5 — so a typo'd engine
# had already cut a worktree, run `bun install`, and COMMITTED A BRIEF for a
# dispatch that then refused to start. Validate-late/act-early is the same
# ordering defect that made a worktree prune delete tracked files before the
# removal it was preparing for could run. Guards go first or they are not guards.
case "$engine" in
  codex|claude) ;;
  *) echo "dispatch: unknown engine '$engine' (codex|claude)" >&2; exit 2;;
esac

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

name="${task_number}-${slug}"

# EXPERIMENT=1 marks work that is HELD FROM MAIN pending proof — the branch name carries the policy
# so nobody has to remember it. `land.sh` refuses to merge an `experiment/` branch without an
# explicit ADOPT_EXPERIMENT=1, which turns "provenance decides main, not quality" from a rule the
# conductor recalls into one the tooling enforces. #169 is the founding case: an outside review found
# a real structural fact (four arrays of length n per edit) that has never been shown to be a felt
# problem, so the change must prove it is an invariant unlock before it is adopted at all.
if [ "${EXPERIMENT:-0}" = "1" ]; then
  branch="experiment/${name}"
else
  branch="fleet/${name}"
fi
worktree_path="${repository_root}/.invar/worktrees/${name}"
dispatch_directory="${repository_root}/agent-dispatches/${name}"
tmux_session="invar/${name}"
# Transcripts live with the other 171 in tmp/transcripts/ (gitignored; the user's decision on
# 2026-07-27 was "no need to store in git history"). NOT beside the worktree dirs: .invar/worktrees/
# gets pruned on landing, and co-mingling durable records with prunable scratch is what put 1.1 GB of
# logs one reboot from gone in the first place.
transcript_path="${repository_root}/tmp/transcripts/${name}.transcript.md"

# ---------------------------------------------------------------------------
# 1. REFUSE on any collision. A leftover worktree has silently started a builder
#    on the WRONG BASE three separate times; picking a new path costs nothing and
#    reusing one costs a whole run.
# ---------------------------------------------------------------------------
[ -e "$worktree_path" ] && { echo "dispatch: worktree path occupied: $worktree_path" >&2; exit 1; }
[ -e "$dispatch_directory" ] && { echo "dispatch: dispatch record exists: $dispatch_directory" >&2; exit 1; }
if git show-ref --verify --quiet "refs/heads/${branch}"; then
  echo "dispatch: branch already exists: $branch" >&2; exit 1
fi
if tmux has-session -t "$tmux_session" 2>/dev/null; then
  echo "dispatch: tmux session already live: $tmux_session" >&2; exit 1
fi

# ---------------------------------------------------------------------------
# 2. Cut the worktree, then INSTALL DEPENDENCIES.
#    `git worktree add` copies tracked files only, so a fresh worktree has no
#    node_modules. The resulting preflight red is clean, consistent and
#    meaningless — and looks exactly like the defect the builder was sent to
#    investigate. That cost one builder ten baseline runs on 2026-07-27.
# ---------------------------------------------------------------------------
echo "dispatch: cutting worktree $worktree_path on $branch"
git worktree add -b "$branch" "$worktree_path" main >/dev/null

echo "dispatch: installing dependencies (not optional, not the builder's job to discover)"
( cd "$worktree_path" && PATH="$HOME/.bun/bin:$PATH" bun install >/dev/null 2>&1 ) \
  || { echo "dispatch: bun install FAILED — not launching" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 3. Place the brief in BOTH homes: the worktree (for the builder) and the
#    dispatch record (for the audit trail).
# ---------------------------------------------------------------------------
mkdir -p "$dispatch_directory" "$(dirname "$transcript_path")"
cp "$brief_file" "$dispatch_directory/brief.md"
cp "$brief_file" "$worktree_path/TASK.md"

# meta.json is written BEFORE the commit so it lands WITH the brief. Written afterwards it stayed
# untracked and never became part of the audit record — the same "a record that needs a second step
# eventually does not happen" defect this whole script exists to remove, reintroduced inside it.
# baseCommit is therefore the commit the worktree was CUT FROM, which is the more useful fact anyway.
cat > "$dispatch_directory/meta.json" <<META
{
  "task": ${task_number},
  "slug": "${slug}",
  "branch": "${branch}",
  "worktree": ".invar/worktrees/${name}",
  "tmuxSession": "${tmux_session}",
  "transcript": "tmp/transcripts/${name}.transcript.md",
  "engine": "${engine}",
  "heldFromMain": $([ "${EXPERIMENT:-0}" = "1" ] && echo true || echo false),
  "baseCommit": "$(git rev-parse HEAD)",
  "startedAt": "$(date -Is)"
}
META

# ---------------------------------------------------------------------------
# 4. COMMIT THE BRIEF BEFORE LAUNCHING. This is the step the whole script exists
#    for. If it fails, no agent starts — an unrecorded dispatch is worse than no
#    dispatch, because it produces work nobody can audit.
#    SKIP_GATE: markdown only, and the gate is for landing, not for dispatching.
# ---------------------------------------------------------------------------
git add "$dispatch_directory/brief.md" "$dispatch_directory/meta.json"
if ! SKIP_GATE=1 git -c commit.gpgsign=false commit -q \
      -m "dispatch #${task_number}: ${slug}

Brief committed before the agent starts, so the record cannot drift from what
was actually asked. Branch ${branch}, worktree .invar/worktrees/${name},
session ${tmux_session}, engine ${engine}." \
      -- "$dispatch_directory/brief.md" "$dispatch_directory/meta.json"; then
  echo "dispatch: BRIEF COMMIT FAILED — refusing to launch" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5. Launch inside tmux so the session is ATTACHABLE BY SOMEONE WHO IS NOT THE
#    DISPATCHER. A named session also gives precise identity for termination —
#    `pkill -f` matches the builder's own brief text, and a kill is destructive.
# ---------------------------------------------------------------------------
# INTERACTIVE, not `exec`. `codex exec` / `claude -p` are one-shot with NO input loop, which
# cost real time on 2026-07-28: three brief amendments were appended to TASK.md and sent with
# tmux send-keys, and NONE reached the builder — there was nothing listening. Worse, `pipe-pane`
# captures our own echoed keystrokes, so grepping the transcript for the message "confirmed"
# delivery that never happened. Interactive also means the USER can attach and steer, which is
# the whole point of dispatching into tmux rather than backgrounding a process.
#
# Driving is delegated to scripts/agent-tmux.sh (see .claude/skills/agent-tmux/SKILL.md) — do
# NOT hand-roll send-keys here or in any caller. Its `send` verb splits text from Enter and then
# CONFIRMS submission by polling the busy marker; a bare send-keys leaves a large paste sitting
# unsubmitted in the composer, which is exactly what happened.
case "$engine" in
  codex)  agent_command="codex --dangerously-bypass-approvals-and-sandbox";;
  claude) agent_command="claude --dangerously-skip-permissions";;
esac

AGENT_TMUX_PREFIX="invar/" bash "${repository_root}/scripts/agent-tmux.sh" launch "$name" \
  --cwd "$worktree_path" --profile "$engine" --timeout 90 \
  -- env PATH="$HOME/.bun/bin:$PATH" $agent_command >/dev/null || {
    echo "dispatch: agent-tmux launch failed for ${name}" >&2; exit 1; }
tmux pipe-pane -t "$tmux_session" -o "cat >> '${transcript_path}'"

# The opening turn goes through `send`, which confirms it submitted.
AGENT_TMUX_PREFIX="invar/" bash "${repository_root}/scripts/agent-tmux.sh" send "$name" \
  "Read TASK.md in this directory and execute it fully. Report to /tmp/${name}-READY.md." >/dev/null


echo
echo "dispatch: LAUNCHED #${task_number} ${slug}"
echo "  attach:     tmux attach -t ${tmux_session}"
echo "  transcript: ${transcript_path}"
echo "  worktree:   ${worktree_path}"
echo "  report to:  /tmp/${name}-READY.md"
