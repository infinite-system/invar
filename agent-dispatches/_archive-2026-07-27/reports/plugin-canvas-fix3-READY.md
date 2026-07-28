# Plugin canvas NUDGE 3 — READY

Commit: `29b9e9c` (`Ratchet wrap glide against progressive momentum`)

## Diagnosis and named asymmetry

The runtime path at `068f7d7` did **not** contain the reported wrap-versus-editor
generator asymmetry:

- wrap mode went through `EditorPane.wireHandlers`'s `wordWrap` branch and then
  `Workspace.impulseEditorVerticalScroll`;
- non-wrap editor vertical wheel went through `EditorPane.wireHandlers`'s
  non-horizontal branch and then the same
  `Workspace.impulseEditorVerticalScroll`;
- `Workspace.tickScrollAnimations` advanced both through the same
  `Momentum.stepMomentum`; only its downstream clamp differed, using
  `EditorWrap.totalVisualRows` for wrap and logical `lineCount` for non-wrap.

The live status channel confirmed this before any edit:
`workspaceScrollMomentumAtRest=false` immediately after a wrap notch. Five
independent one-notch wrap probes each produced `early=1, settled=2, rest=2`,
and a five-notch wrap probe produced `gain=19 vs single=2, rest=21`.

The actual asymmetry was in the behavioral contract:

- wrap mode went through the retired single-notch overshoot discriminator
  (`settled > 1`);
- editor and tree went through `glide_pane`'s progressive five-notch gain
  comparison.

The same script already explains why the single-notch discriminator is invalid
after progressive impulse gain: the deliberately small first notch straddles
the one-versus-two-row rounding boundary and can settle at either value. Thus
the reported `early=1 settled=1 rest=1` was a false red, not evidence that
momentum had been bypassed.

## Change

`scripts/behavioral-contracts.sh` now measures wrap with the same generator-level
proof as editor and tree:

1. one notch settles and stays at rest;
2. five rapid notches gain materially more travel;
3. the ramped result decays to a stable rest.

The existing true-last-visual-row assertion is unchanged.

`src/modules/ui/ui.invariants.md` no longer claims wrap uses a direct step. It
records the existing shared `Workspace.impulseEditorVerticalScroll` route and
the downstream visual-row extent distinction.

No `Momentum`, `ScrollPhysics`, editor runtime, accepted scroll publication,
anchor fix, or coverage declaration was changed.

## Wrap numbers before and after

- User-supplied old discriminator: `early=1 settled=1 rest=1`.
- Local pre-edit one-notch drive: `early=1 settled=2 rest=2`; momentum active
  immediately after the notch.
- Final committed contract:
  `gain=19 vs single=2, rest=21; early=1`.
- True wrapped bottom: `scrollTop=569 > 200 logical lines`.
- Editor comparison on the committed run:
  `gain=19 vs single=2, rest=21`.

## Scrollbar drives

All three `smoke-scrollbars-harness.ts` runs exited 0.

| Run | Wrap-off distinct positions | Wrap-on distinct positions | Exit |
| --- | ---: | ---: | ---: |
| 1 | 160 | 157 | 0 |
| 2 | 157 | 158 | 0 |
| 3 | 156 | 154 | 0 |

The accepted live `scrollTop` publication therefore remained live rather than
collapsing to one observed position. Wrap-off stayed in the expected
approximately 155–159 range apart from one adjacent 160 observation.

## Activation re-confirmation

The unresolved-paint-barrier 101-switch measurement:

- median synchronous switch: `0.004417 ms`
- p95 synchronous switch: `0.020584 ms`
- maximum synchronous switch: `0.143084 ms`

The driven workspace-tabs fixture exited 0 and reported:

- tiny tree: `2` ignore-query subprocesses, `5` retained watches
- wide 500-directory tree: `2` ignore-query subprocesses, `522` retained
  watches

The width-independent subprocess count remains `2 / 2`, and the switched frame
still precedes repository work.

## Exact exit codes

| Command | Exit |
| --- | ---: |
| `bash scripts/behavioral-contracts.sh` | 0 |
| `bun scripts/harness/smoke-scrollbars-harness.ts` run 1 | 0 |
| `bun scripts/harness/smoke-scrollbars-harness.ts` run 2 | 0 |
| `bun scripts/harness/smoke-scrollbars-harness.ts` run 3 | 0 |
| `bun scripts/harness/smoke-workspace-tabs-harness.ts` | 0 |
| `bunx tsc --noEmit` | 0 |
| `bun test` — 1,377 pass, 0 fail, 16,076 expectations, 219 files | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` | 0 |
| `bash scripts/conventions-gate.sh` | 0 |
| `bun scripts/check-coverage-ratchet.ts` — 260 files, no undeclared decrease | 0 |
| `bash -n scripts/behavioral-contracts.sh` | 0 |
| `git diff --check` | 0 |

The required checks were re-run on committed tip `29b9e9c`. No merge gate was
run; nothing was pushed, merged, tagged, or deleted.
