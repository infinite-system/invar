# #192 residual generic waits — BLOCKED by unrelated gate bycatch

The five-site audit is complete and committed. Three waits were repaired;
the two panel waits already observed their exact semantic result and were
left unchanged. The task diff is clean at commit `0f23458`
(`fix(harness): await five named wait results`).

The required full gate did not reach ALL-PASS: every #192 site and the
#194 reserved-chord step were green, but the unrelated editor harness
timed out on both attempts after the reverse Option-wheel burst. Logs:
`/tmp/merge-gate-failures.400064`.

## Enumeration

| Site | Named result | Disposition |
| --- | --- | --- |
| `smoke-shortcut-help-harness.ts` PageDown wait | The requested shortcut row becomes visible, with each PageDown reflected by a newer published visible range. | **Repaired.** The wait now observes the `N-M of total` range, refuses inert PageDown at the final range, and reacquires the top grid after `shortcutHelpScrollTop === 0` before carrying a visible-range coordinate forward. |
| `smoke-scrollbars-harness.ts` initial diff horizontal thumb | The diff horizontal thumb is painted before frame collection. | **Repaired.** `awaitGridCondition` now waits on `diffHorizontalScrollbarFrame(candidate) !== null`; the vertical thumb is no longer used as its proxy. |
| `smoke-scrollbars-harness.ts` wrap-off overview geometry | A real first-line edit completes, its overview mark is painted in the scrollbar, and track/thumb geometry remains byte-stable. | **Repaired.** The drive now publishes editor focus, awaits the line-end caret and completed edit, then waits on mark paint plus exact track/thumb geometry. The former “any dot anywhere” predicate was satisfied by file-tree/document dots before an edit; focus was still `files`, so `End` and `X` did not edit at all. |
| `smoke-panel-chrome-harness.ts` Agent 2 close | Agent 2 disappears while Agent 1 and Terminal remain in both content labels and live cell IDs. | **Unchanged — already claim-specific, not generic.** The predicate requires `Agent,Terminal` and `agent,terminal`. |
| `smoke-panel-split-harness.ts` drag reorder | Persisted content order and rendered cell order both become `agent,terminal`. | **Unchanged — already claim-specific, not generic.** The combined published-state predicate is the asserted result. |

No site was retained as justified-generic; the two unchanged sites were
already narrower than “something repainted.”

## Reproduction and ordered sequences

Pre-repair quiet runs:

| Site | Ordered result |
| --- | --- |
| Shortcut help | Provided hard-red log reproduced the inert final range at `103-136 of 136`; a direct local run and one main-checkout run passed. `bun run drive` showed ranges `1-34 → 35-68 → 69-102 → 103-136`, with `Ctrl+Shift+H` visible only in `35-68`; a proxy repaint could advance the loop past it. |
| Diff horizontal thumb | `FAIL, PASS, PASS, PASS, PASS, PASS, PASS, PASS, PASS, PASS`; the main checkout also failed at the same assertion. This supports “intermittent, not fixed.” |
| Wrap-off overview geometry | Ten completed runs: `PASS, PASS, PASS, PASS, PASS, PASS, PASS, PASS, PASS, PASS` (the first scrollbar run stopped earlier at the horizontal-thumb site, so an extra completed run supplied N=10). It did not reproduce in this quiet N=10, but the recorded `52dcde4` sequence contains the exact RED. The structural audit proved the predicate pre-satisfied on unrelated dots and the edit never occurred while focus remained in Files. |
| Agent 2 close | `PASS, PASS, PASS, PASS, PASS, PASS, PASS, PASS, PASS, PASS`; main-checkout comparison PASS. The historical merge-base timeout did not reproduce. |
| Panel drag reorder | `PASS, PASS, PASS, PASS, PASS, PASS, PASS, PASS, PASS, PASS`; main-checkout comparison PASS. This supports the brief’s “weakest member; leave it” reading. |

Post-repair ordered runs:

- Shortcut help: `PASS × 10`.
- Scrollbar breathing probe containing both repaired scrollbar sites:
  `PASS × 10`.

