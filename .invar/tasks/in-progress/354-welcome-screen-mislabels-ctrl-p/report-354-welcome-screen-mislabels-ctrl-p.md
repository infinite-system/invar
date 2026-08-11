# READY — welcome screen names Ctrl+P and F1 correctly

## In plain words

The welcome screen told people that Ctrl+P opened the command palette. It actually opens Go to
File. The screen now names Ctrl+P as Go to File and F1 as Show All Commands. I also fixed a smoke
that pressed Enter before Go to File had found its file.

## Result

READY at commit `03b3e80511fe377e04ccda3aad4b399f56436231` on
`fleet/354-welcome-screen-mislabels-ctrl-p`.

The task has three implementation commits:

- `cbed718fd244ca1d8afb044c568226790616c2aa` corrects the welcome labels and extends the existing
  welcome-bearing smoke.
- `23dd704951e42ffc7225c413ad0abe585ddc42e8` waits for the Quick Open result in the move-line smoke.
- `03b3e80511fe377e04ccda3aad4b399f56436231` corrects the move-line coverage declaration.

- [SourceTextPaneContent.ts](../../../../src/modules/editor/SourceTextPaneContent.ts) puts the two
  real bindings first. This keeps both labels readable at compact geometry.
- [smoke-renderable-disposal-harness.ts](../../../../scripts/harness/smoke-renderable-disposal-harness.ts)
  now checks both corrected labels and rejects the old label at 10 and 100,000 lines.
- [smoke-move-line-harness.ts](../../../../scripts/harness/smoke-move-line-harness.ts) uses the
  shared Quick Open helper. That helper waits for the query, ranked match, and active buffer.

The pre-existing dispatch changes in [AGENTS.md](../../../../AGENTS.md) remain untouched. I also
left the pre-existing untracked builder setup file untouched.

## Round 2 move-line repair

I ran the move-line smoke at base commit `37b40a7f7288aaceb8c15c9ef3735e25b6da24ec` and on the
branch in alternating order. The base passed 3 of 3 samples. Before the repair, the branch passed
1 of 3 samples and failed 2 of 3 samples.

Both branch failures stopped after the smoke typed `sample` into Go to File and pressed Enter. The
smoke then waited for `one`, `two`, and `three` on consecutive rows. It does not expect an absolute
row. The red frames showed no document rows. They showed the welcome block on rows 7 through 13.

The old drive only waited for the Go to File title. It typed `sample` and pressed Enter without
waiting for a ranked match. The extra welcome output changed frame timing and exposed that old race.
This was smoke sequencing, not editor layout arithmetic.

The repaired smoke calls `HarnessSmoke.Class.openFileThroughQuickOpen()`. The shared helper waits
for all three conditions before the next input:

1. Go to File is open.
2. The query and ranked path match `sample.ts`.
3. `sample.ts` is the active buffer after Enter.

The repaired branch passed 3 of 3 samples. I changed no timeout, welcome row, editor origin, or
move-line behavior. Both corrected welcome labels remain.

## Round 3 coverage declaration

[project.coverage-deltas.md](../../../../project.coverage-deltas.md) claimed assertions changed
from 7 to 6 and waits stayed at 8. The coverage ratchet measured six assertions on both sides and
one fewer local wait. The row now says `assertions 6 → 6, waits 8 → 7`.

The reason now matches the code. The shared Quick Open helper replaced the blind Enter sequence
with its ranked-match wait. All six move-line assertions remain. No smoke code changed in Round 3.

## Driven evidence

Before the change, the 100×30 welcome screen painted this row:

```text
Tab  switch pane         Ctrl+P command palette
```

The 60×15 screen clipped the same row after `Ctrl+P`. The full wrong text was still present in
the source and in the 100×30 frame.

After the change, the 60×15 frame painted these rows:

```text
Ctrl+P  Go to File       Tab  sw
F1  Show All Commands
```

The 100×30 frame painted the full rows:

```text
Ctrl+P  Go to File       Tab  switch pane
F1  Show All Commands
```

I also drove both neighboring entry paths after the copy change.

- Clicking the welcome area and pressing Ctrl+P opened the `Go to File` overlay.
- Escape closed Go to File. Pressing F1 then opened the `Command Palette` overlay.
- The welcome smoke ran the same copy check at 10 and 100,000 lines.

This task changes static empty-state copy. It has no count, removal, ordering, or saved-state
transition to attack. The adversarial axes were geometry, document scale, both real chords, overlay
close and reopen order, and the old-copy rejection.

