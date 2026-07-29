# READY — #188 (repair the frame-wait harness regressions)

Commit: `3ad574c` (`fix(harness): await file-open result conditions`)

Worktree: clean after commit.

## Outcome

Two different wait mistakes produced the two reproducible failures:

1. `smoke-settings-applied-harness.ts` returned an unawaited
   `awaitGridCondition` promise from inside `try`, so `finally` disposed the PTY
   while the file-body render condition was still pending. Its filename predicate
   could also match the file tree or tab before the editor body painted. The smoke
   now awaits inside the `try` and waits for a marker read from the file body.
2. #168 (replace frame-ordinal waits with observable conditions) converted the
   editor smoke's repeated `Down+Enter` quiescence wait to a generic
   `awaitScreenChange`. The loop sought two new tabs although the fixture had only
   one unopened file left; after that file opened, the next gesture was inert at
   the last tree row, so no screen change could exist. The smoke now selects a
   known unopened fixture from published `openBuffers`, clicks its visible row,
   and waits for the asserted result: `bufferTabCount` increases.

No deleted broad wait was restored, no timeout or frame budget changed, and the
deleted primitive identifier census remains zero.

## Population separation

### Settings-applied (population already established by the task)

| commit | ordered result | `not a child of __root__` messages |
|---|---|---:|
| `4e7abd0` — before #168/#170 | PASS | 0 |
| `d9e66e5` — #168 only | FAIL | 10 |

This is caused by #168's changed wait boundary, not pre-existing behavior.

### Editor harness

One run at each required commit, in order, reusing one installed scratch
worktree:

| commit | ordered result |
|---|---|
| `4e7abd0` — before #168/#170 | PASS |
| `d9e66e5` — #168 only | PASS |
| `715c980` — #168 + #170 | FAIL |

The failure at `715c980` was
`Timed out waiting for grid condition: the driven input produces an observed
screen or native caret change` after all three fixture tabs were already open.
The ordered fingerprint is `PASS, PASS, FAIL`: this editor case requires the
#168 conversion plus the #170 state/timing population.

### Reserved-chord harness

The smoke does not exist at `4e7abd0` or `d9e66e5`. Its required comparison was:

| commit | ordered result |
|---|---|
| `e239880` / `finished/170-ctrl-comma-swallowed` — #170 branch tip | PASS |
| `715c980` — #168 + #170 | PASS |

The prior gate timeout did not reproduce in the quiet required comparison.
The ordered fingerprint is `PASS, PASS`; no reserved-chord change was made.

## Renderable-tree message classification

The ten `Renderable with id ... is not a child of __root__, skipping remove`
messages are a symptom of teardown, not the cause of the missing render.
Removing the load-bearing `await` as a positive control made `finally` dispose
the driver immediately and reproduced the exact ten-message final grid. Restoring
the `await` kept the PTY alive until the editor-body condition and removed the
messages.

## Positive controls

### Settings PTY lifetime and body-render condition

- GREEN before planting: exit 0, `smoke-settings-applied-harness: ALL-PASS`.
- Plant: remove `await` while retaining the stricter file-body predicate.
- RED: exit 1, `Timed out waiting for grid condition: w.txt body is rendered
  before its setting snapshot`, followed by the ten renderable teardown messages.
- Restore: exit 0, `smoke-settings-applied-harness: ALL-PASS`.

### Editor new-tab result condition

- GREEN before planting: exit 0, `smoke-editor-harness: ALL-PASS` with tabs
  `2 to 3`.
- Plant: deliberately choose an already-open basename instead of an unopened
  fixture.
- RED: exit 1, `Timed out waiting for the increased tab count and live document
  count are published`.
- Restore: exit 0, `smoke-editor-harness: ALL-PASS` with tabs `2 to 3`.

## Drive and scale parity

- `bun run drive`: exit 0 at defaults.
- `bun run drive --size 100000`: exit 0 with the shared large fixture.

## Verification

- Structural AST census under `scripts/harness`:
  - `awaitNextCompletedFrame`: 0 matches, exit 0.
  - `awaitQuiescence`: 0 matches, exit 0.
- `git diff --check`: exit 0.
- `bunx tsc --noEmit`: exit 0.
- `bun test`: exit 0; 1,696 pass, 0 fail, 67,607 expectations across
  258 files.
- `bash scripts/conventions-gate.sh`: exit 0; PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  exit 0; 923 annotations, 67 lattice links, 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: exit 0; 319 files inspected, no
  undeclared decrease.
- `bash scripts/behavioral-contracts.sh`: exit 0; `behavioral-contracts:
  ALL-PASS` on the single final run.
- Final named harness sequence on the committed code:
  `editor PASS, reserved-chord PASS, settings-applied PASS`; all exit 0.

The existing `Harness waits observe conditions not frame ordinals` contract
directly governed the repair: each replacement condition now names the result
the smoke asserts, and neither relies on repaint arrival as a proxy.

## Bycatch

None observed outside #188's two reproduced harness failures. The separate
shortcut-help retry hypothesis was not exercised or changed.
