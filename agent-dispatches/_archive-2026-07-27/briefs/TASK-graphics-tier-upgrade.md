# TASK — A late capability answer must reach the screen (user-reported image regression)

You are a builder on the Invar terminal IDE. Work ONLY in this worktree. Do NOT run
`scripts/merge-gate.sh`, do NOT push, merge, tag, or delete branches — the conductor does that.
Commit to this branch when done and report.

## The user's report and the measurement that explains it

The user sees images render at the HALF-BLOCK floor instead of kitty graphics, in a terminal where
kitty graphics work — and they saw high quality earlier. They ran a capability probe
(`scripts/report-graphics-capabilities.ts`) in their real terminal. Verbatim, trimmed:

```
at-start:            reported={"kitty_graphics":false,...,"multiplexer":"none"} -> tier=halfblock
after-probe-reply-1 … 12:  kitty_graphics:false                                -> tier=halfblock
after-probe-reply-13:      kitty_graphics:true                                  -> tier=kitty
final:                     kitty_graphics:true                                  -> tier=kitty
probe: 14 capabilities replies arrived
env TERM=xterm-256color TMUX=unset TUI_GRAPHICS_TIER=unset
```

Read that carefully, because it eliminates the obvious suspect: `multiplexer` is `"none"` and `TMUX`
is unset, so the multiplexer downgrade never fires for them. Detection is CORRECT — it just arrives
LATE. `kitty_graphics` is false for the first twelve capability events and flips true on the
thirteenth.

## Defect 1 (the regression): a capability upgrade never asks for a repaint

`src/modules/ui/RootView.ts` holds the report in a ref and reads it per frame:

- line ~1919: `const reportedGraphics = shallowRef(readReportedGraphics())`
- line ~1922: `renderer.on('capabilities', () => { reportedGraphics.value = readReportedGraphics() })`
- line ~1423: inside the frame effect, `detectGraphicsTier(reportedGraphics.value)` chooses the tier.

`grep` for a watcher on `reportedGraphics` returns NOTHING. So the listener updates the ref and stops.
Nothing calls `renderer.requestRender()`. We ENFORCE idle-quiescence — no frames when nothing
changed — so an image already painted at the half-block floor stays at the floor until some unrelated
event happens to schedule a frame. The comment above the ref claims "update() reading the ref inside
the frame effect is what upgrades the tier the moment the terminal answers". That is false as written:
reading a ref in an effect only upgrades anything if the change SCHEDULES the effect.

Why it appeared as a regression now: workspace activation went from ~280 ms to 0.145 ms yesterday
(#78). The first painted frame now beats the capability round-trip, where before the slow activation
gave the probe time to answer first. We did not break detection — we got fast enough to lose a race
that was always there.

Fix the missing reactive edge: when the reported capabilities change, request a render (and make sure
the pixel mount re-syncs at the new tier rather than keeping a stale half-block projection). Do NOT
add a poll, a timer, or a "recheck on keypress" hack — the event already exists; the edge from it to a
frame is what is missing. Keep degrade-UP-only behaviour: the floor must never flash a rich tier it
has not been told about.

## Defect 2 (why no test caught it): the pixel smoke forces the tier

`scripts/harness/smoke-pixel-preview-harness.ts` launches with `TUI_GRAPHICS_TIER: 'kitty'` (~line
117). Every existing assertion about kitty payloads therefore proves the ENCODER works and says
nothing about whether the tier is ever CHOSEN correctly — the entire selection path, which is what
broke, has no coverage. Forcing the tier is right for the encoder assertions; keep them. Add coverage
for the unforced path.

The load-bearing test, and it must FAIL before your fix and PASS after:

1. Launch with NO `TUI_GRAPHICS_TIER` and open an image, so the app paints at the half-block floor.
2. Then make the terminal ANSWER the capability query, late — after that first paint. The harness owns
   the PTY master, so it can write the reply the app's own query asked for. Discover the query rather
   than guessing it: capture the app's raw output stream, find the graphics capability query it emits,
   and reply with the matching response. State in your report which query bytes you found and which
   reply you sent.
3. Assert that a kitty placement then appears on the wire WITH NO FURTHER USER INPUT. That last clause
   is the whole point — if your test presses a key, resizes, or clicks, it schedules a frame by
   accident and passes even with the defect present. It must observe a condition, never a duration.

If OpenTUI turns out to swallow or never re-emit the event under harness conditions, do not fake the
test. Report exactly what you observed and what you could and could not prove.

## Defect 3 (adjacent, unproven for this user — fix it anyway, it contradicts itself)

`TerminalCapabilities.detectGraphicsTier` (`src/modules/theme/TerminalCapabilities.ts:47`) documents
its own precedence as "OpenTUI's reported capabilities (the terminal's own answer — never
second-guessed by env)" and then, two lines later, second-guesses it: `if (Environment.env("TMUX"))
return "halfblock"`, and `if (reported.multiplexer !== "none" …) return "halfblock"` — thrown even
when `reported.kitty_graphics` is true.

The structural argument for changing it: a kitty capability reply that arrives THROUGH a multiplexer is
itself evidence that the multiplexer passed the query through. Discarding a positive answer in favour
of an environment guess is exactly the inversion the doc-comment forbids. Restrict the half-block floor
to the case where no rich capability was REPORTED — i.e. keep it as a floor for silence, drop it as an
override of an answer. Update the invariant record and the doc-comment so the code and the stated
precedence agree, and keep `TUI_GRAPHICS_TIER` as the escape hatch above everything.

Cover this with a unit test per branch: reported-kitty-under-multiplexer → kitty; reported-nothing-
under-multiplexer → halfblock; env override wins in both.

## Rules

- Full descriptive identifier names, no abbreviations. Match surrounding style. `.prettierrc`, 80 cols.
- `Static()`/`Reactive()` ivue conventions, `protected` floor, late-read discipline.
- Read `src/modules/theme/theme.invariants.md` and `src/modules/image/image.invariants.md` BEFORE
  editing — including their Rejected-alternatives sections.
- Every wait observes the condition its assertion reads. No bare sleeps, no vacuous predicates, no
  clock-based silence assertions.
- Invariant records need every field including **Scope**. Verify the checker with EXIT CODES, never a
  log tail. The upgrade invariant's Impossible-if-true should name this bug: *an image painted before
  the capability answer cannot stay at the floor once the answer arrives*.
- Run and report exact exit codes: `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`,
  both invariant checker passes, `bash scripts/conventions-gate.sh`,
  `bun scripts/check-coverage-ratchet.ts`, and every smoke you touch three times.
- Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>` (use `-F`: backticks
  in a `-m` string get executed by the shell). Leave the worktree clean; `git ls-files | grep '^TASK'`
  must return nothing.

## Report to /tmp/graphics-tier-READY.md

The query bytes you found and the reply you sent; proof the new test fails before the fix and passes
after (both outputs); the exact edge you added from the capabilities event to a frame; what changed in
the multiplexer precedence and the three unit-test branches; and anything you could not prove.
