# Scroll — Invariants

The cross-surface scroll contract. These records consolidate the shared
generator already enforced by `Momentum`, the real PTY scroll instrument, and
the behavioral contracts. Surface-specific extent, geometry, and input-routing
rules remain in their module contracts.

## Reality-based invariants

None. Scroll behavior is a chosen discipline built on the project reality that
the terminal exposes a bounded viewport.

## Chosen invariants

### One generator owns each scroll position

**Invariant:** If a scroll position is under wheel momentum, then input adds
plain impulses and the animation tick alone publishes momentum and advances the
position.

**Scope:** Every horizontal and vertical `Momentum` regime. Keyboard,
programmatic jumps, contrary-direction input, and child-terminal wheel
forwarding may take authority only by halting the current regime first.

**Mechanism:** `Momentum.queueImpulse` appends to `pendingImpulses` without
publishing reactive state. Each surface tick calls `Momentum.stepMomentum`,
which drains that queue through `addImpulse`, publishes one next momentum
value, and applies the returned whole-row movement.

**Generates:** One position writer per regime per frame; input that cannot race
the animation tick; adopt-and-stop transitions between wheel, keyboard, and
programmatic authority.

**Rejected alternatives:** Publish momentum from both input and the animation
tick — two reactive writers make projection cadence depend on input cadence and
silently eat input under pressure.

**Evidence:** `src/modules/system/Momentum.ts` (`queueImpulse`,
`stepMomentum`); production queue and tick call sites in `Workspace`,
`DiffView`, `FileTreeWorkspace`, `GitWorkspace`, `ScrollableTextViewport`,
`MarkdownSplitView`, and `TerminalPaneContent`; commit `3af155c`; the
`glide-input-coalescing` contract's planted direct-publication defect.

**Impossible if true:** A wheel-input path writing a momentum-managed scroll
offset or publishing reactive momentum directly; two owners advancing one
position in the same frame.

**Verification:** `bun test src/modules/system/Momentum.test.ts && bash
scripts/behavioral-contracts.sh`. The unit test proves queued input leaves
velocity unchanged until `stepMomentum`; the real-rate contract detects the
former per-event reactive publication through projection counts. No standalone
structural check forbids every possible future direct offset write, so the
production call-site inspection remains part of verification.

**Status:** established

**Last refined:** 2026-07-27

### Every wheel event becomes one impulse

**Invariant:** If a wheel event reaches a momentum-managed scroll route, then
exactly one pending impulse reaches `Momentum.addImpulse`; render requests may
coalesce, but impulses may not.

**Scope:** Wheel events accepted by the editor, diff, file tree, git panes,
shared text viewports, Markdown preview, and host terminal scrollback. Events
forwarded to a child terminal are outside this contract.

**Mechanism:** Every production wheel route calls `Momentum.queueImpulse` once.
The queue preserves event order, and `stepMomentum` drains every entry. The
root wheel throttle wraps only `renderer.requestRender()` and never the input
route.

**Generates:** Lossless trackpad-rate input with frame-rate projection;
coalescing that reduces rendering work without weakening the gesture.

**Evidence:** `src/modules/system/Momentum.test.ts` (`real-rate input queues
every impulse for one animation write`);
`scripts/harness/measure-scroll-smoothness.ts`; commit `3af155c`; driven
2,000-line and 100,000-line editor and diff cases each measured 150 events and
150 applied impulses.

**Impossible if true:** A throttle, debounce, overwrite, or queue drain that
drops or merges wheel impulses.

**Verification:** `bash scripts/behavioral-contracts.sh`; the
`glide-input-coalescing` stage requires 150 events to produce 150 impulses in
all four editor/diff and 2,000/100,000 cases while projection passes remain
below the event count.

**Status:** established

**Last refined:** 2026-07-27

### Scroll frame cost is document-length independent

**Invariant:** If the same flat editor viewport and gesture are rendered over
unchanged documents of different lengths, then document reads, fold lookups,
wrap lookups, and layout computations per attributed frame are identical.

**Scope:** Flat editor scrolling at fixed terminal geometry, settings, fixture
shape, and input gesture, compared at 2,000 and 100,000 lines. Fold density,
word wrap, gutter density, depth, and diff are separate axes.

