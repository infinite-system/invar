# Narration file-grammar wave — READY

Branch: `grammar-wave-narration`

Rebased base: `d603a6aad01a17e56afd832ab6f7e299b1a3cb2f` (`origin/main`)

Tip: `cbc9f1cc5c4999ae7cefb335633816ce04ab4c05`

## Files converted

- `src/modules/narration/NarrationProjection.ts`
  - Replaced private members with the protected override floor.
  - Added a protected late `SpeakableText` dependency getter; the constructor does not read it.
  - Preserved the mutable reactive `NarrationProjection.Class` binding.
- `src/modules/narration/VoiceDiscovery.ts`
  - Moved detached discovery helpers onto the eponymous static class.
  - Moved `DiscoveredVoice` below the class manifest.
  - Routed internal static calls through `this` so subclass overrides govern base behavior.
- `src/modules/narration/TtsFactory.ts`
  - Replaced the detached backing function with a static prototype method.
  - Added protected late backend-class getters for construction overrides.
  - Moved `TtsCreateOptions` below the class manifest and preserved the const Static capability binding.
- `src/modules/narration/SystemTtsBackend.ts`
  - Moved every detached helper and module constant onto the class.
  - Replaced the pending-utterance constant with a protected static getter.
  - Replaced private members with protected members and expanded shortened internal names.
  - Uses `this.constructor` for static helper/constant resolution, so derived overrides govern base methods.
  - Reads `Processes.Class` through a protected late getter only on playback, not in the constructor.
  - Moved all supporting interfaces/types below the class manifest; preserved the raw plain-class `let Class` binding.
- `src/modules/narration/MockTtsBackend.test.ts` — added the required colocated pair.
- `src/modules/narration/TtsFactory.test.ts` — added the required colocated pair and proved both backend construction seams.
- `src/modules/narration/SystemTtsBackend.test.ts` — replaced global `Processes.Class` mutation with a protected getter override and tested the protected constant seam through a subclass.
- `scripts/check-file-grammar.ts` — added `narration` to `CONVERTED_MODULES` in the final conversion commit.
- `.git-blame-ignore-revs` — appended all five post-rebase conversion hashes after existence and ancestry proof.

`SpeakableText.ts`, `SpeakableText.test.ts`, `MockTtsBackend.ts`, `TtsBackend.interface.ts`, and the remaining narration tests were already structurally compliant; the enforced module checker covers them.

## Notable decisions

- No narration behavior or invariant contract changed. Existing queue bounds, engine selection, transcript projection, barge-in, voice discovery, and markdown-to-speech behavior remain defined by the same unit and driven paths.
- Cross-module seams remain live reads. Reactive `Class` remains mutable; Static capability `Class` bindings remain const; raw stateful backend `Class` bindings remain mutable.
- The former exported `MAX_PENDING_UTTERANCES` module datum had no production consumers and became the grammar-required protected static getter. Its queue policy remains directly tested through a subclass exposure.
- No merge gate was run (`SKIP_GATE=1` was used for each file-group commit as required).
- `TASK.md` remains the only untracked worktree file; it is the supplied task artifact and was not committed.

## Verification runs

| Instrument | Result |
|---|---|
| Final rebase onto `origin/main` | PASS — `d603a6a` is an ancestor of tip |
| `bun scripts/check-file-grammar.ts src/modules/narration` | PASS — 13 files, 0 violations, narration enforced, 1 interface exemption |
| `bun scripts/check-file-grammar.ts` | PASS — 316 files, 9 converted modules enforced; 921 violations in unconverted modules remain report-only |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 610 annotations resolved, 39 lattice links resolved, 0 problems |
| `bunx tsc --noEmit` | PASS — exit 0 |
| `bun test` | PASS — 1,217 tests, 0 failures, 15,451 expectations across 144 files |
| Quiet-machine clearance before driven runs | PASS — no merge-gate process and exactly one Codex builder |
| `bun scripts/harness/smoke-audio-narration-harness.ts` | ALL-PASS — ran solo 1/1; disabled/enabled projection, hostile inline code, explicit barge-in, idle quiescence |
| `bun scripts/harness/smoke-voice-picker-harness.ts` | ALL-PASS — ran solo 1/1; command discovery, dynamic enum, keyboard and mouse settings edits |
| Blame hash proof | PASS — 5/5 hashes exist as commits and are ancestors of `HEAD` |

## Conversion commits

- `5693bee2542f851f1f7c36ca96ed9e70bf6f9663` — projection file grammar
- `b7498a16acbf99b9dc62e553fe48f1753cd7807b` — voice discovery grammar
- `a5f89bc8dd083d09ad306b8d4652113a84f26f22` — TTS factory grammar and pair
- `690335f9ae8d49adc023da3beadd91c9f8fe8eb0` — mock backend pair
- `712661e84f142640a97b10d63247688de238b838` — system TTS grammar, test seam repair, and narration enforcement flip
- `cbc9f1cc5c4999ae7cefb335633816ce04ab4c05` — final post-rebase blame-ignore metadata
