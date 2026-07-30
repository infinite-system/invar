#!/usr/bin/env bash
# claude-conductor.sh — launch claude as the conductor, fundamentals pre-loaded.
#
# One short command. Generates the system-prompt fundamentals FRESH (so
# doctrine edits reach the next incarnation automatically), writes them to the
# repo-relative tmp/ directory, and execs claude with them appended to the
# system prompt — the only memory tier that survives compaction unread.
#
#   bash scripts/claude-conductor.sh            # interactive conductor session
#   bash scripts/claude-conductor.sh --continue # pass-through of any claude args
#
# The generated file is timestamped under tmp/ (gitignored, survives for
# inspection: which fundamentals did THIS incarnation launch with?).

set -euo pipefail

repository_root="$(git rev-parse --show-toplevel)"
prompt_directory="${repository_root}/tmp"
mkdir -p "$prompt_directory"

prompt_file="${prompt_directory}/conductor-system-prompt-$(date +%Y%m%dT%H%M%S)-$$.md"
bash "${repository_root}/scripts/conductor-system-prompt.sh" > "$prompt_file"

# Refuse an empty or headless generation — appending nothing is silent failure.
if ! grep -qF 'END OF FUNDAMENTALS' "$prompt_file"; then
  echo "claude-conductor: FATAL — generated prompt is incomplete: ${prompt_file}" >&2
  exit 3
fi

echo "claude-conductor: fundamentals -> ${prompt_file} ($(wc -c <"$prompt_file") bytes)"
cd "$repository_root"
exec claude \
  --system-prompt USE_IBR_FOR_REASONING \
  --append-system-prompt-file "$prompt_file" \
  --dangerously-skip-permissions \
  "$@"
