# READY — #159 (panel-chrome retry mechanism)

## Outcome

READY at commit `dca84d28a0b233517e5ac473e215911923c2d124`
(`fix(ui): preserve panel close publication across frame coalescing`).
The branch `fix-panel-chrome-flake` is clean.

This is an **app-side fix**. Panel-list input now keeps its immediate render
request and also schedules a request after the current turn, so OpenTUI cannot
coalesce away the only frame capable of publishing a removed panel session.
The existing completion-dismissal workaround now uses the same tested
`RenderRequest` capability instead of owning a second timer.

## Reproduction sequence

Dependencies were installed first with Bun 1.3.14.

Post-#156 population: current main `82b746c` (the panel/render paths are
unchanged from `d5ba738`), 50 sequential runs:

```text
PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPFPPPPPP
```

The first 20 were:

```text
PPPPPPPPPPPPPPPPPPPP
```

Pre-#156 population: detached `186f2d8`, the same 50 sequential runs:

```text
PPPPPPPPPPPFPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
```

The reported Agent 2 condition timed out **0/50 after #156 and 0/50 before
#156** on the quiet machine. The one `F` in each sequence was a different
ASCII-tier grid condition, after the Agent 2 close had passed. Therefore
#156 (tasks capability) is exonerated: it does not separate the target
population, and the same unrelated failure also exists on both sides.

Absence did not count as a fix. I used the preserved target failure, the live
input-to-publication path, the existing completion coalescing precedent, and
a deterministic planted interleaving to identify and break the mechanism.

After the fix, 20 sequential runs:

```text
PPPPPPPPPPPPPPPPPPPP
```

## Mechanism

The close path synchronously removes `agent-2` from `PanelHost.contents`,
`order`, and `layout`, then `RootView` issues `renderer.requestRender()` in
the same input turn. If another frame is still queued/in flight, OpenTUI
coalesces that request. `PanelHost` holds the new semantic model, but
`StatusChannel` receives its projection during paint and writes it to
`status.json` only when a frame settles.
With the only request consumed by the older frame, no later settle carries
the new `Agent,Terminal` / `agent,terminal` state to disk. The waiter is then
waiting for a publication that cannot arrive until some unrelated input
causes another frame.

This is the **never-published** branch, not the overwritten branch.
`removeContent('agent-2')` deletes the instance, and no post-removal path
re-registers that identifier; later projections cannot restore Agent 2.
The deterministic scheduler control also shows the boundary directly:
a current-turn request is rejected by the planted coalescing renderer, while
the next-turn request is accepted.

Evidence caveat: the exact Agent 2 timeout did not recur naturally in 100
quiet baseline runs, and the original temporary status directory had already
been removed, so this investigation did not capture the failed process's
live model beside its stale file. The causal attribution is therefore based
on the preserved failure plus the reachable scheduling path and planted
interleaving, not on a second natural target red.

## Fix and contract

- Added `src/modules/ui/RenderRequest.ts`, a Static-wrapped capability that
  schedules a render after the current turn.
- Added `RenderRequest.test.ts`, which deterministically models an in-turn
  coalescing renderer.
- `RootView` uses the capability after panel-list pointer mutations.
- `Bootstrap` routes the pre-existing completion fallback through the same
  generator.
- Refined `Rendering is one coarse frame effect` and
  `The panel contents list mirrors open content` with the coalescing
  impossibility boundary and executable evidence.

Scoped invariant verdict: the app and UI records are strengthened; project
state/projection ownership remains upheld. Mechanical result: 907 annotations,
67 lattice links, 0 problems.

## Positive control

Plant: changed `RenderRequest.afterCurrentTurn` to call `requestRender`
immediately, recreating same-turn coalescing.

```text
Expected: 1
Received: 0
(fail) a next-turn request survives current-turn render coalescing
POSITIVE_CONTROL_EXIT=1
```

Restored next-turn scheduling:

```text
1 pass
0 fail
RESTORED_CONTROL_EXIT=0
```

## Verification

- `bunx tsc --noEmit` — exit `0`
- `bun test` — exit `0`; 1,692 pass, 0 fail, 67,577 expectations
- `bash scripts/conventions-gate.sh` — exit `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0`; 907 annotations / 67 lattice links / 0 problems
- `bun scripts/check-coverage-ratchet.ts` — exit `0`; 318 files, no
  undeclared decrease against `d5ba738`
- `bun scripts/harness/smoke-completion-harness.ts` — exit `0`, including
  real tsgo at 20 and 100,000 lines
- `bun scripts/harness/smoke-panel-split-harness.ts` — exit `0`
- fixed panel-chrome sequence — 20/20 pass, every run exit `0`

`scripts/merge-gate.sh` was not run.

## Class question

This has the same reachability shape as #158 (unreachable fourteenth-frame
glide probe), not a merely slow arrival: under one valid ordering there is no
future publisher for the condition. It also gives a concrete class hypothesis
for #109 (agent-permissions published-condition flake) and #124
(terminal-follow published-condition flake): before tuning any wait, trace
whether the semantic mutation has an unconditional publication carrier after
the ordering being tested. The three can be treated as one audit class
(`mutation -> reachable publisher -> observed condition`), but this result
does not prove that #109 and #124 share this exact OpenTUI coalescing cause.

## Bycatch

- `smoke-panel-chrome-harness` intermittently times out on
  `expand heading control highlights exactly its published span and names
  itself` in the ASCII-tier phase. It occurred at post-#156 run 44 and
  pre-#156 run 12, so it reproduced a second time and is pre-existing.
  Both final grids visibly contained `Restore panel`, and both failures
  occurred after `Agent instances select and close through the list` passed.
  Not fixed in this task.

COMPACTION: none

conventions @ `2e6c207555c2aeecd49d460e5d8ca3ed8ba030af`
