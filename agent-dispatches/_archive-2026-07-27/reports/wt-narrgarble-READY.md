# Narration placeholder leak — READY

## Result

Narration now proves that every extracted inline-code token is restored exactly once before speech.
If that proof fails, the backend receives the untransformed assistant text and the transcript receives
a visible warning. No internal token is allowed to become speakable.

## Reproduction and root cause

The hostile-shape census covered adjacent spans (`` `a``b` ``), message boundaries, bold/link/list
rewrites, an unterminated backtick, several spans in one sentence, placeholder-like content (including
the private-use token alphabet), and multiple paragraphs.

The concrete restore miss was:

```text
[visible text](`inlineDestination`)
```

Inline-code extraction registered `inlineDestination`, then the link rewrite discarded the destination
containing its placeholder. The old ordered `replaceAll` loop had no registry-drained assertion, so it
could return after a missing restoration. That case silently lost the protected content; the same
unchecked boundary was capable of letting a transformed placeholder fragment reach TTS.

The queue was not a second cause. A controlled process-exit unit case proves that only the first
utterance starts immediately; the second and third start one at a time only after the active process
exits. Existing tests also prove the pending queue remains bounded and drops oldest entries past its
cap.

## Fix design

- `SpeakableText.prepareForSpeech` stores collision-free placeholder-to-content pairs in a `Map`.
- One final regex sweep over the fully transformed string restores registered tokens and deletes each
  restored entry.
- The transformed result is accepted only when the registry is empty and the selected token prefix is
  absent. Missing, duplicate, modified, or surviving tokens all fail the same totality check.
- Failure returns the untouched original assistant text with `usedOriginalFallback: true`.
- `NarrationProjection` consumes that checked result immediately before `TtsBackend.speak` and appends
  `Narration warning: formatting protection failed; speaking the original text.` as a visible system
  transcript entry on fallback.
- The new chosen invariant, `Internal tokens are never speakable`, records and annotates this boundary.

## Verification

Final verification ran after rebasing onto `main` at
`5cabfc5635b1ec9440d6e3df6ef7fc0e4b370bc8`.

| Check | Result |
| --- | --- |
| `$HOME/.bun/bin/bunx tsc --noEmit` | PASS |
| `$HOME/.bun/bin/bun test` | PASS — 1,062 tests, 0 failures, 14,615 expectations across 126 files |
| `$HOME/.bun/bin/bun test src/modules/narration/` | PASS — 42 tests, 0 failures |
| `bash scripts/conventions-gate.sh` | PASS |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | PASS — narration contract has 1 reality and 8 chosen invariants |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` | PASS — 559 annotations and 39 lattice links resolved, 0 problems |
| `$HOME/.bun/bin/bun scripts/harness/smoke-audio-narration-harness.ts` | PASS 5/5 consecutive rebased runs; every run ALL-PASS |

The driven harness asserts the mock backend receives adjacent, bold, linked, and placeholder-like
inline-code content verbatim without backticks or private-use internal tokens. Each run also verifies
disabled narration, explicit barge-in, and idle quiescence.

## Tip

`f11d070023d6e6e5e10d3002d770deb9dbd1acaf`

