# READY — #211 (horizontal-extent grid wait timeout)

## Result

READY. The unreachable grid condition in
`scripts/harness/smoke-horizontal-extent-harness.ts` is fixed and committed.

Commit: `4d7346f15919049f33ba4bc924e5409bc983b6ef`
(`fix(harness): restore reachable horizontal extent wait`)

The worktree is clean.

## Reproduction and diagnosis

Plain-tree reproduction:

`bun scripts/harness/smoke-horizontal-extent-harness.ts`

Exit: `1`

The timed-out predicate was:

`candidate.findText('[]): Uint8Array {') !== null`

The timeout named:

`the opening viewport reveals the end of the visible encodeBandsJpeg declaration`

The app was live and painting. Its final frame showed the editor at the positive
horizontal clamp, including the clipped `bands` parameter tail (`r][],`), but
not `[]): Uint8Array {`.

Reachability answer: the condition was unreachable. Commit `faeaa99`
(`format: enforce declaration spacing and reformat repository`) changed
`encodeBandsJpeg` from one source line into separate parameter and return-type
rows. No rendered row can contain the old contiguous string, and the short
return-type row is entirely left of the viewport at the positive horizontal
clamp. More time or retries cannot make that predicate true.

## Fix

The smoke now waits for the long opening comment's ASCII tail:

`jpeg-js's own encoder (deterministic,`

The smoke first asserts that this tail is hidden before horizontal input, then
waits for the Alt-wheel action to reveal it. This keeps the transition
specific: the predicate cannot pass from pre-action state. The existing
assertions still prove:

- horizontal input moves to positive `scrollLeft` (`31` in the final drive);
- the Files heading remains byte-identical;
- vertical scrolling preserves the horizontal clamp;
- the deep widest-line marker and tail become visible without more horizontal
  input.

The enforcement point now references the applicable contract, `Harness waits
observe conditions not frame ordinals`.

## Positive control

I temporarily restored the old unreachable string as the new predicate's
value and reran the smoke.

Exit: `1`

Observed failure:

`Timed out waiting for grid condition: the opening viewport reveals its comment tail "[]): Uint8Array {"`

The final frame was still live and horizontally shifted. The temporary change
was then removed.

## Verification

- `bun scripts/harness/smoke-horizontal-extent-harness.ts` — exit `0`,
  `ALL-PASS`
- `bunx tsc --noEmit` — exit `0`
- `bun test` — exit `0`; 1,733 passed, 0 failed
- `bash scripts/conventions-gate.sh` — exit `0`
- `bunx prettier --check .` — exit `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0`; 937 annotations and 67 lattice links resolved, 0 problems
- `git diff --check` — exit `0`

## Bycatch

None observed.
