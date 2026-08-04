#!/usr/bin/env bash
# land.sh — lifecycle step 5, one command. Merge first is NOT required: this
# script merges, then moves the record, in the guarded order below.
#
# Usage:
#   scripts/fleet/land.sh <task-number> <slug> <merge-message-file> <summary...>
#
# WHY ONE COMMAND
#
# Step 5 was six hand-typed commands. The hand-typed State edit missed twice on
# 2026-07-28 (a sed matching the wrong literal left State: IN-PROGRESS inside
# completed/, silently — the tasks:done lens caught one, drift signals the
# other). This script replaces the FIRST State: line whatever it says, verifies
# it took, and records timing into meta.json as a byproduct:
#   startedAt (from dispatch) + landedAt + durationMinutes + mergeCommit.
#
# GUARDS KEPT FROM THE PREVIOUS GENERATION (each bought by an incident):
#   - refuse off main (a landing merged into a feature branch on 2026-07-28)
#   - experiment branches held without ADOPT_EXPERIMENT=1 (provenance decides)
#   - refuse a mid-turn builder; idle needs the READY report too
#   - refuse untracked source in the worktree (a merge will not carry it)
#   - surface bycatch and HOLD without BYCATCH_TRIAGED=1
#   - warn about report link findings without blocking legacy records
#   - REFUSE WITHOUT A READ GATE VERDICT (2026-07-29: the conductor chained
#     land.sh behind an unchecked wrapper exit and landed #237 on GATE_EXIT=1;
#     the wrapper's exit was the echo's, not the gate's). GATE_LOG=<path> must
#     name a log whose GATE_EXIT is 0, or GATE_OVERRIDE=<written reason> takes
#     the exception deliberately (contract-only landings, batch-covered
#     serial landings after ONE green log, and red-classified-pre-existing
#     are the known legitimate reasons — write which).
#
# Landing is DELIBERATE: no gate here (gate the combined tree BEFORE), no push.

set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "usage: $0 <task-number> <slug> <merge-message-file> <summary...>" >&2
  exit 2
fi

task_number="$1"
slug="$2"
merge_message_file="$3"
shift 3
summary="$*"

[ -f "$merge_message_file" ] || { echo "land: merge message not found: $merge_message_file" >&2; exit 2; }

# Refuse without a READ gate verdict. The wrapper exit code around a gate run
# is the last command's, not the gate's — the only truth is the GATE_EXIT
# sentinel in the log itself, and it must be READ, not assumed.
if [ -n "${GATE_OVERRIDE:-}" ]; then
  echo "land: gate verdict overridden deliberately: ${GATE_OVERRIDE}"
elif [ -n "${GATE_LOG:-}" ]; then
  gate_sentinel="$({ grep -m1 "^GATE_EXIT=" "$GATE_LOG" 2>/dev/null || true; })"
  if [ "$gate_sentinel" != "GATE_EXIT=0" ]; then
    echo "land: REFUSING — ${GATE_LOG} has '${gate_sentinel:-no GATE_EXIT sentinel}', not GATE_EXIT=0." >&2
    exit 6
  fi
  echo "land: gate verdict read: GATE_EXIT=0 (${GATE_LOG})"
else
  echo "land: REFUSING — no gate verdict supplied. Pass GATE_LOG=<log with GATE_EXIT=0>" >&2
  echo "  or GATE_OVERRIDE='<written reason>' to take the exception deliberately." >&2
  exit 6
fi


repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

name="${task_number}-${slug}"
branch="fleet/${name}"
worktree_path="${repository_root}/.invar/worktrees/${name}"
task_directory=".invar/tasks/in-progress/${name}"
tmux_session="invar/${name}"

[ -d "$task_directory" ] || { echo "land: no in-progress record at ${task_directory}" >&2; exit 1; }

