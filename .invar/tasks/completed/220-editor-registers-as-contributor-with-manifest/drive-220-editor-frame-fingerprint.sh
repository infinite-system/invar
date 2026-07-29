#!/usr/bin/env bash
# What this script finds out: whether the editor's PER-FRAME cost changed, at three file sizes.
#
# #220 moves who CONSTRUCTS the editor column's content. Nothing about the paint should move. The
# fingerprint that proves it is `editorFrameAttribution.latestFrame` — how many document lines the
# frame read, how many fold and wrap projections it looked up, and how many layout passes it ran.
# Those counts must be IDENTICAL at 10, 100,000, and 500,000 lines (the app is named Invar because
# a large file must feel like a small one) and identical before and after the change.
#
# The gesture is #218's, unchanged: open the file, three wheel-downs, Control+End, then the two-step
# fold Control+k [ .
#
# The on-ramp is #218's too. `bun run drive --size N` cannot open the file it creates on this
# machine (ripgrep is absent, and `.gitignore` hides `tmp/`), so this builds a DIRECTORY workspace
# outside the repository and opens the file through the file tree.
#
# How to run it (from the worktree root you want to measure):
#   bash <this-file> <output-directory>
#
# How to read the output: one block per size. `LANDED` is the final frame's fingerprint and
# `editorScrollTop` is where Control+End landed; `FOLDED` is the fingerprint after the fold gesture.
# Compare the blocks from two worktrees line by line. Any difference in a count is the finding. The
# intermediate scroll offsets sampled between wheel notches are NOT part of the fingerprint: the
# wheel glide is time-based and those vary run to run.
set -u

OUTPUT_DIRECTORY="${1:?usage: drive-220-editor-frame-fingerprint.sh <output-directory>}"
mkdir -p "$OUTPUT_DIRECTORY"

for LINE_COUNT in 10 100000 500000; do
  WORKSPACE=$(mktemp -d "/tmp/invar-220-fingerprint-${LINE_COUNT}-XXXXXX")
  # The same fixture shape `bun run drive --size` generates, written where Quick Open and the file
  # tree can both see it.
  bun -e '
    // `bun -e` puts the first user argument at argv[1], not argv[2].
    const [directory, lineCount] = process.argv.slice(1);
    const lines = [];
    for (let index = 0; index < Number(lineCount); index += 1) {
      lines.push(`export const value${index} = { index: ${index}, label: "line ${index}" };`);
    }
    await Bun.write(`${directory}/scale.ts`, lines.join("\n") + "\n");
  ' "$WORKSPACE" "$LINE_COUNT"
  # A workspace outside a repository publishes a git error and an empty tree, so give it its own.
  git -C "$WORKSPACE" init -q

  echo "== size ${LINE_COUNT} =="
  bun run drive --open "$WORKSPACE" --geometry 150x40 \
    --click 'text=scale.ts' \
    --wheel down --wheel down --wheel down \
    --key Control+End \
    >"${OUTPUT_DIRECTORY}/fingerprint-${LINE_COUNT}-landed.log" 2>&1
  echo "  drive exit $?"
  echo -n "  LANDED  "
  grep -E '^editorFrameAttribution=' "${OUTPUT_DIRECTORY}/fingerprint-${LINE_COUNT}-landed.log" \
    | tail -1
  echo -n "  SCROLL  "
  grep -E '^editorScrollTop=' "${OUTPUT_DIRECTORY}/fingerprint-${LINE_COUNT}-landed.log" | tail -1

  bun run drive --open "$WORKSPACE" --geometry 150x40 \
    --click 'text=scale.ts' \
    --wheel down --wheel down --wheel down \
    --key Control+End \
    --key Control+k --key '[' \
    >"${OUTPUT_DIRECTORY}/fingerprint-${LINE_COUNT}-folded.log" 2>&1
  echo "  fold drive exit $?"
  echo -n "  FOLDED  "
  grep -E '^editorFrameAttribution=' "${OUTPUT_DIRECTORY}/fingerprint-${LINE_COUNT}-folded.log" \
    | tail -1

  rm -rf "$WORKSPACE"
done
