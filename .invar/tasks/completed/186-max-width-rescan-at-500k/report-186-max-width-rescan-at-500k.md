# READY — #186 (maximum-width champion rescan)

## Result

READY on branch `fleet/186-max-width-rescan`.

Commit: `caa0a73` — `fix(editor): avoid rescanning a growing width champion`

`TextDocument.replaceLineRange` now measures replacement lines before
discarding the current maximum-width champion:

- An equal-or-wider replacement becomes the new exact champion in
  O(replacement-line-count) work.
- A replacement narrower than the sole outgoing champion still triggers the
  exact full-document rescan.
- A multi-line paste examines its replacement lines only when one can inherit
  the championship. If the paste removes the champion and every replacement
  line is narrower, the full rescan is the legitimate bounded fallback.
- No consumer knows or can observe whether a rescan occurred.

The `Geometry aggregates match their consumers` mechanism in
[src/modules/editor/editor.invariants.md](../../../../src/modules/editor/editor.invariants.md) became shorter (five lines replaced
by four) while stating the sharper equal-or-wider handoff rule.

## Maximum-width consumers

AST census:

`bun scripts/ast-query.ts identifiers maximumLineWidth --tests`

The four production consumers all require the exact maximum; a monotonic
upper bound is not sufficient:

1. `Workspace.tickScrollAnimations` passes the value to
   `Viewport.scrollByColumns` as the no-wrap horizontal momentum clamp.
2. `EditorPane.scrollColumns` passes it to the same clamp for pointer-driven
   horizontal auto-scroll.
3. `ScrollbarSync` uses it as the editor horizontal bar's `scrollSize`, which
   determines the exact thumb proportion and right extent.
4. `DiffView` takes the maximum of the previous/current read-only documents as
   its exact pane content width.

If the sole widest line is shortened or deleted, a stale upper bound would
leave scrollable blank columns and a lying horizontal thumb. The exact
aggregate therefore remains; only the unnecessary growing-champion rescan was
removed.

## Ordered measurements

Command: `bun scripts/harness/measure-editor-edit-path.ts`

Each row contains five ordered samples. Times are milliseconds. Load is the
unique 1/5/15-minute load-average tuple observed for that row.

### Before

Quiet-lock journal:

- `3943061-1785223088322579248-15450`
- `waiting` → `acquired` in 5 ms → `released`
- no `degraded` entry
- command exit 0

| Lines | Wrap | Mutation samples | Sync samples | Load 1/5/15 |
|---:|:---:|---|---|---|
| 2,000 | off | 0.743, 0.697, 0.832, 0.558, 0.613 | 0.150, 0.093, 0.083, 0.076, 0.068 | 2.88/1.20/0.84 |
| 2,000 | on | 3.863, 0.519, 0.531, 0.562, 0.342 | 0.505, 0.081, 0.070, 0.060, 0.076 | 2.88/1.20/0.84 |
| 20,000 | off | 7.131, 5.293, 6.856, 3.442, 6.268 | 0.667, 0.628, 0.562, 0.522, 0.548 | 2.88/1.20/0.84 |
| 20,000 | on | 2.919, 5.263, 2.961, 4.207, 4.550 | 0.306, 0.343, 0.358, 0.307, 0.328 | 2.88/1.20/0.84 |
| 100,000 | off | 20.112, 17.007, 18.004, 17.935, 16.302 | 4.193, 2.266, 1.476, 1.490, 1.467 | 2.88/1.20/0.84 |
| 100,000 | on | 16.256, 18.131, 17.332, 16.221, 18.710 | 1.405, 1.418, 1.489, 1.405, 1.374 | 2.88/1.20/0.84 |
| 500,000 | off | 72.666, 73.024, 78.485, 71.209, 73.919 | 6.845, 8.557, 8.164, 6.765, 7.959 | 2.88/1.20/0.84 |
| 500,000 | on | 68.059, 83.879, 71.617, 71.929, 74.252 | 8.628, 7.484, 8.928, 7.533, 8.012 | 2.73/1.20/0.84 |

The split reproduces the defect: the 500k mutation is 68.059–83.879 ms while
sync remains 6.765–8.928 ms.

### After

Quiet-lock journal:

- `3948511-1785223272973939586-750`
- `waiting` → `acquired` in 5 ms → `released`
- no `degraded` entry
- command exit 0