## Positive control

I restored `Ctrl+P command palette` temporarily after I added the smoke assertion. The smoke failed
with exit 1 at this exact condition:

```text
Timed out waiting for grid condition: scale 10: the default app paints the real welcome bindings before disposal
```

The final grid showed the planted old label. I removed the plant and ran the same smoke again. It
reported `smoke-renderable-disposal-harness: ALL-PASS` at 10 and 100,000 lines.

The Round 2 positive control was the old blind-Enter sequence on the final merged branch. It failed
2 of 3 paired samples at the consecutive-document-row condition. The final red grid showed the
welcome state instead of `one`, `two`, and `three`. The shared-helper sequence passed 3 of 3.

## Verification

- `bun run build` — exit 0.
- `bun test src/modules/editor/SourceTextPaneContent.test.ts src/modules/keybindings/KeybindingDefaults.test.ts src/modules/ui/ShortcutHelp.test.ts` — 36 pass, 0 fail.
- `bunx tsc --noEmit` — exit 0.
- `bun scripts/harness/smoke-renderable-disposal-harness.ts` — ALL-PASS at 10 and 100,000 lines.
- Base `bun scripts/harness/smoke-move-line-harness.ts` — 3 of 3 ALL-PASS.
- Branch move-line smoke before Round 2 — 1 of 3 ALL-PASS, 2 of 3 red at the first document wait.
- Branch move-line smoke after Round 2 — 3 of 3 ALL-PASS.
- Round 3 `bun scripts/harness/smoke-move-line-harness.ts` — ALL-PASS.
- Round 3 `bash scripts/conventions-gate.sh` — PASS with the corrected coverage counts.
- `bun test src/modules/editor/EditorMoveLine.test.ts src/modules/editor/SourceTextPaneContent.test.ts`
  — 18 pass, 0 fail.
- `bash scripts/behavioral-contracts.sh` — ALL-PASS.
- `bun test` — 2,522 pass, 0 fail, 72,965 expectations across 389 files.
- `bash scripts/conventions-gate.sh` — PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` — every contract passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` — 1,440 annotations and
  287 lattice links resolved, with 0 problems.

## Invariants in scope

The posed copy implicates
[keybindings.invariants.md](../../../../src/modules/keybindings/keybindings.invariants.md) by
content. The welcome source also sits under the editor module and presents a UI surface, so I read
the editor and UI contracts. Round 2 also implicates
[harness.invariants.md](../../../../scripts/harness/harness.invariants.md).

- `KeybindingDefaults.ts` confirms `Ctrl+P` maps to `quickopen.open`. It confirms F1 maps to
  `palette.open` as the retained function-key alias.
- `Advertised bindings are deliverable bindings` agrees with the corrected meanings. Its mechanism
  still requires live hints from `effectiveBindings()`. The existing welcome implementation does
  not meet that stronger mechanism. This is Bycatch below.
- `The shortcut sheet lists the effective bindings` is upheld and untouched. Its focused tests
  passed, including the Ctrl+P row and rebound-hint behavior.
- I found no editor or UI invariant that records separate welcome-screen copy behavior.
- `Harness waits observe conditions not frame ordinals` is strengthened. The move-line smoke now
  waits for the query, match, and active-buffer transitions before it reads document rows.

The narrow copy correction does not add a new assumption or change a binding. It corrects the
visible values against the current default registry.

## Bycatch

- CONTRACT-LAYER VIOLATION, confirmed by inspection: `Advertised bindings are deliverable
  bindings` requires every visible hint to read `KeybindingRegistry.effectiveBindings()`.
  [SourceTextPaneContent.ts](../../../../src/modules/editor/SourceTextPaneContent.ts) still stores
  literal chords in `emptyState`. This task corrected the literals but did not add a parallel
  binding seam. The violation existed before this task.
- DISTILLATION POSSIBILITY, confirmed by inspection: the welcome hints and
  [CoreStatusBarSegments.ts](../../../../src/modules/ui/CoreStatusBarSegments.ts) both store chord
  text. `KeybindingRegistry.effectiveBindings()` is their shared generator. Unifying visible hints
  needs a binding-layer design task, so I did not widen this copy fix.
- COMPACT CLIPPING, reproduced before and after: at 60×15, welcome row 7 clips the final `e` from
  `workspace`. Row 12 clips the quit explanation after `VS Code:`. The corrected Ctrl+P and F1
  labels remain fully readable. I changed no unrelated welcome copy.
