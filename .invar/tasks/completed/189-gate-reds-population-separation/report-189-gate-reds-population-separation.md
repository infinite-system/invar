# #189 gate-red separation — BLOCKED

The assigned scrollbar red is repaired and the reserved-chord red did not
reproduce, but the task's required full-gate ALL-PASS terminal condition was
not reached. The final gate was blocked by unrelated terminal-stage and
Markdown harness failures. Full evidence is at
`/tmp/merge-gate-failures.165490`.

## Commit

`ae2fa98 fix(harness): await the shorter diff scrollbar thumb`

The worktree is clean. Nothing was pushed, merged, tagged, or deleted.

## Separation 1 — scrollbar harness

One detached scratch worktree was installed once and checked out between the
three requested commits. Ordered full-smoke results:

| Commit | Ordered results |
| --- | --- |
| `1abe1d0` before #186 | PASS, PASS, PASS, PASS, PASS |
| `4e7abd0` #186 merge | PASS, PASS, PASS, PASS, PASS |
| `52dcde4` current-main checkpoint | PASS, FAIL, FAIL, FAIL, PASS |

The three `52dcde4` failures were, in order:

1. `the diff pane horizontal thumb is painted before frame collection begins`
2. `wrap-off overview marks leave track and thumb geometry unchanged`
3. `lengthening the widest line refreshes the diff horizontal bar (28 to 44)`

This falsifies the suspected #186 production regression: #186 itself is
PASS×5, and the current checkpoint fails at three different sampling points.
The regression was introduced by #168's harness-wait conversion after #186.
The assigned check waited only for any byte change in the scrollbar row, so
an intermediate `44`-cell thumb was reachable before the exact horizontal
extent result.

Repair: the wait now observes the claimed result itself:
`frame.thumbLength < stableHorizontalFrame.thumbLength`. It does not restore
a rescan and does not touch `TextDocument` or the O(1) widest-line handoff.

Post-repair targeted ordered results:

`PASS, PASS, PASS, PASS, PASS`, each reporting
`lengthening the widest line refreshes the diff horizontal bar (28 to 16)`.

Positive control:

- Planted a one-character edit that cannot lengthen the champion.
- RED, exit 1:
  `Timed out waiting for grid condition: the refreshed diff paints a shorter horizontal thumb`
- Restored the 180-character edit.
- GREEN, exit 0:
  `PASS lengthening the widest line refreshes the diff horizontal bar (28 to 16)`

## Separation 2 — reserved chord harness

| Context | Ordered results |
| --- | --- |
| Standalone | PASS, PASS, PASS, PASS, PASS |
| Actual six-worker merge-gate pool | PASS, PASS, PASS |

All three pool gates were run from the exact merge base `e407bfd`; each gate
was red for unrelated smokes, but `smoke: reserved chord harness` was `OK`.
Failure-log roots were:

- `/tmp/merge-gate-failures.80761`
- `/tmp/merge-gate-failures.105047`
- `/tmp/merge-gate-failures.128199`

No repair or serial reclassification was made. The requested pool failure did
not reproduce, so there was no red against which to prove a repair. The
reachability hypothesis is also false in the current fixture:
`await Bun.write(join(workspaceRoot, 'small.txt'), 'small\n')` completes
before `PtyTestDriver` is constructed and before the Quick Open query is sent.
No timeout was widened.

## Invariant review

Scope was derived from
`scripts/harness/smoke-scrollbars-harness.ts`, implicating
[scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md).

The change strengthens `Harness waits observe conditions not frame ordinals`:
the named wait now observes the exact shorter-thumb result before the visual
assertion samples it. `Every wait names itself`, `The terminal emulator is
the harness screen oracle`, and `Harness input and output use the real PTY`
remain upheld. No contract wording needed refinement.

## Verification

| Check | Result |
| --- | --- |
| `bunx tsc --noEmit` | exit 0 |
| `bun test` | exit 0; 1696 pass, 0 fail |
| `bash scripts/conventions-gate.sh` | exit 0 |
| invariant checker `--all --refs` | exit 0; 924 annotations, 67 links, 0 problems |
| `bun scripts/check-coverage-ratchet.ts` | exit 0; 319 files, no undeclared decrease |
| `bash scripts/behavioral-contracts.sh` | exit 0; ALL-PASS |
| AST `awaitNextCompletedFrame` census under `scripts/harness` | 0 identifiers |
| AST `awaitQuiescence` census under `scripts/harness` | 0 identifiers |
| repaired scrollbar targeted N=5 | PASS×5 |
| `bash scripts/merge-gate.sh` | exit 1; BLOCKED |

Every #189 quiet-lock holder recorded `waiting → acquired → released`; none
recorded `degraded`.

The final gate's assigned steps were both green:

- `smoke: scrollbars harness` — OK
- `smoke: reserved chord harness` — OK
- `behavioral-contracts (felt invariants)` — OK

The final gate was blocked by:

- `smoke: terminal stage harness` — the prompt/color grid condition timed out
  on both attempts.
- `smoke: markdown harness` — `FAIL preview row missing: | Ragged`.

## Bycatch

- Terminal-stage prompt/color wait: in the six-worker pool, the final grid
  visibly contained the shell prompt, but the combined prompt/color predicate
  timed out. Reproduced on both attempts in each of all three pre-change
  baseline gates, then both attempts in the final gate. Verified at merge base
  `e407bfd`: YES. Not fixed.
- Shortcut-help PageDown wait: timed out twice in baseline pool run 1 and once
  before passing on retry in baseline pool run 3:
  `PageDown changes the shortcut sheet while seeking Ctrl+Shift+H`.
  Reproduced a second time: YES. Verified at merge base `e407bfd`: YES. Not
  fixed.
- Panel-chrome Agent 2 close wait: timed out once in baseline pool run 2, then
  passed on retry:
  `the Agent 2 list close removes only that instance`.
  Reproduced a second time: NO. Verified at merge base `e407bfd`: YES. Not
  fixed.
- Markdown ragged-table preview row: final full gate displayed the source
  `| Ragged | header |` while the preview row was absent, then failed
  `preview row missing: | Ragged`. Reproduced a second time: NO. Verified at
  merge base: NO; the three pre-change merge-base gates passed this smoke. Not
  fixed.
- Scrollbar harness sampling races before the assigned assertion:
  `diff pane horizontal thumb ... before frame collection` occurred once in
  the `52dcde4` N=5 sequence and once during the positive-control drive;
  `wrap-off overview marks leave track and thumb geometry unchanged` occurred
  once in the `52dcde4` N=5 sequence. The first reproduced a second time; the
  second did not. Verified at the exact merge base: NO (three merge-base gate
  runs passed the smoke); verified at ancestor `52dcde4`: YES. Not fixed.
