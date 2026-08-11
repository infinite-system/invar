# READY report — #531 (scrollbars grid timeout sighting)

Branch: `fleet/531-scrollbars-grid-timeout-sighting`, commit `e1085c05`.

## In plain words

The test scrolls to a very long line (line 401) and waits to see the marker at
its end. The editor paints its horizontal scrollbar over the text of the last
visible line, but the line's number still shows. When scrolling happened to
stop with line 401 as the last visible line, the test saw the number, believed
the line was readable, and scrolled right forever while the marker could never
paint. Machine load moved where scrolling stops, so this fired rarely and only
under load. The test now also requires line 402's number on screen, which puts
line 401 one row higher, off the scrollbar row, so its text can paint.

## The exact failing wait, per sighting

- Sighting 2 (#530's run) and sighting 3 (gate-539-r2): the same wait —
  `awaitGridCondition('the deep widest line is visible during the wheel drive')`
  at [smoke-scrollbars-harness.ts:2398 pre-fix](../../../../scripts/harness/smoke-scrollbars-harness.ts)
  (`findText('DEEP-WIDEST-END-MARKER')`, 60s budget). The sighting-3 frozen
  frame is preserved as
  [evidence-531-gate-539-r2-contention-scrollbars.log.txt](evidence-531-gate-539-r2-contention-scrollbars.log.txt).
- Sighting 1 (gate-514 r1): its log directory
  `/tmp/merge-gate-failures.bd0013ddbc854489.1526167` no longer exists on this
  host. The wait's description is unrecoverable. The task file records only
  "awaitGridCondition (PtyTestDriver.ts:453)". It is consistent with the same
  smoke and the same wait family, but I cannot prove which wait it was.

## Diagnosis (the three-clocks question, answered)

No clock disagreed and nothing starved. The condition itself was
unsatisfiable in one reachable geometry:

1. The horizontal scrollbar paints one row of lower-half blocks over the LAST
   content row's text. The gutter number of that row still paints. The smoke
   itself asserts this bar ("overflowing tree paints one lower-half horizontal
   bar row"), and the frozen frame shows `401  ▄▄▄…` with the right extent
   already reached.
2. The precision-approach loop judged "line 401 is vertically visible" by
   `findText('401  ')` alone. `findText` scans whole rows, so the gutter
   number on the bar-covered row satisfies it.
3. The approach descends in 6-line steps from a fling rest position that
   varies with host load. Usually line 401 lands above the bar row and the
   marker paints. When it lands exactly on the bar row, the loop switches to
   wheeling right and never scrolls down again. The marker can never paint,
   and the 60s grid wait times out.

So this is a smoke-side condition gap, not paint starvation and not a product
defect. The paint pipeline delivered every frame; the frame it delivered
could not contain the marker.

## Reproduction verdict

The trap is geometry-dependent (a 1-in-6-ish landing residue seeded by an
uncontrolled fling), so dice-rolling full runs was replaced by a
deterministic positive control on the real failure artifact:
[probe-531-bar-row-predicate-control.ts](probe-531-bar-row-predicate-control.ts)
replays the preserved gate-539-r2 frozen frame. Old predicate: reports the
line visible (planted defect red). Marker: absent, so the old wait could
never resolve there. New predicate: reports not-yet-visible, so the fixed
loop wheels down. 4/4 checks pass; the probe exits 1 if any regresses.

## The fix

One predicate in the smoke's precision approach
([smoke-scrollbars-harness.ts](../../../../scripts/harness/smoke-scrollbars-harness.ts),
commit `e1085c05`): line 401 counts as vertically visible only when line
402's gutter is also on screen. That places 401 strictly above the bar row.
No timeout was widened. No assertion was weakened. No tier was skipped. The
wait at :2398 is unchanged — it remains the oracle.

## Verification (run counts)

- Positive control probe: 4/4 checks green (red-on-plant demonstrated via the
  old predicate against the real failing frame).
- Solo: 5/5 runs of `bun scripts/harness/smoke-scrollbars-harness.ts` green.
- Contention: 5 rounds of 4 concurrent copies (4-way, 16-core host) — 20/20
  green, every copy's exit code counted.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  0 problems.

## Invariants in scope — the brief's question

Does the flake stress "One generator owns each scroll position"
([scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md))
under an unstated no-load assumption? No — that record and its neighbors are
untouched: one generator moved the position throughout, and every observed
rest position was legitimate. The unstated no-load assumption lived in the
SMOKE's approach loop: "the widest line never rests on the horizontal-bar
overlay row". The fix removes that assumption. "Driven scroll contracts
derive their quantities" is upheld: the fix derives visibility from the bar's
recorded painting mechanism instead of copying an observed landing.

## Bycatch

- Design observation (not fixed): the horizontal scrollbar overlays the last
  content row's TEXT while that row's gutter number still paints — a user
  cannot read the last visible line wherever a horizontal bar is shown. Seen
  in the gate-539-r2 frozen frame and reproduced by the probe. Whether this
  is accepted design or a chapter-5 (scroll areas) coherence gap is a
  conductor/user call.
- Suspect (not observed to fire): the precision loop's
  "a precision wheel gesture starts" wait
  (`workspaceScrollMomentumAtRest === false`) would hang if a wheel at a
  clamped extent produced no momentum start. Every green run traverses this
  wait, so today it always starts; noted as a latent shape only.
- None further observed.

## Tree state

Worktree clean, one commit (`e1085c05`) on the branch: the smoke fix, the
probe, and the preserved evidence log (`.txt` suffix — the repo gitignores
`*.log`). No gate run (the conductor gates and lands).
