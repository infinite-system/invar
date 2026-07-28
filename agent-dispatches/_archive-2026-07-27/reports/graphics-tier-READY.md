# Graphics tier late capability answer — READY

Commit: `8c8c2c2` (`Fix late graphics capability upgrades`)

## Query and reply observed on the real PTY path

The unforced harness captures the app's raw output and discovers the query
identifier rather than hard-coding it. OpenTUI emitted:

```text
\x1b_Gi=31337,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\
```

The harness extracted `31337` and sent the matching terminal reply:

```text
\x1b_Gi=31337;OK\x1b\
```

The smoke sends no key, click, resize, or other user input after that reply.
It waits for the half-block cells to be replaced, then for a kitty
transmit-and-place sequence (`\x1b_Ga=T`) on the raw PTY stream. It also
asserts that a synchronized blanking frame ends before the placement bytes.

## Pre-fix and post-fix evidence

The requested fail-before result could not be reproduced honestly in this
checkout. With only the new smoke added and no production fix, the test
already passed:

```text
PASS  the unforced image paints at the half-block floor before the capability answer
PASS  no kitty placement is emitted before the terminal reports kitty graphics
PASS  the graphics capability query is discovered in the raw PTY output
graphics capability query "\u001b_Gi=31337,s=1,v=1,a=q,t=d,f=24;AAAA\u001b\\"
graphics capability reply "\u001b_Gi=31337;OK\u001b\\"
PASS  the late kitty capability answer schedules its own placement frame
smoke-pixel-preview-harness: ALL-PASS
PRE_FIX_SMOKE_EXIT=0
```

The stricter pre-fix ordering probe also passed:

```text
late placement offset 18870, last preceding synchronized-frame end 18852
PRE_FIX_ORDER_SMOKE_EXIT=0
```

Why: `Bootstrap.ts`'s single coarse `app.$watchEffect` calls `paint()`, which
calls `view.update()`. When an image is active, that synchronous call reads
`reportedGraphics.value`, so Vue already tracks the ref transitively. The
capability listener's assignment therefore scheduled the coarse effect even
without an explicit watcher. OpenTUI also accepted the reply and emitted the
`capabilities` event under harness conditions.

I did not manufacture a red by disabling that existing reactive edge. The
post-fix smoke passes and includes stronger stale-projection and ordering
assertions:

```text
PASS  the late capability answer clears the stale half-block projection
PASS  the late kitty capability answer schedules its own placement frame
PASS  the blanking frame settles before the late kitty placement is emitted
smoke-pixel-preview-harness: ALL-PASS
```

Final consecutive smoke exits: `0`, `0`, `0`.

## Explicit capability-to-frame edge

`RootView`'s renderer `capabilities` listener now performs this sequence:

```text
read renderer.capabilities
→ assign reportedGraphics.value
→ RootView.update()
→ detectGraphicsTier(reportedGraphics.value)
→ PixelImageMount.sync(new tier-bearing key)
→ renderer.requestRender()
```

`PixelImageMount.sync` retains its existing settle gate, so the cell frame
that blanks the old half-block projection lands before kitty placement.
There is no poll, timer, or keypress recheck.

## Multiplexer precedence and tests

`TUI_GRAPHICS_TIER` remains first. A positive reported kitty or sixel
capability is now accepted before any multiplexer floor because receiving
that answer through the multiplexer proves passthrough worked. A report with
no rich capability stays at half-block. With no report object, `$TMUX`
continues to force the half-block floor before environment heuristics.

`GraphicsTier.test.ts` covers the requested branches:

1. Reported kitty under `$TMUX`, reported `tmux`, and reported `screen`
   resolves to `kitty`.
2. No rich report under `$TMUX` or a reported multiplexer resolves to
   `halfblock`; no report object under `$TMUX` also stays at the floor.
3. The env override wins both with a rich report and with a no-rich report.

The theme invariant now records this precedence, the direct event edge, the
unforced PTY evidence, the rejected poll/timer/keypress alternatives, and
the required impossibility: an image painted before the capability answer
cannot stay at the half-block floor once the positive answer arrives.

## Verification

All requested commands and exact exit codes:

```text
bunx tsc --noEmit                                      0
bun test                                               0
  1358 pass, 0 fail, 15994 expect() calls
bun scripts/check-file-grammar.ts                      0
node .claude/skills/invariants/scripts/check_invariants.mjs --all   0
node .claude/skills/invariants/scripts/check_invariants.mjs --refs  0
bash scripts/conventions-gate.sh                       0
bun scripts/check-coverage-ratchet.ts                  0
bun scripts/harness/smoke-pixel-preview-harness.ts run 1            0
bun scripts/harness/smoke-pixel-preview-harness.ts run 2            0
bun scripts/harness/smoke-pixel-preview-harness.ts run 3            0
git diff --check                                       0
```

Targeted graphics/theme units also passed: 11 tests, 40 expectations, exit
`0`.

## What remains unproven

- The user-reported fail-before state did not reproduce in this PTY harness;
  the pre-fix path already upgraded without user input.
- The harness proves the selected tier, raw kitty placement bytes, blank
  underlying cells, and emission ordering. Its emulator does not render the
  kitty raster itself, so final visual confirmation in the user's actual
  terminal remains outside this harness.
