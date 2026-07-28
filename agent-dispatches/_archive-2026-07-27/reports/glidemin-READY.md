# READY — #146 glide minimum dead zone

## Result

Implemented and committed as `8a98e7d362bbc8caff1ef5a0e925643ba07e1167`
(`Fix the glide minimum dead zone`).

`Momentum.addImpulse` now derives the from-rest velocity floor from both
possible stopping boundaries: natural decay to `stopVelocity` and the
configured maximum glide duration. The larger floor wins, so the selectable
100 ms cap still integrates one visible row. Input continues through
`queueImpulse` and `stepMomentum`; there is no minimum-value branch and no
direct row commit outside the shared generator.

The 900 ms default is unchanged. The pre/post real-PTY one-notch fingerprint
is one visible row at both 2,000 and 100,000 lines. The existing deterministic
saturated-default contract remains exactly 197 rows over 27 frames.

## Driven evidence

- Before the fix, the 100 ms real-PTY preflight timed out with
  `editorScrollTop=0` and `workspaceScrollMomentumAtRest=true`.
- After the fix, 100, 1,050, and 2,000 ms each reported exactly one applied
  impulse and one visible row at both 2,000 and 100,000 lines.
- The settings-applied drive now loads the schema minimum, sends one real PTY
  wheel notch, and reports `1 impulse, 1 rows`.
- The range unit contract covers every selectable value from 100 through
  2,000 ms in 50 ms steps. It also locks the 900 ms one-notch result to one
  row.
- The existing 150-event contract still requires exactly 150 applied
  impulses, preserving the #138 event-to-impulse invariant.

## Positive control

Temporarily restored the old decay-only velocity floor and ran the new
real-PTY count predicate:

```text
positive-control counts=[(2000, 1, 0), (100000, 1, 0)]
RED (expected): one applied impulse travelled zero rows
drive_exit=0 predicate_exit=1
```

The unit contract independently reddened:

```text
Expected: >= 1
Received: 0
(fail) scroll-momentum > one queued notch crosses a row across every selectable glide cap
unit_exit=1
```

The production fix was then restored before final verification and commit.

## Invariant record

Updated `The glide tail is bounded and effective` in
`scroll.invariants.md`: removed the closed open question, recorded the
cap-aware one-row mechanism and PTY evidence, added its enforcement
annotation, and promoted the record from provisional to established.

Scope review:

- `The glide tail is bounded and effective`: strengthened.
- `Every wheel event becomes one impulse`: upheld by the shared queue path and
  exact count contracts.
- `Same-direction impulses accumulate to the ceiling`: upheld; no overflow or
  ceiling-sustaining path changed.
- `Scroll frame cost is document-length independent`: upheld by 2k/100k
  drives.
- Settings and PTY harness invariants: upheld; the real setting and PTY
  projection paths are used.

## Verification

Exact committed-byte exit codes:

```text
bunx tsc --noEmit: 0
bun test: 0
bash scripts/conventions-gate.sh: 0
node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs: 0
bun scripts/check-coverage-ratchet.ts: 0
bash scripts/behavioral-contracts.sh run 1: 0
bash scripts/behavioral-contracts.sh run 2: 0
bash scripts/behavioral-contracts.sh run 3: 1
bash scripts/behavioral-contracts.sh bycatch reproduction run: 0
bun scripts/harness/smoke-settings-applied-harness.ts run 1: 0
bun scripts/harness/smoke-settings-applied-harness.ts run 2: 0
bun scripts/harness/smoke-settings-applied-harness.ts run 3: 0
```

The three successful behavioral runs were runs 1, 2, and the immediate
bycatch reproduction. The single nonzero run is detailed below.

`bun test`: 1,657 pass, 0 fail, 67,487 expectations across 249 files.

The working tree is clean and the branch is one commit ahead of
`origin/main`. Nothing was pushed, merged, tagged, or deleted.

## Bycatch

- The third consecutive committed-byte behavioral run intermittently failed
  the pre-existing `glide-input-coalescing` scale-travel canary: 2,000-line
  editor travel was 404 rows and 100,000-line travel was 413 rows, a 9-row
  difference against its 8-row one-frame budget. Both cases still applied
  exactly 150 of 150 impulses. The immediately repeated full drive exited 0,
  so the observation did not reproduce a second time. Not fixed or otherwise
  changed.
