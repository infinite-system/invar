# Wave B Markdown grammar conversion — READY

## Result

Converted `src/modules/markdown/` from 102 reported FILE GRAMMAR violations to zero and added
`markdown` to `CONVERTED_MODULES`. The module is now enforced by
`scripts/check-file-grammar.ts`.

## Files converted

- `MarkdownDocument.ts` and colocated `MarkdownDocument.test.ts`
- `MarkdownParser.ts` and colocated `MarkdownParser.test.ts`
- `MarkdownPreview.ts` and colocated `MarkdownPreview.test.ts`
- `MarkdownRenderable.ts` and new colocated `MarkdownRenderable.test.ts`
- `MarkdownSplitView.ts` and new colocated `MarkdownSplitView.test.ts`
- `scripts/check-file-grammar.ts`
- `.git-blame-ignore-revs`

The three existing tests moved out of `src/modules/markdown/__tests__/`; the empty directory is
not tracked.

## Notable decisions

- Moved every exported/supporting type below its eponymous class and namespace manifest.
- Raised every former `private` member to the `protected` override floor; behavior remains on
  prototype methods.
- Replaced detached empty-array constants with cached protected static getters. Base instance
  paths resolve them through `this.constructor`, so subclass overrides govern base behavior.
- Replaced the detached runtime `InlineStyle` enum with a cached class-owned inline-style table,
  exposed through `MarkdownParser.Class.inlineStyles`; numeric packed-span values remain 1–4.
- Added subclass tests for the cached tables and newly protected Renderable/SplitView seams.
- Recorded all five grammar-only conversion commit hashes in `.git-blame-ignore-revs`.

## Verification

| Run | Result |
| --- | --- |
| `bun scripts/check-file-grammar.ts` | PASS — 275 TypeScript files; Markdown enforced with 0 violations |
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 1010 tests, 0 failures, 14436 expectations |
| `bun scripts/harness/smoke-markdown-harness.ts` | PASS — solo 1/1, all Markdown harness scenarios |
| `bun .claude/skills/invariants/scripts/check_invariants.mjs --all` | PASS — all contracts |
| `bun .claude/skills/invariants/scripts/check_invariants.mjs --refs` | PASS — 535 annotations and 39 lattice links resolved, 0 problems |
| `bash scripts/conventions-gate.sh` | PASS |
| `git diff --check e1a10df..HEAD` | PASS |
| Blame-ignore coverage | PASS — all 5 grammar-only commits present |

The smoke ran only after confirming no `merge-gate.sh` process was active.

## Commits

- `b2cf20221455f039fff80baa591e7130433d806a` — parser
- `6834b2a539140501d4d51cfe304fef9eba078815` — document
- `ae36525ff62c1d6e004d5a331b4b029d094e7465` — preview
- `9c20a8ec798d3544c5439261b8673fe745e82a27` — renderable
- `7919c248ade0abc99e8dba1103f20f05ea95bfed` — split view plus Markdown enforcement ratchet
- `d509c6bdf4a7e51ba8bfd45418b8a0f4b00c8cd1` — final blame-ignore metadata

## Tip

`d509c6bdf4a7e51ba8bfd45418b8a0f4b00c8cd1`