**Mechanism:** `EditorFrameAttribution` brackets `RootView.update()` and counts
work at the shared projection seams. `measure-scroll-smoothness.ts` divides
integer count deltas by attributed frame counts with exact rational
cross-multiplication.

**Generates:** The scroll instance of the product-defining rule *Cost tracks
the actively observed set*; a 100,000-line document that costs the same per
frame as a 2,000-line document. This is the invariant Invar is named for.

**Evidence:** `src/modules/editor/EditorFrameAttribution.ts`;
`scripts/harness/measure-scroll-smoothness.ts`; commits `84bb97b` and
`d61124d` plus the fold-cost work; `project.tools.md`. The current default
drive measured exactly 65 document reads, 33 fold lookups, 2 wrap lookups,
and 1 layout computation per frame at both scales.

**Impossible if true:** Any attributed per-frame quantity proportional to
document length; a 100,000-line fixture performing more reads or lookups per
frame than the same 2,000-line drive.

**Verification:** `bash scripts/behavioral-contracts.sh`; `glide-smoothness`
requires every 100,000/2,000 per-frame count ratio to equal exactly 1. Its
planted one-read-per-100-lines control must fail before the production result
is trusted.

**Status:** established

**Last refined:** 2026-07-27

### Live motion defines gesture continuation

**Invariant:** If a same-direction impulse arrives while momentum is still
moving, then it continues the live gesture regardless of elapsed time since
the previous impulse.

**Scope:** `Momentum.addImpulse` for every wheel-momentum consumer. A regime
whose velocity has fallen below `stopVelocity` may begin a new gesture;
contrary-direction input deliberately halts and restarts.

**Mechanism:** `gestureContinues` is true when either physical velocity is
live or the 150 millisecond input-cadence proxy is live. The clock classifies
pre-motion input only; once motion exists, velocity is authoritative.

**Generates:** A follow-on flick that adds to the glide the user can still see;
gesture identity that cannot expire while its motion remains visible.

**Rejected alternatives:** Clock-only continuation — a long live glide can
outlast the cadence window and receive a from-rest-sized follow-on impulse.

**Evidence:** `src/modules/system/Momentum.ts` (`liveGlideContinues`);
`src/modules/system/Momentum.test.ts` (`a live glide continues gain outside
the input cadence window`); commits `87d25d0` and `25cdf18`; the driven
continuation sweep at 200, 250, and 300 milliseconds.

**Impossible if true:** A from-rest-sized impulse delivered while the surface
is still moving; a live same-direction glide resetting because a timer
expired.

**Verification:** `bun test src/modules/system/Momentum.test.ts && bash
scripts/behavioral-contracts.sh`; `glide-continuation` requires each delayed
boundary to cross at least as many rows as the immediately preceding frame.

**Status:** established

**Last refined:** 2026-07-27

### Same-direction impulses accumulate to the ceiling

**Invariant:** If same-direction impulses continue within one live gesture,
then visible flick peaks increase until the configured ceiling, and impulse
energy received at the true ceiling is retained to replace later decay.

**Scope:** `Momentum.queueImpulse`, `Momentum.addImpulse`, and
`Momentum.stepMomentum` for every wheel-momentum consumer. Contrary-direction
input and explicit jumps retain their halt-and-restart behavior.

**Mechanism:** The gain ramp preserves rest-equivalent gesture velocity across
frames and reserves headroom for three twelve-impulse flicks.
`ceilingSustainingVelocity` banks only true-ceiling overflow and spends it only
to replace velocity lost to decay.

**Generates:** Strictly rising separated-flick peaks before saturation; rapid
input that sustains the cap; raised ceilings that remain reachable without
making the gain curve slower.

**Rejected alternatives:** Hard-clamp and discard overflow — impulses at the
ceiling disappear while identical impulses delivered after decay remain
effective.

**Evidence:** `src/modules/system/Momentum.test.ts` (`successive hard flicks
retain headroom across configured ceilings`; `rapid hard flicks sustain capped
speed with excess impulses`); commits `c51f185` and `fd623df`; the
`glide-accumulation` driven fingerprints at 220 and 320 rows per second.

