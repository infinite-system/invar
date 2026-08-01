#!/usr/bin/env bash
# require-main-checkout.sh — refuse to keep fleet records anywhere but the
# PRIMARY checkout. Sourced by dispatch.sh and round-brief.sh.
#
# WHY THIS EXISTS (2026-08-01, third incident of the same class):
#
# The conductor ran `round-brief.sh` while its shell was still inside a
# throwaway integration worktree under /tmp. The script resolves its root from
# its own path, so it filed brief-452-2 into THAT worktree's .invar/tasks/. The
# steer then pointed the builder at a path that existed nowhere it could see,
# and the builder sat idle for about thirty minutes doing nothing.
#
# The damage is not the misplaced file — it is that the failure was SILENT.
# Every guard fired green: the folder existed, the brief validated, meta.json
# stamped, the steer landed in the builder's session record. Only the builder's
# silence eventually gave it away, and silence is indistinguishable from
# thinking. A no-op that reports success is worse than a crash.
#
# Earlier incidents in the same class: #434's task folder created inside a
# worktree, and a Drive.ts edit landed in a worktree instead of main. Both were
# recovered by hand. Three times means it stops being something the conductor
# remembers and becomes something a script refuses.
#
# THE TEST: a linked worktree has its own .git FILE pointing into
# .git/worktrees/<name>, so `--git-dir` and `--git-common-dir` resolve
# differently. In the primary checkout they resolve to the same directory. That
# is a structural fact about git, not a heuristic about paths — it cannot be
# fooled by a symlink, a bind mount, or a /tmp prefix.

fleet_require_main_checkout() {
  local caller_name="$1"
  # Optional second argument: the root the CALLER will actually write to
  # (resolved from its own $0). Checking the cwd alone misses the mirror-image
  # mistake — running a WORKTREE's copy of the script while standing in main
  # would pass a cwd test and still file into the worktree.
  local caller_root="${2:-}"

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "${caller_name}: REFUSING — not inside a git checkout." >&2
    return 2
  fi

  local git_dir git_common_dir
  git_dir="$(cd "$(git rev-parse --git-dir)" && pwd)"
  git_common_dir="$(cd "$(git rev-parse --git-common-dir)" && pwd)"

  local main_checkout
  main_checkout="$(dirname "$git_common_dir")"

  if [ -n "$caller_root" ] && [ "$git_dir" = "$git_common_dir" ]; then
    local resolved_caller_root
    resolved_caller_root="$(cd "$caller_root" && pwd)"
    if [ "$resolved_caller_root" != "$main_checkout" ]; then
      echo "${caller_name}: REFUSING — you are standing in the main checkout, but this" >&2
      echo "  copy of the script would write to a different tree." >&2
      echo "  script writes to: ${resolved_caller_root}" >&2
      echo "  main checkout:    ${main_checkout}" >&2
      echo "  Run the MAIN checkout's copy: ${main_checkout}/scripts/fleet/" >&2
      return 2
    fi
  fi

  if [ "$git_dir" != "$git_common_dir" ]; then
    echo "${caller_name}: REFUSING — this is a LINKED WORKTREE, not the main checkout." >&2
    echo "  worktree:      $(git rev-parse --show-toplevel)" >&2
    echo "  main checkout: ${main_checkout}" >&2
    echo "" >&2
    echo "  Fleet records (task folders, briefs, meta.json) live in the main" >&2
    echo "  checkout ONLY. Filing here would write into a throwaway tree the" >&2
    echo "  builder cannot see, and the steer would point at nothing — which" >&2
    echo "  looks exactly like success until the builder stays silent." >&2
    echo "" >&2
    echo "  Re-run from: ${main_checkout}" >&2
    return 2
  fi

  return 0
}

# Both arms, runnable: `bash scripts/fleet/require-main-checkout.sh --self-test`
# It must PASS in the main checkout and REFUSE in a linked worktree. A guard
# proven in only one polarity cannot tell "allowed" from "cannot see".
if [ "${1:-}" = "--self-test" ]; then
  set -u
  self_test_failures=0

  if fleet_require_main_checkout "self-test" >/dev/null 2>&1; then
    echo "  PASS  the main checkout is allowed"
  else
    echo "  FAIL  the main checkout was REFUSED — the guard cannot say yes" >&2
    self_test_failures=$((self_test_failures + 1))
  fi

  # The negative arm needs a real linked worktree, so make one, ask it, drop it.
  probe_root="$(mktemp -d)/linked-worktree-probe"
  if git worktree add --detach "$probe_root" HEAD >/dev/null 2>&1; then
    if (cd "$probe_root" && fleet_require_main_checkout "self-test" >/dev/null 2>&1); then
      echo "  FAIL  a linked worktree was ALLOWED — the guard cannot say no" >&2
      self_test_failures=$((self_test_failures + 1))
    else
      echo "  PASS  a linked worktree is refused"
    fi
    git worktree remove --force "$probe_root" >/dev/null 2>&1 || true
  else
    echo "  FAIL  could not create a probe worktree; the negative arm did not run" >&2
    self_test_failures=$((self_test_failures + 1))
  fi

  if [ "$self_test_failures" -eq 0 ]; then
    echo "SELF-TEST: the guard says yes in the main checkout and no in a worktree."
    exit 0
  fi
  echo "SELF-TEST: ${self_test_failures} FAILURE(S)" >&2
  exit 1
fi
