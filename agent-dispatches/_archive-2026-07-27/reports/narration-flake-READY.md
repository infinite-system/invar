# READY — audio narration hard red

Commit: `7467afd` (`fix(narration): publish no-frame barge-in state`)

## Result

The narration harness is fixed without widening a timeout. The final harness
rate is 10/10 green, and the same drive is green with `espeak-ng` present or
absent.

The fix is in `NarrationProjection.bargeIn()`: after stopping the TTS backend
and incrementing `bargeInCount`, it updates and flushes that semantic probe at
the mutation boundary. Stopping audio changes no terminal cells, so it cannot
depend on a later settled render frame to publish.

## Baseline rate

The first requested ten untouched runs all exited `1`, but this worktree had
no `node_modules`; all ten stopped in the unit-test preflight with unresolved
`vue` and `ivue/extras`. After restoring the lockfile-defined dependencies
with `bun install --frozen-lockfile`, the meaningful untouched solo rate was:

`0, 1, 0, 1, 0, 1, 0, 1, 0, 1`

The exact alternation was wall-clock phase, not random load.

## Timeout evidence

Every meaningful red timed out on:

`Number(status.narrationBargeInCount) > bargeInCountBeforeTyping`

The captured final frame showed a healthy, idle app:

- the full echo reply was visible;
- the composer still showed `❯ x`;
- `agentBusy` was `false`;
- `narrationSpokenCount` was `1`;
- the last published `narrationBargeInCount` was still `0`.

After the timeout, one diagnostic `z` input produced a visual frame. That
frame showed `❯ xz` and published `narrationBargeInCount: 1`. This proved
Escape had been decoded and `bargeIn()` had run; only its semantic status was
stale.

## Mechanism

`StatusChannel` writes its normal snapshot when a render frame settles.
Escape barge-in stops audio and increments a probe, but deliberately changes
no cells. OpenTUI therefore may emit no completed frame. The probe stayed
in memory until an unrelated visual frame occurred.

The status-bar clock is the only periodic idle repaint, at the next minute
boundary. A 30-second waiter therefore passed when that boundary fell inside
its window and failed when it did not, producing the observed alternating
fingerprint and the earlier retry-tally trajectory.

Ranked candidates after measurement:

1. **Confirmed:** status publication depended on an unrelated frame after a
   no-frame semantic action.
2. **Eliminated:** the absent-engine path. The harness forces
   `INVAR_TTS_BACKEND=mock`, so it never selects or spawns a system TTS
   engine.
3. **Eliminated:** a two-owner stale-frame race. The fix adds no renderer
   request and no second frame owner; it publishes only the no-frame semantic
   probe.

## `espeak-ng` comparison

Contrary to the task's recorded machine state, this checkout currently sees
`/usr/bin/espeak-ng`.

I repeated the drive with a restricted PATH containing Bun, `setsid`, and
Git but no `espeak-ng`:

- absent check: `command -v espeak-ng` exit `1`;
- narration harness with engine present: exit `0`;
- narration harness with engine absent: exit `0`.

The smoke is hermetic at the existing mock TTS backend seam.

## Positive controls

I deliberately removed the `bargeInCount` increment and shortened only the
diagnostic control window. The smoke exited `1` with:

`Timed out waiting for status condition: Number(status.narrationBargeInCount) > bargeInCountBeforeTyping`

I also tested the discarded reactive-paint hypothesis with a focused unit
control: making `requestPaint()` a no-op failed with
`Expected: 2, Received: 1`. That hypothesis was then removed because a
byte-identical OpenTUI render still has no settled frame to flush.

All planted defects and diagnostic instrumentation were removed before the
final verification.

## Sibling-task reduction

- **#109 agent-permissions:** not the same generator.
  `AgentSession.resolvePermission()` changes a visible permission entry and
  bumps `renderRevision`; it is not a no-cell semantic publication.
- **#124 terminal-follow Escape cancellation:** not the same generator.
  cancellation appends visible `canceled` state, changes turn state, bumps
  `renderRevision`, and schedules a second post-teardown revision pulse. Its
  3/3 failure needs its own reduction.

This finding splits the three tasks rather than unifying them.

## Scale parity

The changed path performs two constant-time status operations only on an
explicit Escape barge-in. It is not per-row, per-item, or per-frame and has no
document-size axis; small and 100,000-line documents generate the same work.

## Verification

- `bunx tsc --noEmit` — exit `0`
- `bun test` — exit `0` (`1639 pass`, `0 fail`)
- `bash scripts/conventions-gate.sh` — exit `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0` (`0 problem(s)`)
- `bun scripts/check-coverage-ratchet.ts` — exit `0`
- final narration harness runs:
  `0, 0, 0, 0, 0, 0, 0, 0, 0, 0`

The pre-commit hook subsequently applied only Prettier's line wrapping to one
pre-existing loop in the same file before creating the commit.

## Bycatch

- The narration contract and comments still say “any keystroke” barges in,
  while the current product behavior and harness deliberately require
  explicit Escape and prove ordinary typing does not barge in. This is
  pre-existing contract drift from the Escape-only behavior change; not fixed
  here because the required invariant-name rename must land as its own atomic
  rename commit.

No other bycatch was observed.

## Worktree

The task change is committed. The only remaining status entry is the
conductor-supplied, pre-existing untracked `TASK.md`; it was preserved.
