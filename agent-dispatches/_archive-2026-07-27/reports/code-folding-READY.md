# Code folding — READY

Commit: `d61124df61459bb408b6e02fcd6477e002b0b914`

Branch: `feat-code-folding`, based on `8c1dd7e153e43f5d9c414fb9b5bcb3d161c8389f`

## Outcome

- Added revision-cached structural folding for syntax-tokenized brace/bracket blocks and
  indentation runs. Delimiter-shaped strings and comments do not create folds.
- Extended `EditorWrap` as the one document-line-to-visual-row generator. Wrapping contributes
  multiple segments, folding contributes zero-row hidden lines, and the same index/window now feeds
  rendering, gutter, caret, selection, pointer hit-testing, movement, scrolling, scrollbars, and
  overview-ruler projection.
- Added theme `foldOpen` / `foldClosed` slots. Unicode/nerd use `⌄` / `›`; ASCII uses `v` / `]`.
  Every tier agrees at one cell across the app width authority and the independent terminal
  emulator, and the Unicode controls avoid the complete reserved/activity mark set.
- Put the exact mouse control at the number-gutter edge, leaving the adjacent diff column
  diff-only. A collapsed range paints its header and a second closed indicator in the code body.
- Vertical, horizontal, word, paging, and selection movement skip folded bodies. Programmatic
  navigation into a body auto-unfolds it; the driven Find path proves this behavior.
- Fold state lives on the stable `DocumentHandle`, survives file dehydration/rehydration and
  workspace activation, and is dropped when the document handle is closed.
- Added editor-context keybinding-table chords: `Ctrl+K` then `[` folds; `Ctrl+L` then `]` unfolds.
  The existing `Ctrl+Shift+[` / `]` workspace bindings remain unchanged. Both new byte sequences
  decode through OpenTUI's legacy and kitty parser modes.
- Recorded **One generator owns document-line-to-visual-row**, including the required impossible
  case: “Two disagreeing document-line-to-visual-row mappings consulted by different consumers.”

## Driven evidence

`scripts/harness/smoke-code-folding-harness.ts`:

- Final-source runs: exit `0`, `0`, `0`.
- Loaded run with four concurrent CPU burners: exit `0`.
- Post-commit run: exit `0`.
- Drives a real TypeScript file, clicks the exact open gutter cell, observes the collapsed grid and
  both closed indicators, unfolds by mouse, folds by keyboard, moves the caret across the hidden
  body, navigates into it through Find to auto-unfold, then switches files and observes the fold
  after rehydration.
- Registered with `parallel_safe_smoke` in `scripts/merge-gate.sh`; it contains no duration or
  absence measurement.

The final touched suite covered 18 directly affected test files:

- 130 passed, 0 failed, 4,811 expectations — three runs, each exit `0`.
- `scripts/marks-overview-benchmark.ts` — three compatibility runs, each exit `0`; cached overview
  reads remained approximately 0.016–0.030 microseconds and 10,000-mark recomputation remained
  approximately 1.25–1.39 milliseconds.

## Scroll smoothness

The same 12-notch, three-gesture instrument was run before and after:

| Gesture | Before | After |
| --- | --- | --- |
| 1 | frames 19, moving 18, distance 48, max delta 7, mean 2.67, 21.7 FPS, 3,109 mean bytes | frames 19, moving 18, distance 48, max delta 7, mean 2.67, 21.6 FPS, 3,109 mean bytes |
| 2 | frames 18, moving 17, distance 36, max delta 5, mean 2.12, 20.1 FPS, 3,105 mean bytes | frames 18, moving 17, distance 36, max delta 5, mean 2.12, 20.5 FPS, 3,105 mean bytes |
| 3 | frames 17, moving 16, distance 36, max delta 6, mean 2.25, 20.0 FPS, 3,106 mean bytes | frames 18, moving 17, distance 36, max delta 5, mean 2.12, 20.2 FPS, 3,105 mean bytes |

Verdict: no scroll regression. Distance and cadence are preserved; the third gesture gained one
moving frame and reduced its maximum/mean delta.

## Required checker suite

- `bun install --frozen-lockfile`: exit `0`.
- `bunx tsc --noEmit`: exit `0` (also repeated post-commit).
- `bun test`: exit `0` — 1,553 passed, 0 failed, 16,975 expectations.
- `bun scripts/check-file-grammar.ts`: exit `0` — 452 files, 0 violations.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: exit `0` — 828
  annotations and 45 lattice links resolved, 0 problems.
- `bash scripts/conventions-gate.sh`: exit `0`.
- `bun scripts/check-coverage-ratchet.ts`: exit `0` — 294 files, no undeclared decrease.
- `bash scripts/behavioral-contracts.sh`: exit `0` — all contracts passed, including
  idle-quiescence at frame `2 → 2`, wrap true-last-row reachability, glide smoothness, scrollbar
  stability paths, focus recovery, pane independence, and plugin lifecycle.
- `git diff --check`: exit `0`.
- `bash -n scripts/merge-gate.sh`: exit `0`.
- Tracked TASK-file check: no matches.

Coverage movement was appended to `project.coverage-deltas.md` with exact counted grammar for the
new smoke/test files and every changed coverage-bearing test.

The commit used:

`SKIP_GATE=1 git -c commit.gpgsign=false commit -F /tmp/code-folding-commit.txt`

The worktree is clean. `scripts/merge-gate.sh` was not run. No push, merge, tag, branch deletion, or
worktree deletion was performed.

COMPACTION: one automatic context compaction; work continued from the generated summary without
restarting completed work.

conventions @ `f17a7b351ef6ccb324133d7160aac452b07202b9`