# Experiment branches are HELD FROM MAIN pending the user's adoption call.
if git show-ref --verify --quiet "refs/heads/experiment/${name}"; then
  branch="experiment/${name}"
  if [ "${ADOPT_EXPERIMENT:-0}" != "1" ]; then
    echo "land: ${branch} is HELD FROM MAIN. Re-run with ADOPT_EXPERIMENT=1 to accept." >&2
    exit 4
  fi
fi
git show-ref --verify --quiet "refs/heads/${branch}" || { echo "land: no branch ${branch}" >&2; exit 1; }

# Refuse off main — git merge lands into whatever is checked out.
current_branch="$(git branch --show-current)"
if [ "$current_branch" != "main" ] && [ "${LAND_ON_BRANCH:-0}" != "1" ]; then
  echo "land: checkout is on '${current_branch}', not main — refusing (LAND_ON_BRANCH=1 to override)." >&2
  exit 1
fi

# Refuse a mid-turn builder; an idle builder still needs its delivered report.
report_file="${task_directory}/report-${name}.md"
agent_tmux="${repository_root}/.claude/skills/agent-tmux/scripts/agent-tmux.sh"
if tmux has-session -t "$tmux_session" 2>/dev/null; then
  builder_state="$(AGENT_TMUX_PREFIX="invar/" bash "$agent_tmux" state "$name" 6 2>/dev/null || echo unknown)"
  task_engine="$(grep -o '"engine": *"[^"]*"' "${task_directory}/meta.json" 2>/dev/null | sed 's/.*: *"//; s/"//')"
  if [ "$builder_state" = "idle-unconfirmed" ] && [ "$task_engine" = "claude" ]; then
    # `state` confirms idle by cross-checking the CODEX rollout, which a claude
    # session does not have — so claude can never confirm past idle-unconfirmed
    # and the guard would refuse every claude landing forever. The pane marker
    # said idle; the delivered report (checked below) is the second witness.
    echo "land: claude session pane-idle with rollout unconfirmable — accepting with the report as second witness."
  elif [ "$builder_state" != "idle" ]; then
    echo "land: builder state is '${builder_state}', not idle — refusing." >&2
    exit 1
  fi
fi
if [ ! -f "$report_file" ]; then
  ls "$task_directory"/report-* >/dev/null 2>&1 || {
    echo "land: no report in ${task_directory} — the builder may be ASKING, not done. Refusing." >&2
    exit 1
  }
fi
report_link_source="$(ls "$task_directory"/report-* 2>/dev/null | tail -1)"
task_link_source="${task_directory}/task-${name}.md"
PATH="$HOME/.bun/bin:$PATH" bun scripts/tasks/lint-task-links.ts \
  --fix --moved-only "$report_link_source"
PATH="$HOME/.bun/bin:$PATH" bun scripts/tasks/lint-task-links.ts \
  --fix --moved-only "$task_link_source"
if [ -n "$report_link_source" ] &&
   ! PATH="$HOME/.bun/bin:$PATH" bun scripts/tasks/lint-task-links.ts "$report_link_source"; then
  echo "land: WARNING — the report has dead or bare document references." >&2
  echo "  Landing continues because legacy task records can contain old references." >&2
fi

# Refuse untracked source in the worktree — a merge will not carry it.
if [ -d "$worktree_path" ]; then
  untracked_source="$(git -C "$worktree_path" status --porcelain | awk '/^\?\? /{print substr($0,4)}' | grep -E '^(src|scripts)/' || true)"
  if [ -n "$untracked_source" ]; then
    echo "land: worktree holds UNTRACKED SOURCE a merge will not carry:" >&2
    echo "$untracked_source" >&2
    exit 1
  fi
fi

# Surface bycatch and HOLD until it is triaged into tasks.
bycatch_source="$(ls "$task_directory"/report-* 2>/dev/null | tail -1)"
if [ -n "$bycatch_source" ] && awk '/^## *[Bb]ycatch/{found=1} found' "$bycatch_source" | grep -qiE '^[-*] |^[0-9]+\.'; then
  if ! awk '/^## *[Bb]ycatch/{found=1} found' "$bycatch_source" | grep -qiE 'none observed|no out-of-scope'; then
    if [ "${BYCATCH_TRIAGED:-0}" != "1" ]; then
      echo "land: the report carries BYCATCH. Convert each item to a task, then re-run with BYCATCH_TRIAGED=1." >&2
      awk '/^## *[Bb]ycatch/{found=1} found' "$bycatch_source" | head -20 >&2
      exit 3
    fi
  fi
fi

# ---- The landing itself -----------------------------------------------------

if ! git merge --no-ff "$branch" -F "$merge_message_file" -q; then
  # GENERATED VIEWS conflict on every merge where the builder regenerated
  # them (bit twice on 2026-07-29). The resolution is always the same and
  # never manual: take either side, then REGENERATE from the folders.
  # Any other conflicted path is a real conflict — abort and refuse.
  # A failed merge that left no MERGE_HEAD never started (overwrite refusal,
  # bad ref) — there is nothing to resolve and nothing safe to commit.
  git rev-parse -q --verify MERGE_HEAD >/dev/null \
    || { echo "land: REFUSING — merge failed before starting (no MERGE_HEAD); inspect by hand." >&2; exit 5; }
  conflicted="$(git diff --name-only --diff-filter=U)"
  # A file the builder added under ITS OWN task folder at the pre-dispatch
  # path (active/<name>/) conflicts by location when HEAD renamed that folder
  # to in-progress/<name>/ at dispatch. One correct resolution exists: keep
  # the file at the renamed path. Auto-resolve for THIS task's folder only.
  own_folder_conflicts="$(printf '%s\n' "$conflicted" | grep -E "^\.invar/tasks/(active|in-progress)/${name}/" || true)"
  if [ -n "$own_folder_conflicts" ]; then
    printf '%s\n' "$own_folder_conflicts" | while read -r moved_file; do
      target_file="${moved_file/\/active\//\/in-progress\/}"
      mkdir -p "$(dirname "$target_file")"
      [ "$moved_file" != "$target_file" ] && [ -f "$moved_file" ] && git mv -f "$moved_file" "$target_file" 2>/dev/null
      git add "$target_file" 2>/dev/null || git add "$moved_file"
    done
    echo "land: relocated the task's own pre-dispatch-path file(s) to in-progress/ (rename-follow)"
    conflicted="$(git diff --name-only --diff-filter=U)"
  fi
  real_conflicts="$(printf '%s\n' "$conflicted" | grep -v -E '^(project\.active-tasks\.md|project\.tasks-completed\.md)$' || true)"
  if [ -n "$real_conflicts" ]; then
    echo "land: REFUSING — merge conflict beyond the generated views:" >&2
    printf '%s\n' "$real_conflicts" >&2
    git merge --abort
    exit 5
  fi
  [ -n "$conflicted" ] && printf '%s\n' "$conflicted" | while read -r view; do git checkout --theirs "$view" && git add "$view"; done
  PATH="$HOME/.bun/bin:$PATH" bun scripts/tasks/tasks-status.ts write-active >/dev/null 2>&1 \
    || echo "land: WARNING — write-active failed during conflict resolution" >&2
  git add -- project.active-tasks.md project.tasks-completed.md 2>/dev/null || true
  SKIP_GATE=1 git -c commit.gpgsign=false commit -q -F "$merge_message_file"
  echo "land: generated-view conflict auto-resolved by regeneration"
fi
merge_commit="$(git rev-parse --short HEAD)"

git mv "$task_directory" ".invar/tasks/completed/${name}"
completed_directory=".invar/tasks/completed/${name}"

task_file="${completed_directory}/task-${name}.md"
sed -i "0,/^State: .*/s//State: COMPLETED — ${merge_commit} — $(printf '%s' "$summary" | sed 's/[&/\\]/\\&/g')/" "$task_file"
grep -q "^State: COMPLETED — ${merge_commit}" "$task_file" \
  || { echo "land: FAIL — the State line did not take" >&2; exit 1; }

# Timing into meta.json, mechanically. Refuse a double landing.
meta_file="${completed_directory}/meta.json"
duration_minutes="unknown"
if [ -f "$meta_file" ]; then
  grep -q '"landedAt"' "$meta_file" && { echo "land: FAIL — meta.json already has landedAt" >&2; exit 1; }
  landed_at="$(date -Is)" merge_commit_env="$merge_commit" python3 - "$meta_file" <<'PY'
import json, os, sys
from datetime import datetime
path = sys.argv[1]
data = json.load(open(path))
landed_at = os.environ['landed_at']
data['landedAt'] = landed_at
started_at = data.get('startedAt')
if started_at:
    try:
        delta = datetime.fromisoformat(landed_at) - datetime.fromisoformat(started_at)
        data['durationMinutes'] = int(delta.total_seconds() // 60)
    except ValueError:
        data['durationMinutes'] = None
data['mergeCommit'] = os.environ['merge_commit_env']
open(path, 'w').write(json.dumps(data, indent=2) + '\n')
PY
  duration_minutes="$(grep -o '"durationMinutes": *[0-9]*' "$meta_file" | grep -o '[0-9]*' || echo unknown)"
  grep -q '"landedAt"' "$meta_file" || { echo "land: FAIL — landedAt did not take" >&2; exit 1; }
else
  echo "land: WARNING — no meta.json; timing not recorded" >&2
fi

git tag "finished/${branch#*/}" "$branch" 2>/dev/null || echo "land: tag finished/${branch#*/} already exists"

bash scripts/fleet/archive-session.sh "$name" \
  || echo "land: WARNING — session archive failed; run archive-session.sh by hand" >&2

PATH="$HOME/.bun/bin:$PATH" bun scripts/tasks/tasks-status.ts write-active >/dev/null 2>&1 \
  || echo "land: WARNING — write-active failed" >&2

git add -A -- .invar/tasks project.active-tasks.md project.tasks-completed.md
SKIP_GATE=1 git -c commit.gpgsign=false commit -q \
  -m "tasks: #${task_number} COMPLETED (${merge_commit}); landed via land.sh, ${duration_minutes}m" \
  -- .invar/tasks project.active-tasks.md project.tasks-completed.md

echo "land: OK #${task_number} ${slug} -> ${merge_commit} (${duration_minutes}m dispatch-to-landing)"

# Retire the workspace WITH the landing (KEEP_WORKSPACE=1 to skip). Landing is
# itself the deliberate act; by now the branch is merged + tagged and the
# session is archived, so neither the worktree nor the tmux session is a
# recovery point any longer. Bought on 2026-07-29: 31 idle sessions of landed
# tasks pinned 62 of 128 inotify instances and redded workspace-tabs on every
# pooled gate. Non-force: a dirty worktree refuses and is LEFT for a human.
if [ "${KEEP_WORKSPACE:-0}" != "1" ]; then
  if [ -d "$worktree_path" ]; then
    # Dispatch-generated untracked artifacts are not work — remove them so a
    # clean worktree does not read as DIRTY (BUILDER-FUNDAMENTALS.md blocked
    # the 494 removal on 2026-08-04). Real work stays protected: only these
    # exact generated names are cleared.
    rm -f "$worktree_path/TASK.md" "$worktree_path/BUILDER-FUNDAMENTALS.md"
    git worktree remove "$worktree_path" 2>/dev/null \
      && echo "land: worktree removed (branch + tag + archive are the record)" \
      || echo "land: worktree DIRTY or busy — left in place at ${worktree_path}" >&2
  fi
  if tmux has-session -t "$tmux_session" 2>/dev/null; then
    tmux kill-session -t "$tmux_session" \
      && echo "land: tmux session closed (transcript archived)" \
      || echo "land: WARNING — could not close ${tmux_session}" >&2
  fi
else
  echo "  KEEP_WORKSPACE=1 — worktree and tmux session left in place."
fi
