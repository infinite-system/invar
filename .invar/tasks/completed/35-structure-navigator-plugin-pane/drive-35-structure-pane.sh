#!/usr/bin/env bash
# What this script finds out: whether the structure navigator pane behaves at all three scales —
# a real outline on a small TypeScript file, the STATED size-budget degrade on a huge one, and a
# zero-request stated degrade on unsupported files of any size.
#
# How to run it (from the repository root; needs tsgo or typescript-language-server on PATH or in
# node_modules/.bin, and ~2 GB of scratch space):
#   bash .invar/tasks/in-progress/35-structure-navigator-plugin-pane/drive-35-structure-pane.sh /tmp/structure-drive-scratch
#
# How to read the output: four labelled drives, each ending in a block of `structure*` status
# keys. The numbers that matter:
#   - drive 1 (small TS): structureStatus="ready", structureRows > 0, structureRequests=1 —
#     the real server answered one documentSymbol request.
#   - drive 2 (100k-line huge.ts): structureStatus="unavailable" and a structureNotice naming
#     the size budget — the honest degrade, one DECLINED request, no hang, no server balloon.
#   - drive 3 (500k-line huge.ts): the same shape at 5x the size. The notice's KB number grows;
#     the REQUEST count does not.
#   - drive 4 (10-line and 500k-line .txt): structureRequests=0 in both — an unsupported file
#     costs ZERO requests at any size, which is the load-invariant scale-parity claim.
set -euo pipefail

SCRATCH="${1:?usage: drive-35-structure-pane.sh <scratch-directory>}"
REPOSITORY_ROOT="$(pwd)"
mkdir -p "$SCRATCH"

make_workspace() {
  local directory="$1" lines="$2"
  bun scripts/make-scale-workspace.ts --directory "$directory" --lines "$lines" >/dev/null
  ln -sfn "$REPOSITORY_ROOT/node_modules" "$directory/node_modules"
  git -C "$directory" init -q 2>/dev/null || true
  git -C "$directory" add -A 2>/dev/null || true
  git -C "$directory" -c user.name=drive -c user.email=drive@drive.test \
    commit -qm base 2>/dev/null || true
}

structure_keys() {
  grep -E '^structure|^lspSizeSuppressed' | tail -8
}

echo "== drive 1: small.ts outlines through the real server =="
make_workspace "$SCRATCH/scale-100k" 100000
bun run drive --open "$SCRATCH/scale-100k" --geometry 120x35 \
  --click 'text=small.ts' --key Control+Shift+u \
  --wait-for-status 'structureStatus="ready"' 2>&1 | structure_keys

echo "== drive 2: 100k-line huge.ts states the size budget =="
bun run drive --open "$SCRATCH/scale-100k" --geometry 120x35 \
  --click 'text=huge.ts' --key Control+Shift+u \
  --wait-for-status 'structureStatus="unavailable"' 2>&1 | structure_keys

echo "== drive 3: 500k-line huge.ts states the same budget, then small.ts still answers =="
make_workspace "$SCRATCH/scale-500k" 500000
bun run drive --open "$SCRATCH/scale-500k" --geometry 120x35 \
  --click 'text=huge.ts' --key Control+Shift+u \
  --wait-for-status 'structureStatus="unavailable"' \
  --key Control+Shift+e --click 'text=small.ts' --key Control+Shift+u \
  --wait-for-status 'structureStatus="ready"' 2>&1 | structure_keys

echo "== drive 4: unsupported .txt costs zero requests at 10 and 500k lines =="
python3 - "$SCRATCH/scale-500k" <<'PYTHON'
import os, sys
root = sys.argv[1]
with open(os.path.join(root, 'notes-10.txt'), 'w') as small_file:
    small_file.writelines(f"note line {index}\n" for index in range(10))
with open(os.path.join(root, 'notes-500k.txt'), 'w') as large_file:
    large_file.writelines(f"note line {index}\n" for index in range(500000))
PYTHON
git -C "$SCRATCH/scale-500k" add notes-10.txt notes-500k.txt 2>/dev/null || true
git -C "$SCRATCH/scale-500k" -c user.name=drive -c user.email=drive@drive.test \
  commit -qm notes 2>/dev/null || true
bun run drive --open "$SCRATCH/scale-500k" --geometry 120x35 \
  --click 'text=notes-10.txt' --key Control+Shift+u \
  --wait-for-status 'structureStatus="unavailable"' \
  --key Control+Shift+e --click 'text=notes-500k.txt' --key Control+Shift+u --frame-silent \
  2>&1 | structure_keys