**Impossible if true:** Velocity discarded at the configured ceiling; a later
flick producing an equal or smaller peak than an earlier flick while headroom
remains; continued input failing to sustain capped travel.

**Verification:** `bun test src/modules/system/Momentum.test.ts && bash
scripts/behavioral-contracts.sh`; `glide-accumulation` requires three strictly
rising four-frame peaks at both ceilings and a rapid 60-notch drive to travel
at least
`ceil(verticalFlingCeiling * maximumGlideDurationMilliseconds / 1000 - 1)`
whole rows. Both behavioral predicates run planted negative controls.

**Status:** established

**Last refined:** 2026-07-27

### The glide tail is bounded and effective

**Invariant:** If a selectable maximum glide duration is applied, then motion
halts no later than that duration after the latest impulse, and every
selectable value still lets one accepted wheel notch produce visible motion.

**Scope:** `maximumGlideDurationMilliseconds`, its Settings row, and every
`Momentum` profile. The default is 900 milliseconds; the selectable range is
100–2,000 milliseconds in 50 millisecond steps.

**Mechanism:** `stepMomentum` limits integrated frame time to the remaining
tail and halts when elapsed time reaches the setting. `SettingsPanel` supplies
the bounded numeric selector, and every momentum owner reads the live setting
into its options.

**Generates:** A finite tail after dense input; one discoverable control shared
by every scroll surface; a short setting that remains a short motion rather
than becoming dead input.

**Open question:** Issue #146 — at the 100 millisecond minimum, one notch
currently travels zero visible rows; what mechanism preserves one row without
violating the selected tail?

**Evidence:** `src/modules/system/Momentum.ts`;
`src/modules/settings/Settings.ts`;
`src/modules/settings/SettingsPanel.test.ts`;
`scripts/harness/smoke-settings-applied-harness.ts`; commits `3af155c` and
`2442d8f`.

**Impossible if true:** Momentum continuing past the selected tail; a
selectable duration swallowing an accepted wheel notch without visible
motion.

**Verification:** `bun test src/modules/system/Momentum.test.ts
src/modules/settings/Settings.test.ts
src/modules/settings/SettingsPanel.test.ts && bun
scripts/harness/smoke-settings-applied-harness.ts`. These checks enforce the
900 millisecond default, the 100–2,000 range, persistence, and the applied
effect at 300 and 1,200 milliseconds. No enforcing check currently proves
visible motion at every selectable value; issue #146 is the known violation.

**Status:** provisional

**Last refined:** 2026-07-27

### Driven scroll contracts derive their quantities

**Invariant:** If a driven scroll contract chooses an expected quantity, then
that quantity is derived from declared settings and mechanism; observation may
validate the bound but may not define it.

**Scope:** PTY-driven scroll assertions in `scripts/behavioral-contracts.sh`
and `scripts/harness/measure-scroll-smoothness.ts`. Deterministic fixed-step
unit tests may assert exact frame counts because they control phase and time.

**Mechanism:** Contracts compare event, impulse, projection, row-travel, and
attributed-work counts. The rapid-ceiling floor integrates the configured
velocity and tail, then subtracts only the sub-row residual the integrator may
discard:
`ceil(verticalFlingCeiling * maximumGlideDurationMilliseconds / 1000 - 1)`.

**Generates:** Phase-independent live contracts; expected values that survive
host load, frame coalescing, and refactoring while the mechanism remains the
same.

**Rejected alternatives:** Copy an observed frame count into the contract —
the former 24-frame rapid-ceiling assertion varied from 22 to 24 while whole
row travel remained exactly 197.

**Evidence:** Commit `9125b0f`; the `glide-accumulation`,
`glide-input-coalescing`, and editor scale-invariance predicates in
`scripts/behavioral-contracts.sh`; positive controls for every count-based
predicate.

**Impossible if true:** A driven scroll contract whose expected value came
from an observation rather than the mechanism; a live assertion that fails
only because identical travel was divided across a different number of
completed frames.

**Verification:** `bash scripts/behavioral-contracts.sh`; the rapid 60-notch
clause enforces the derived whole-row floor and rejects a decaying synthetic
sequence. Future additions remain review-time enforced because no mechanical
checker can distinguish a derived constant from an observed one.

**Status:** established

**Last refined:** 2026-07-27
