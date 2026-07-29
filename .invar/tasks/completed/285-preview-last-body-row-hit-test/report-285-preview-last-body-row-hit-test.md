# READY — #285 (preview last body row hit test)

State: READY. Branch `fleet/285-preview-last-body-row-hit-test`.
Commit: `4df65f5d`.

## Outcome

Current main already contains the generator fix from
[#289 (Markdown preview scroll sync and scrollbars)](../../completed/289-preview-scroll-sync-setting/report-289-preview-scroll-sync-setting.md).
That change removed `overflow: 'hidden'` from the bordered preview pane in
[MarkdownSplitView.ts](../../../../src/modules/markdown/MarkdownSplitView.ts).
The comment at that seam names the effect: a second scissor removes trailing-edge cells from the
OpenTUI hit grid.

I did not add a second runtime fix. I removed the old workaround from
[#276's link walk](../../completed/276-task-md-links-walkable/drive-276-walk-the-task-links.ts).
The workaround-free walk is green.

I added the focused
[drive-285-preview-last-body-row-hit-test.ts](drive-285-preview-last-body-row-hit-test.ts).
At 140x40 it reports:

```text
PASS row 36 publishes /target.ts
PASS row 38 is outside the body and publishes null
PASS row 37 publishes /target.ts
drive-285: ALL-PASS
```

This quotes both polarities. The final body row hits. The closing border below it misses.

## Red control

I restored the old `overflow: 'hidden'` setting as a temporary defect. The same drive exited 1:

```text
PASS row 36 publishes /target.ts
PASS row 38 is outside the body and publishes null
error: Timed out waiting for the final preview body row publishes its reference
```

I removed the plant before the final checks. This confirms that the landed #289 seam change is the
generator fix for the reported symptom.

I also forced the one-past unit assertion onto the visible row. The test exited 1 because it received
the `target.ts` hit instead of `null`. I restored the correct coordinate before the final checks.

## Regression contract

- [MarkdownRenderable.test.ts](../../../../src/modules/markdown/MarkdownRenderable.test.ts) checks
  that the final visible row hits and the next row misses.
- [smoke-markdown-harness.ts](../../../../scripts/harness/smoke-markdown-harness.ts) moves a linked
  heading to the final pane body row through real keys. It then checks the body row and the border
  below it.
- The same smoke keeps its existing 500-line and 100,000-line layout and scroll arms.

The exact boundary arm is green at 500 lines. A manual 100,000-line arm published the reference from
the final body row before it exposed the bycatch below. Pane hit extent does not depend on document
length, so the gated boundary arm stays at 500 lines.

## Verification

- `bunx tsc --noEmit`: exit 0.
- `bun test`: 1,933 pass, 0 fail, 68,667 assertions across 296 files.
- `bash scripts/smoke-markdown.sh`: ALL-PASS.
- `bun scripts/harness/smoke-markdown-harness.ts`: ALL-PASS.
- Invariant checker: 1,134 annotations and 222 lattice links resolved, 0 problems.
- Convention gate: PASS.
- Commit hook merge gate: PASS.
- Worktree: clean.

## Bycatch

- **Suspect: deep Markdown preview hover blocks the next input at 100,000 lines.** The scale arm
  moved `Jump 100000` to the final body row and hovered it. The status published the expected
  reference path. The next pointer move missed the 15-second harness deadline. A second run
  reproduced the stall with Escape as the next input. This may violate
  [Preview rendering follows visible rows](../../../../src/modules/markdown/markdown.invariants.md#preview-rendering-follows-visible-rows).
  The likely site is the deep-window walk in
  [MarkdownPreview.ts](../../../../src/modules/markdown/MarkdownPreview.ts). I did not fix it.
