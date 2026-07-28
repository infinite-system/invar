# READY — Agent pane word-boundary wrap and composer right padding

## Tip

- Branch: `fix-agent-word-wrap`
- Commit: `5afd89e13c5764ed1b322a3ff1a376c315b1f06b`
- Subject: `fix(agent): wrap pane text at word boundaries`
- Base after required rebase: `origin/main` at `c5074e337989661dedf2a2077902c8df736c6cf9`

## Files

- `src/modules/agent/AgentWordWrap.ts`
- `src/modules/agent/AgentWordWrap.test.ts`
- `src/modules/agent/AgentComposer.ts`
- `src/modules/agent/AgentComposer.test.ts`
- `src/modules/agent/AgentTranscriptProjection.ts`
- `src/modules/agent/AgentTranscriptProjection.test.ts`
- `src/modules/agent/agent.invariants.md`
- `src/modules/system/TextSegmentation.ts`
- `src/modules/system/TextSegmentation.test.ts`
- `scripts/harness/smoke-agent-pane-ux-harness.ts`

## Wrap-rule decisions

- Transcript and composer both use the single `AgentWordWrap` generator.
- Whitespace is the normal wrap boundary. Separator whitespace consumed by a soft wrap remains in
  source geometry for caret, editing, selection, and copy, but is not painted as a leading blank on
  the continuation row. True trailing spaces remain preserved.
- A token wider than the available row first breaks after an existing `-`. If no usable hyphen fits,
  it hard-breaks by whole grapheme clusters as the last resort.
- `TextSegmentation.words` supplies `Intl.Segmenter` word boundaries; grapheme segmentation and the
  existing `WrapText` display-cell measurement keep CJK, astral emoji, and combining sequences safe.
- Composer text reserves exactly two blank columns at the right edge, encoded by the protected static
  `rightPaddingColumns` getter. Its two-column prompt gutter is separate.
- Collapsed one-line tool and permission chrome remains clipped rather than prose-wrapped.

## Verification

| Check | Result |
| --- | --- |
| `bunx tsc --noEmit` | PASS — `TSC=0` |
| `bun test` | PASS — 1,097 tests, 0 failures, 14,716 assertions across 134 files |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 586 annotations and 39 lattice links resolved, 0 problems |
| `bun scripts/check-file-grammar.ts` | PASS — 303 files; 1,104 pre-existing report-only violations unchanged; no `CONVERTED_MODULES` change |
| Targeted wrap/composer/projection/segmentation unit tests | PASS — 54 tests, 0 failures |
| Machine-quiet check before final driven smoke | PASS — no merge gate or smoke harness remained active |
| `bun scripts/harness/smoke-agent-pane-ux-harness.ts` | ALL-PASS — echo transcript rows reconstruct without word splits; ordinary and hyphenated composer wraps verified; two right-gap columns blank; native wrapped caret correct |
| `git fetch origin && git rebase origin/main` | PASS — branch already up to date |

The full merge gate was not invoked, per task protocol.