| Lines | Wrap | Mutation samples | Sync samples | Load 1/5/15 |
|---:|:---:|---|---|---|
| 2,000 | off | 0.004, 0.003, 0.002, 0.002, 0.002 | 0.116, 0.104, 0.117, 0.113, 0.107 | 0.30/0.75/0.72 |
| 2,000 | on | 0.003, 0.002, 0.003, 0.003, 0.002 | 0.124, 0.106, 0.125, 0.109, 0.121 | 0.30/0.75/0.72 |
| 20,000 | off | 0.004, 0.003, 0.006, 0.003, 0.003 | 0.600, 0.630, 0.613, 0.572, 0.621 | 0.30/0.75/0.72 |
| 20,000 | on | 0.003, 0.002, 0.016, 0.008, 0.014 | 0.455, 0.443, 0.454, 0.471, 0.477 | 0.30/0.75/0.72 |
| 100,000 | off | 0.006, 0.005, 0.003, 0.015, 0.023 | 1.295, 1.366, 1.391, 3.169, 1.391 | 0.30/0.75/0.72 |
| 100,000 | on | 0.007, 0.003, 0.003, 0.005, 0.011 | 2.090, 2.180, 2.219, 2.385, 2.702 | 0.30/0.75/0.72 |
| 500,000 | off | 0.009, 0.045, 0.026, 0.012, 0.007 | 7.015, 7.214, 7.021, 7.261, 11.488 | 0.30/0.75/0.72 |
| 500,000 | on | 0.017, 0.015, 0.017, 0.010, 0.013 | 7.353, 7.435, 7.067, 7.193, 10.440 | 0.30/0.75/0.72 |

The 500k mutation is now 0.007–0.045 ms, far below the 16 ms target and flat
with document length. The maximum 500k combined edit-to-synced sample is
11.533 ms.

## Positive controls

### Measurement controls

The existing instrument now carries a mutation-side control in addition to
its wrap-sync control:

- Growing-champion 20k mutation maximum: 0.015917 ms.
- Forced sole-champion shrink/rescan mutations: 4.496, 4.272, 4.344 ms.
- Forced-rescan minimum: 4.271709 ms; requirement satisfied.
- Incremental wrap-sync controls: 0.215, 0.222, 0.208 ms.
- Forced full wrap rebuilds: 43.425, 49.515, 50.194 ms; requirement satisfied.

### Regression-test control

`TextDocument.test.ts` counts the cheap upper-bound evaluations:

- Growing the champion: exactly 1 replacement evaluation.
- Shrinking the sole champion: exactly 500 evaluations, proving the exact
  fallback still runs.
- Multi-line replacement with a wider replacement: exactly 2 evaluations.

I planted the old defect by temporarily disabling champion inheritance. The
focused test failed with exit 1:

```text
Expected: 1
Received: 499
at TextDocument.test.ts:138
```

The plant was removed. The committed tree's full suite is green.

## Driven evidence

All drives used the real PTY harness at defaults with word wrap off.

- Small edit drive (`--size 10`): click line 1, End, `x`, `x`; revision
  1 → 3, cursor column 37 → 39, visible suffix `10xx`.
- Large edit drive (`--size 100000`): the same gesture; revision 1 → 3,
  cursor column 41 → 43, visible suffix `100000xx`.
- Small exact-extent drive:
  `bun scripts/harness/smoke-horizontal-extent-harness.ts` exited 0.
  Alt-wheel reached `scrollLeft 30`; vertical scrolling preserved that
  clamp; the deep widest-line tail
  `length width*height*4', () => {` was visible.
- Large exact-extent drive (`--size 100000`): lengthened the current widest
  line from column 41 to column 141 using 100 real key inputs. The editor
  auto-revealed it at `scrollLeft 71`; one right-wheel settled at the exact
  no-wrap clamp `scrollLeft 70` with the line tail visible. Exit 0.

## Final verification on committed source

The commit hook formatted three staged files, so the required verification
was rerun against exact commit `caa0a73`.

| Check | Result |
|---|---:|
| `bunx tsc --noEmit` | exit 0 |
| `bun test` | exit 0 — 1,695 pass, 0 fail, 67,597 expectations |
| `bash scripts/conventions-gate.sh` | exit 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | exit 0 — 918 annotations, 67 lattice links, 0 problems |
| `bun scripts/check-coverage-ratchet.ts` | exit 0 — 319 files, no undeclared decrease |
| `bun scripts/harness/smoke-horizontal-extent-harness.ts` | exit 0 — ALL-PASS |

Per [TASK.md](../../../../TASK.md), `scripts/merge-gate.sh` was not run; main's unrelated
#168 (deterministic frame-ordinal wait) red was not investigated.

## Bycatch

- NOT FIXED — `bun run drive` assumes every wheel action emits a completed
  frame. On the 100,000-line horizontal drive, after 100 `x` inputs brought
  the viewport to its right clamp, the first `--wheel right` painted the
  clamped state and the next clamped wheel painted nothing; Drive timed out
  with `completed frames observed: 109`. Observed once; a bounded rerun with
  exactly one right-wheel event exited 0. This does not affect Invar's editor
  behavior, only repeated exploratory Drive actions at an already-settled
  clamp.

