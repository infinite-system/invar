#!/usr/bin/env bash
# Land a finished dispatch: file its report, merge, park the branch, reclaim the
# worktree, and close its tmux session.
#
# WHY THE ORDER IS FIXED
#
# The report is committed BEFORE the merge, for the same reason dispatch.sh
# commits the brief before launching: a record that depends on a later step
# eventually does not happen. Five bycatch findings died in /tmp on 2026-07-27
# because converting them was a separate action from merging.
#
# It also PRINTS THE BYCATCH and refuses to proceed silently past it. AGENTS.md
# makes reporting the builder's duty and names the conductor as the one who
# triages; the conductor side had no mechanism at all, and that asymmetry lost
# five real defects in one night.
#
# Usage:
#   scripts/fleet/land.sh <task-number> <slug> <report-file> <merge-message-file>
#
# Landing is DELIBERATE: this script does not run the gate and does not push.
# The conductor gates before calling this, and pushing is a separate decision.

set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "usage: $0 <task-number> <slug> <report-file> <merge-message-file>" >&2
  exit 2
fi

task_number="$1"
slug="$2"
report_file="$3"
merge_message_file="$4"

[ -f "$report_file" ] || { echo "land: report not found: $report_file" >&2; exit 2; }
[ -f "$merge_message_file" ] || { echo "land: merge message not found: $merge_message_file" >&2; exit 2; }

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

name="${task_number}-${slug}"
branch="fleet/${name}"
worktree_path="${repository_root}/.invar/worktrees/${name}"
dispatch_directory="${repository_root}/agent-dispatches/${name}"
tmux_session="invar/${name}"

[ -d "$dispatch_directory" ] || { echo "land: no dispatch record for $name" >&2; exit 1; }

# An EXPERIMENT branch is held from main pending proof. Refuse by default, so "provenance decides
# main, not quality" stops being a rule the conductor recalls and becomes one the tooling enforces.
# A change can be correct, measured and elegant and still not belong in main because nobody asked for
# the problem to be solved — and the acceptance test is generativity: does it make neighbouring
# problems easier and neighbouring invariant records SHORTER, or does it demand exception rules?
if git show-ref --verify --quiet "refs/heads/experiment/${name}"; then
  branch="experiment/${name}"
  if [ "${ADOPT_EXPERIMENT:-0}" != "1" ]; then
    echo "land: ${branch} is HELD FROM MAIN." >&2
    echo "land: it lands only when its report shows an invariant unlock — downstream problems got" >&2
    echo "      EASIER and no exception rule was needed. Re-run with ADOPT_EXPERIMENT=1 to accept." >&2
    exit 4
  fi
  echo "land: ADOPT_EXPERIMENT=1 — accepting an experiment branch into main."
fi
git show-ref --verify --quiet "refs/heads/${branch}" || { echo "land: no branch $branch" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. REFUSE if the builder is still running. A live agent mid-write would lose
#    work to a merge, and "looks quiet" is not idle.
# ---------------------------------------------------------------------------
for pid in $(pgrep -x codex 2>/dev/null || true); do
  if [ "$(readlink "/proc/${pid}/cwd" 2>/dev/null)" = "$worktree_path" ]; then
    echo "land: builder STILL LIVE in $worktree_path (pid $pid) — refusing" >&2
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# 2. REFUSE on untracked source. `git merge` does not carry untracked files, so a
#    file the builder created but never added would silently not land — and a SKIP
#    is not a PASS.
# ---------------------------------------------------------------------------
if [ -d "$worktree_path" ]; then
  untracked_source="$(git -C "$worktree_path" status --porcelain | awk '/^\?\? /{print substr($0,4)}' | grep -E '^(src|scripts)/' || true)"
  if [ -n "$untracked_source" ]; then
    echo "land: worktree holds UNTRACKED SOURCE that a merge will not carry:" >&2
    echo "$untracked_source" >&2
    echo "land: add and commit it in the worktree first, or decide it is scratch." >&2
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# 3. File the report, and SURFACE THE BYCATCH before anything is merged.
# ---------------------------------------------------------------------------
report_target="$dispatch_directory/report.md"
round=1
while [ -e "$report_target" ]; do
  round=$((round + 1))
  report_target="$dispatch_directory/report-round${round}.md"
done
cp "$report_file" "$report_target"

echo
echo "==================== BYCATCH — convert BEFORE merging ===================="
if awk '/^## *[Bb]ycatch/{found=1} found' "$report_file" | grep -qiE '^[-*] |^[0-9]+\.'; then
  awk '/^## *[Bb]ycatch/{found=1} found' "$report_file"
  echo
  echo "land: the above is the conductor's duty per AGENTS.md — create a task for"
  echo "      each item, carrying the builder's exact evidence, and tell the user"
  echo "      about anything user-visible. Re-run with BYCATCH_TRIAGED=1 to land."
  if [ "${BYCATCH_TRIAGED:-0}" != "1" ]; then
    echo "land: HOLDING. Nothing merged, report filed at ${report_target#$repository_root/}." >&2
    exit 3
  fi
  echo "land: BYCATCH_TRIAGED=1 acknowledged; proceeding."
else
  echo "(none reported)"
fi
echo "=========================================================================="
echo

git add "$report_target"
SKIP_GATE=1 git -c commit.gpgsign=false commit -q \
  -m "report #${task_number}: ${slug}

Builder's report, verbatim, filed beside its brief. Round ${round}." \
  -- "$report_target"

# ---------------------------------------------------------------------------
# 4. Merge, park the branch, reclaim the worktree, close the session.
#    Branches are NEVER deleted — parked with finished/ so `git show` can
#    reconstruct any landed change after the worktree is gone.
# ---------------------------------------------------------------------------
git merge --no-ff "$branch" -F "$merge_message_file" -q
git tag -f "finished/${branch#fleet/}" "$branch" >/dev/null 2>&1 || true

if [ -d "$worktree_path" ]; then
  git -C "$worktree_path" checkout -- . 2>/dev/null || true
  git -C "$worktree_path" status --porcelain | awk '/^\?\? /{print substr($0,4)}' | while read -r untracked; do
    rm -rf "$worktree_path/$untracked"
  done
  git worktree remove "$worktree_path" 2>/dev/null \
    || echo "land: worktree not removed (still dirty) — left in place deliberately, never --force"
fi

tmux kill-session -t "$tmux_session" 2>/dev/null || true

echo "land: MERGED #${task_number} ${slug} -> $(git rev-parse --short HEAD)"
echo "  parked: finished/${branch#fleet/}"
echo "  record: agent-dispatches/${name}/"
echo "  NOT pushed and NOT gated — both are the conductor's separate decisions."
