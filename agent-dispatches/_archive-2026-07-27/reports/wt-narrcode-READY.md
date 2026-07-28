# Narration inline-code fix — READY

Branch: `fix-narration-inline-code`

Rebased base: `origin/main` at `0c0110f9f69020b73dc2a05463d82b3843044542`

Tip: `50fb07eccd8a5acd745dbb6509879a837c28fcbf`

## Pre-fix reproduction

The unit-level probe constructed a real `AgentSession` + `NarrationProjection` with
`MockTtsBackend`, emitted a completed assistant turn, and printed the backend's recorded text.

```text
{"input":"run `bun test` first","spoken":["run bun test first"]}
{"input":"`bun test` comes first","spoken":["bun test comes first"]}
{"input":"finish with `bun test`","spoken":["finish with bun test"]}
{"input":"run `bun test` then `bun run build`","spoken":["run bun test then bun run build"]}
{"input":"symbols `+++` remain","spoken":["symbols code remain"]}
{"input":"keep `---` here","spoken":["keep here"]}
```

The exact `bun test` example did not reproduce as dropped on base `a01c576`: the earlier pass
already preserved simple word spans at mixed/start/end/multiple positions. The real uncovered
failure was the broader user rule: inline content was classified and rewritten after backtick
removal. Symbol/code-like content became the generic word `code`, and a hyphen-only span was
dropped altogether. The adjacent symbol-only case therefore reproduced the content-loss bug.

## Fix summary

- `SpeakableText.forSpeech` now extracts single-backtick inline spans into collision-free protected
  placeholders before any prose transforms and restores each captured string verbatim afterward.
  Only the delimiter backticks are removed.
- Inline commands, identifiers, paths, expressions, internal punctuation/spacing, and symbol-only
  spans therefore remain in their original position.
- `SpeakableText.ts` now follows the file grammar: imports, invariant annotations, then the
  eponymous static-capability class; helper behavior and data live on overridable class methods/getters.
- `NarrationProjection.test.ts` covers mixed prose, message start, message end, multiple spans, and
  symbol-only content through the real projection and mock TTS seam.
- `smoke-audio-narration-harness.ts` drives an echo-agent reply containing `` `bun test` `` and asserts
  the mock TTS records `bun test` without backticks.
- The narration contract was refined from symbol-rewriting to the user-adjudicated rule:
  `Inline code content is preserved without backticks`.

## Fenced-block behavior

Fenced multi-line blocks are unchanged and remain out of scope. They are not narrated as source;
the projection replaces the whole fence with the spoken placeholder `code block`.

```text
{"input":"before\n```ts\nconst value = 1;\n```\nafter","spoken":["before code block after"]}
```

## Verification

All final verification below ran after rebasing onto the current `origin/main`.

| Check | Result |
| --- | --- |
| `$HOME/.bun/bin/bunx tsc --noEmit` | PASS |
| `$HOME/.bun/bin/bun test` | PASS — 825 tests, 0 failures, 12,836 expectations |
| `bun scripts/harness/smoke-audio-narration-harness.ts` run 1/5 | ALL-PASS |
| `bun scripts/harness/smoke-audio-narration-harness.ts` run 2/5 | ALL-PASS |
| `bun scripts/harness/smoke-audio-narration-harness.ts` run 3/5 | ALL-PASS |
| `bun scripts/harness/smoke-audio-narration-harness.ts` run 4/5 | ALL-PASS |
| `bun scripts/harness/smoke-audio-narration-harness.ts` run 5/5 | ALL-PASS |
| `bun .claude/skills/invariants/scripts/check_invariants.mjs --all` | PASS — all contracts |
| `bun .claude/skills/invariants/scripts/check_invariants.mjs --refs` | PASS — 532 annotations and 39 lattice links resolved, 0 problems |
| `bash scripts/conventions-gate.sh` | PASS |

No merge gate was run. Before each harness repetition, `pgrep -f merge-gate` was checked; the only
matches were two long-lived zero-CPU `ugrep` log observers, and no executable merge-gate process was
active.
