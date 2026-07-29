# READY — #293 (deep preview hover blocks the next input)

## Status

READY.

Branch: `fleet/293-preview-deep-hover-blocks-next-input`

Commit: `16a8b74c` (`Fix deep Markdown preview hover input (#293)`)

The worktree is clean. I did not change the 15-second harness deadline.

## Outcome

The 100,000-line Markdown preview now accepts the pointer input after a deep link hover in
12.5 ms. The same input missed the unchanged 15-second deadline before this change.

[MarkdownPreview.ts](../../../../src/modules/markdown/MarkdownPreview.ts) now starts deep
visible-row projection at the indexed block that owns the window. It also stores compact
wrapped-text offsets for each block. Deep projection no longer walks every earlier block or
rewraps a large paragraph from its first character.

The existing source-to-rendered block map now also generates the total row count and the
block index. This removes a second full-document row-count scan.

[MarkdownSplitView.ts](../../../../src/modules/markdown/MarkdownSplitView.ts) now makes the
preview pane own pointer moves on its border. A move from the final body row to the border
clears the hover through the same helper as a body exit.

## Reproduction and measurements

I drove the default app through the PTY harness before I changed code. I used the same
gesture and the same 15-second deadline at each scale.

| Fixture lines | Input after hover | Before | After |
|---:|---|---|---|
| 10 | Pointer move | Hover 15.6 ms; next input 14.2 ms | Hover 15.3 ms; next input 15.5 ms |
| 500 | Pointer move | Hover 16.1 ms; next input 15.1 ms | Hover 12.7 ms; next input 20.8 ms |
| 100,000 | Pointer move | Hover 1,075.4 ms; next input timed out after 15,000 ms | Hover 15.0 ms; next input 12.5 ms |
| 100,000 | Escape | Hover 1,106.4 ms; next input 1,683.7 ms | Hover 14.2 ms; next input 32.5 ms |

The reproduced pointer run reported:

> 100000 pointer: hover 1075.4 ms, next TIMEOUT >15000ms

The corrected Escape run reported:

> 100000 Escape: hover 1106.4 ms, next 1683.7 ms PASS

The Escape miss reported by
[#285 (preview final body-row hit test)](../../completed/285-preview-last-body-row-hit-test/report-285-preview-last-body-row-hit-test.md)
did not reproduce. That run waited for the stationary pointer's hover reference to clear.
Escape does not move the pointer. The frame showed source focus and no tooltip, which proves
that Escape had landed. The new measurement waits for source focus instead.

The evidence ranked the cause candidates as follows:

1. Deep wrapped-row projection was the main cost. Hover publication took about 1.1 seconds
   at 100,000 lines and about 16 ms at small scale. The indexed window removed that scale
   difference.
2. The final-row-to-border pointer move had no preview move owner. The pointer coordinates
   changed, but the hover status did not. The pane-level move handler now owns that boundary.
3. Escape rejection was not a runtime cause. The source-focus frame proved that the earlier
   timeout used the wrong completion condition.

The repeatable driver is
[293-preview-hover-input-measurement.ts](293-preview-hover-input-measurement.ts). Its header
states the exact command, inputs, deadline, and output meaning.

## Contract and regression coverage

[MarkdownPreview.test.ts](../../../../src/modules/markdown/MarkdownPreview.test.ts) now
compares the block visits for the same deep visible window at 500 and 100,000 blocks. Both
scales visit the same number of blocks.

I planted the old start-at-zero traversal as a positive control. The new test failed with
`Expected: 500` and `Received: 100000`. I removed the plant. The focused file then passed
with 15 tests, 66 expectations, and no failures.

[smoke-markdown-harness.ts](../../../../scripts/harness/smoke-markdown-harness.ts) now runs
the exact trailing-body-row pointer boundary at both 500 and 100,000 lines. The unchanged
baseline failed its 100,000-line arm at the 15-second deadline. The fixed code passes both
arms.

The change strengthens the existing Markdown preview invariant. Visible-row rendering stays
windowed at both scales. I found no need to change an invariant record.

## Final verification

- `bunx tsc --noEmit` passed.
- `bun test` passed: 1,934 tests, 68,671 expectations, no failures.
- `bash scripts/smoke-markdown.sh` passed.
- `bun scripts/harness/smoke-markdown-harness.ts` passed, including the 500-line and
  100,000-line final-body-row arms.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` passed with
  1,134 annotations, 221 lattice links, and no problems.
- `bash scripts/conventions-gate.sh` passed.
- `git diff --check` passed.
- The pre-commit merge gate passed every step with no retry-only success.

The input timing gate reported a non-blocking trend warning: median 12.169 ms against the
4.928 ms reviewed baseline. The gate classified the result as green and started a new
comparable history series.

## Bycatch

- The Escape timeout in
  [#285 (preview final body-row hit test)](../../completed/285-preview-last-body-row-hit-test/report-285-preview-last-body-row-hit-test.md)
  used a pointer-hover condition for a keyboard action. The correct source-focus condition
  passed before this fix in 1,683.7 ms. I did not change the completed report.
- The supplied task brief had worktree-invalid links to the Markdown invariant record and
  [AGENTS.md](../../../../AGENTS.md). The reference checker reported one problem on entry. I
  corrected the ignored local dispatch file so the final checker could inspect the
  worktree. The dispatch file is not tracked and is not part of the commit.
