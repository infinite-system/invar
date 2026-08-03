## In plain words

The shortcut sheet reached its last page, but its row numbers broke onto two lines. The check could not read the broken numbers, so it looked as if paging stopped. The sheet now reserves enough width for its last row range, and the last page stays on one line.

## Outcome

Round 8 is READY at commit `4a1629fed31d13529dced471fa7d67047062d7bb`. The worktree is clean.

The blocking [shortcut-help smoke](../../../../scripts/harness/smoke-shortcut-help-harness.ts) now exits 0 in a bare run. The keyboard and panel-split spot checks also exit 0.

## Reproduction and cause

The bare command from the [Round 8 brief](brief-356-8-8.md) failed after the visible range reached row 94. Its final frame showed `120-150 of` on one line and `150` on the next line. The `Alt+Z View: Toggle Word Wrap` row was visible, so PageDown had reached the final page.

[OverlayLayer.ts](../../../../src/modules/ui/OverlayLayer.ts) sized the dialog from the fixed instruction text and the binding rows. It added the live range text only after layout. The final `120-150 of 150` suffix made the instruction line wider than the chosen dialog, so the suffix wrapped.

## Repair

[OverlayLayer.ts](../../../../src/modules/ui/OverlayLayer.ts) now generates the range suffix in one helper. Layout uses the suffix for the final possible page when it chooses the dialog width. Paint uses the same helper for the current page. The existing smoke needed no change.

## Positive control

I removed the range suffix from the width input after the fixed drive passed. The bare shortcut-help smoke went red with the exact filed failure: `Timed out waiting for grid condition: PageDown advances the shortcut sheet beyond row 94 while seeking Toggle Word Wrap`. The final frame again split `120-150 of 150` across two lines. I restored the width input, and the smoke passed.

## Invariant verdict

- [The shortcut sheet lists the effective bindings](../../../../src/modules/ui/ui.invariants.md): satisfied. Paging exposes the effective `Alt+Z` binding through the last page, and the range label stays readable.
- [Seams are drawn at the shared generator](../../../../project.invariants.md): satisfied. One range-hint helper supplies both layout and paint.

## Verification

| Bare command or check | Result |
| --- | --- |
| `bun scripts/harness/smoke-shortcut-help-harness.ts` | GREEN, `ALL-PASS` |
| `bash scripts/smoke-keyboard-invariant.sh` | GREEN, `PASS` |
| `bun scripts/harness/smoke-panel-split-harness.ts` | GREEN, `ALL-PASS` |
| `bun test src/modules/ui/OverlayLayer.test.ts src/modules/ui/ShortcutHelp.test.ts` | 6 pass, 0 fail, 19 expectations |
| `bunx tsc --noEmit` | PASS |
| `bash scripts/conventions-gate.sh` | PASS; 660 files checked, 0 violations in the 16 changed files, and 20 reported legacy violations |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS; 1,379 annotations and 266 lattice links resolved, 0 problems |
| `bun scripts/check-coverage-ratchet.ts` | PASS; 392 files inspected with no undeclared decrease against `a9700d9` |
| `git diff --check` and committed patch check | PASS |

I did not run [the merge gate](../../../../scripts/merge-gate.sh). I used `SKIP_GATE=1` for commit `4a1629fe`, as the [Round 8 brief](brief-356-8-8.md) requires.

## Bycatch

None observed during the Round 8 drive and spot checks.

## Instrument feedback

- EASY: the final terminal frame showed that PageDown worked and that only the range label wrapped.
- CONFUSING: the timeout named row 94 even though the final frame showed rows 120 through 150. The range parser could not read a suffix split across physical rows.
