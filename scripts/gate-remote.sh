#!/usr/bin/env bash
# gate-remote.sh — run the full merge gate on a remote Linux host, from any machine.
#
# Exists because the gate cannot run on macOS (its smokes drive the FFI PTY harness), and because
# a hand-rolled remote run gets the environment wrong in ways that cost real diagnosis time
# (2026-08-10: a non-interactive ssh PATH without node/claude/codex produced 8 false timeout-class
# reds that looked exactly like code failures). This script encodes the correct procedure:
#
#   1. The gated tree is the EXACT commit you name (default: HEAD) — it must be pushed, so the
#      remote fetches the same bytes you will land.
#   2. A fresh throwaway worktree per run, never the remote's own checkout.
#   3. `bun install` in the worktree (worktrees copy tracked files only).
#   4. The gate runs with the remote's LOGIN toolchain (bun + nvm node + ~/.local/bin for
#      claude/codex), detached, so it survives this ssh session.
#   5. The verdict is READ from the log's GATE_EXIT sentinel, never inferred.
#
# Usage:
#   bash scripts/gate-remote.sh                 # gate HEAD on the default host
#   bash scripts/gate-remote.sh <ref>           # gate a specific pushed ref/sha
#   GATE_HOST=myhost bash scripts/gate-remote.sh
#
# Exit code: the gate's own exit code (0 green, 1 red, 2 setup failure).
set -euo pipefail

GATE_HOST="${GATE_HOST:-ubuntu2}"
REF="${1:-HEAD}"
SHA="$(git rev-parse "$REF")"
SHORT="$(git rev-parse --short "$SHA")"

# The gated tree must be reachable by the remote. A local-only commit would silently gate
# nothing (the remote fetch would miss it), so refuse instead.
if ! git branch -r --contains "$SHA" 2>/dev/null | grep -q .; then
  echo "gate-remote: commit $SHORT is not on any remote branch." >&2
  echo "gate-remote: push it first (git push), then re-run." >&2
  exit 2
fi

WORKTREE="/tmp/gate-remote-$SHORT"
LOG="/tmp/gate-remote-$SHORT.log"
echo "gate-remote: gating $SHORT on $GATE_HOST (worktree $WORKTREE)"

# Compose the login toolchain PATH on the remote: bun, the newest nvm node, and ~/.local/bin
# (claude/codex). Non-interactive ssh gets none of these by default, and a gate without them
# fails its LSP and agent smokes with false timeout reds.
ssh "$GATE_HOST" bash -s -- "$SHA" "$WORKTREE" "$LOG" <<'REMOTE'
set -euo pipefail
SHA="$1"; WORKTREE="$2"; LOG="$3"
NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1 || true)"
export PATH="$HOME/.local/bin${NODE_BIN:+:$NODE_BIN}:$HOME/.bun/bin:$PATH"
for tool in bun node; do
  command -v "$tool" > /dev/null || { echo "gate-remote: $tool not found on remote; install it, then re-run." >&2; exit 2; }
done
cd "$HOME/dev/invar"
git fetch --all --quiet
[ -e "$WORKTREE" ] && { echo "gate-remote: $WORKTREE already exists; remove it or gate a new commit." >&2; exit 2; }
git worktree add --detach "$WORKTREE" "$SHA" > /dev/null
cd "$WORKTREE"
bun install --frozen-lockfile > /dev/null 2>&1 || bun install > /dev/null
setsid bash -c "export PATH=\"$PATH\"; bash scripts/merge-gate.sh > \"$LOG\" 2>&1; echo GATE_EXIT=\$? >> \"$LOG\"" < /dev/null > /dev/null 2>&1 &
echo "gate-remote: launched; log $LOG"
REMOTE

# Poll for the sentinel with a hard deadline; a wait that can never fire must be
# distinguishable from one still waiting.
DEADLINE=$((SECONDS + 3600))
while [ $SECONDS -lt $DEADLINE ]; do
  VERDICT="$(ssh -o BatchMode=yes "$GATE_HOST" "grep -m1 '^GATE_EXIT=' '$LOG' 2>/dev/null" || true)"
  if [ -n "$VERDICT" ]; then
    echo "gate-remote: $VERDICT (log: $GATE_HOST:$LOG)"
    ssh "$GATE_HOST" "tail -20 '$LOG'"
    if [ "$VERDICT" = "GATE_EXIT=0" ]; then
      # Plain remove only — never --force. The gate appends perf-history inside its worktree, so
      # git may refuse; then the worktree is kept and named, and a human sweeps it deliberately.
      ssh "$GATE_HOST" "cd \"\$HOME/dev/invar\" && git worktree remove '$WORKTREE' 2>/dev/null" \
        || echo "gate-remote: worktree kept (dirty with gate artifacts): $GATE_HOST:$WORKTREE"
      exit 0
    fi
    echo "gate-remote: RED — worktree and logs kept on $GATE_HOST for evidence." >&2
    exit 1
  fi
  sleep 30
done
echo "gate-remote: DEADLINE EXPIRED after 60 minutes — the gate may be hung; inspect $GATE_HOST:$LOG" >&2
exit 2
