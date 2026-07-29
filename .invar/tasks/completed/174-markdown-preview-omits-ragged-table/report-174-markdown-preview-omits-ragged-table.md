# READY — #174 (markdown preview omitted a ragged table visible in source)

## Outcome

READY at commit `61e95fae75e5a336b8b01f2f0fdbe184c2307cad`
(`fix(harness): await the current markdown preview revision`). The worktree is
clean.

This was a harness predicate defect, not a Markdown table-parser defect. The
smoke accepted a frame as soon as the already-visible heading appeared, then
asserted later preview content without first proving that the preview had
parsed the opened source revision. The fix captures the opened buffer revision,
waits for `markdownParsing === false` and
`markdownRevision === bufferRevision`, then observes visible content after the
malformed-table fixtures before asserting both fallback arms.

No product parser or renderer code changed.

## Reproduction and history

- Initial task-worktree drive:
  `bun scripts/harness/smoke-markdown-harness.ts` exited `0`.
- Plain current `main` in a detached scratch worktree also exited `0`.
- Historical candidate drives with the same command:
  - `f28f0ee` (`feat(markdown): render aligned preview tables`) exited `0`.
  - `d9e66e5` (`Merge #168: a wait for the NEXT frame asked for one that
    cannot exist`) exited `0`.
  - `faeaa99` (`format: enforce declaration spacing and reformat repository`)
    exited `1` with the exact historical `FAIL preview row missing: | Ragged`
    frame.
- `faeaa99` is therefore the observed flip commit. Its Markdown parser and
  harness diff is whitespace-only, so it changed timing rather than the
  fallback generator. The failure frame also omitted every section after the
  ragged fixture, not only the ragged rows.
- With this patch applied to the same detached `faeaa99` checkout, the smoke
  exited `0`.

## Positive control and scale

- Temporarily changed the invalid-table rejection path from
  `return startLine` to `return endLine`, which consumes a ragged table without
  emitting fallback text.
- The repaired smoke exited `1` at
  `FAIL preview row missing: | Ragged`; the missing-separator assertion stayed
  green and content after the ragged fixture was visibly rendered.
- Removed the planted defect. The normal fixed smoke exited `0`.
- Reused the smoke's existing generated Markdown fixture at about 100,000
  lines. The task-relevant toggle, revision convergence, valid-table layout,
  missing-separator fallback, ragged fallback, narrow resize, and remount
  stages all passed. No large fixture or scale-only edit remains in the tree.

## Final verification

- `bun scripts/harness/smoke-markdown-harness.ts` — exit `0`
- `bunx tsc --noEmit` — exit `0`
- `bun test` — exit `0` (`1733` passed, `0` failed)
- `bash scripts/conventions-gate.sh` — exit `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0` (`0` problems)
- `bunx prettier --check .` — exit `0`

Invariant scope was derived from the touched harness path plus the Markdown
table fallback assertions: [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md),
[src/modules/markdown/markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md), and the root project contract.
All implicated invariants are upheld (single-pass evidence review, no
downgrades).

## Bycatch

- At about 100,000 generated Markdown lines, after the task-relevant stages
  had passed, the later copy/paste phase timed out waiting for
  `the Markdown source pane is focused with a published buffer revision`.
  Steps: scale the existing section loop, run the full Markdown smoke, complete
  preview selection and Ctrl+C, then wait for source focus before paste. This
  was observed once and was not rerun; it is outside the ragged-table/revision
  wait fixed here.