The one-run comparison under `/home/parallels/dev/tui-editor` was:
shortcut PASS, scrollbars FAIL at the same initial horizontal-thumb sample,
panel-chrome PASS, panel-split PASS. None of the five predicates assert
width-dependent worktree text; the long worktree path was not the cause.

## Positive controls

Each repaired result was made RED, then restored GREEN:

- Shortcut target changed to a missing marker: exit 1,
  `FAIL shortcut sheet reached its final row without showing Ctrl+Shift+H CONTROL-MISSING`.
  Restored target: exit 0, `smoke-shortcut-help-harness: ALL-PASS`.
- Initial diff horizontal thumb required the impossible one-cell extent:
  exit 1,
  `Timed out waiting for grid condition: the diff pane horizontal thumb is painted before frame collection begins`.
  Restored real predicate: exit 0,
  `PASS the diff pane horizontal thumb is painted before frame collection begins`.
- Overview result additionally required a negative thumb length: exit 1,
  `Timed out waiting for grid condition: the wrap-off editor paints an overview mark without changing track or thumb geometry`.
  Restored real predicate: exit 0,
  `PASS wrap-off overview marks leave track and thumb geometry unchanged`
  and the wrap-on counterpart also passed.

## Invariant review

Scope derives from the two changed files under `scripts/harness/`, implicating
[scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md).

- **Strengthened:** `Harness waits observe conditions not frame ordinals`.
  The three repaired waits now observe the exact visible result.
- **Strengthened:** `Async-published state is always awaited`. Shortcut top,
  editor focus, caret, and completed edit are awaited before visual
  coordinates are reacquired.
- **Upheld:** `Every wait names itself`, `Harness input and output use the
  real PTY`, and `The terminal emulator is the harness screen oracle`.

No contract wording needed refinement. Two root-relative annotations were
added at the repaired enforcement files.

## Verification

| Check | Exit/result |
| --- | --- |
| `bunx tsc --noEmit` | exit 0 |
| `bun test` | exit 0; 1,696 pass, 0 fail |
| `bash scripts/conventions-gate.sh` | exit 0 |
| invariant checker `--all --refs` | exit 0; 926 annotations, 67 lattice links, 0 problems |
| `bun scripts/check-coverage-ratchet.ts` | exit 0; 319 files, no undeclared decrease |
| `bash scripts/behavioral-contracts.sh` | exit 0; ALL-PASS, including 2k/100k scale contracts |
| `awaitNextCompletedFrame` AST census under `scripts/harness` | 0 identifiers |
| `awaitQuiescence` AST census under `scripts/harness` | 0 identifiers |
| Full `bash scripts/merge-gate.sh` | exit 1; blocked only by editor-harness bycatch |
| Commit | exit 0; `0f23458` |

All #192 quiet-lock holders recorded `waiting → acquired → released`.
`/tmp/invar-quiet-lock.journal` contains zero `degraded` entries for a
`192-*` holder.

Full-gate task ownership:

- `smoke: shortcut-help harness` — OK
- `smoke: scrollbars harness` — OK
- `smoke: panel-chrome harness` — OK
- `smoke: panel-split harness` — OK
- `smoke: reserved chord harness` — OK; no #194 failure to hand off from this run
- `behavioral-contracts (felt invariants)` — OK

## Bycatch

- **Editor Option-wheel reverse generic wait — not fixed.** Exact reproduction:
  after six rightward Option-wheel SGR events publish a greater
  `editorScrollLeft`, the harness sends eight leftward Option-wheel events and
  waits only for generic screen/caret change. Both full-gate attempts timed
  out at that wait; final grids showed the README editor at the line head.
  Reproduced a second time: **YES** (attempt 1 and retry).
  Verified at merge base: **YES** — gate HEAD and merge base were both
  `f3f313e45b0cf55a3aedcfa3c0a204fac8c360f6`, and
  `src/`, `PtyTestDriver.ts`, and `smoke-editor-harness.ts` had no diff from
  that base. Logs are
  `/tmp/merge-gate-failures.400064/smoke-editor-harness-.attempt1.log`
  and `/tmp/merge-gate-failures.400064/smoke-editor-harness-.log`.
