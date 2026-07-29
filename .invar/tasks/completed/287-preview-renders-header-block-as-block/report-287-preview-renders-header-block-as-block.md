# READY — #287 preview renders header block as block

Commit: `a1290ce7d873dd136183a4f347a07234d4aa07b5`

## Result

The Markdown preview now keeps a metadata field stack on authored lines.
The parser applies this rule to a paragraph with two or more `Key: value`
lines. A single field, mixed prose, and ordinary source-wrapped prose still
reflow as CommonMark paragraphs.

This rule follows the authored block shape. It does not depend on task paths
or a fixed list of task fields. A global soft-break mode was rejected because
it would stop ordinary prose from reflowing.

H1 now uses the `keyword` color slot and bold text without an underline. H2
keeps its bold `accent` treatment. The remaining heading levels are unchanged.

The implementation and tests are in
[MarkdownParser.ts](../../../../src/modules/markdown/MarkdownParser.ts),
[MarkdownStylesheet.ts](../../../../src/modules/markdown/MarkdownStylesheet.ts),
[MarkdownParser.test.ts](../../../../src/modules/markdown/MarkdownParser.test.ts),
[MarkdownStylesheet.test.ts](../../../../src/modules/markdown/MarkdownStylesheet.test.ts),
and
[smoke-markdown-harness.ts](../../../../scripts/harness/smoke-markdown-harness.ts).

## Contract

The new renderer semantic is recorded as `Metadata fields preserve authored
lines` in
[markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md).
The existing `Markdown presentation resolves through one stylesheet` record
keeps its label. Its mechanism now states the H1 and H2 treatments.

Invariant review: both implicated chosen invariants are strengthened. The
parser keeps compact plain block records. The stylesheet remains the only
presentation seam. No downgrade or contract conflict was needed.

## Driven evidence

I drove the real
[task file](task-287-preview-renders-header-block-as-block.md) at the default
settings before the change. The preview collapsed `State:`, `Created:`,
`Engine:`, `Environment:`, `Model:`, `Effort:`, and `Priority:` into one
wrapped paragraph on preview rows 11 through 16.

I drove the same file after the change. The preview painted the seven fields
on separate authored rows 11 through 17. The long `Priority:` value wrapped
only because it exceeded the pane width.

I also drove the prose in the dispatched brief. Its source lines `Read first:`
and `— both user asks with the decision space.` still joined and reflowed as
one paragraph.

The permanent PTY smoke drives a task-shaped document in dark and light
themes. It passed these checks in each theme:

- Metadata fields paint on consecutive preview rows.
- Source-wrapped prose paints as `Prose joins across source lines.` on one row.
- H1 is bold, uses a foreground distinct from prose, and is not underlined.
- H2 stays bold and accented without an underline.

The same smoke drove 10-line and 100,000-line fixtures. Both sizes preserved
the split layout, source target, preview target, and narrow-terminal bounds.

## Positive controls

I restored the paragraph-space join while keeping the smoke assertion. The
smoke exited 1. It timed out on `dark task metadata and prose paint in the
preview`. Its final frame showed:

`State: IN-PROGRESS Created: 2026-07-29 Engine: codex`

I restored the H1 underline while keeping the cell-attribute assertion. The
smoke exited 1 with:

`FAIL dark H1 uses bold distinct color without an underline`

I removed both planted defects before the final pass.

## Verification

The final verification command passed:

`bunx tsc --noEmit && bun test && bash scripts/smoke-markdown.sh && bun scripts/harness/smoke-markdown-harness.ts && node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs && bash scripts/conventions-gate.sh`

Results:

- `bun test`: 1,911 passed, 0 failed, 68,548 expectations.
- Legacy Markdown smoke: `ALL-PASS`.
- PTY Markdown harness: `ALL-PASS`.
- Invariant checker: 15 Markdown chosen invariants, 1,119 annotations, 220
  lattice links, 0 problems.
- Conventions gate: 561 TypeScript files checked, 0 grammar violations.
- TypeScript: 0 errors.

The commit hook also ran the full merge gate. It passed all registered hard
checks and smokes.

## Bycatch

- The commit gate's `smoke: panel-split harness` timed out on its first run.
  Its built-in quiet retry passed. The failure did not reproduce on the
  immediate second run. I did not change the panel split.
