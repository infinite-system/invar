---
name: ui-task
description: >-
  Protocol for user-interface work sessions between the user and the conductor.
  Use when the user reports a UI bug, requests a UI feature or refinement, or
  starts describing anything visual in the app ("the panel looks", "the button
  should", "it renders wrong"). Core rule: DRIVE THE PTY AND SEE IT before any
  briefing or development — never brief from the user's words alone, especially
  for fixes of existing behavior. Accumulate confirmed sightings into ONE
  comprehensive multi-item brief; never spend an agent on a single button.
---

# ui-task — see it first, batch it, then brief

When discussing a UI task, the conductor drives the PTY and looks at
the thing itself, confirms what the user means by using the app, and
only then briefs an agent — in language grounded in what BOTH the
user and the conductor have seen. No jumping into development before
seeing. Propose design decisions from shared sight. Do not rush to
dispatch: confirm with the user that the brief has reached its
conclusion, then send comprehensive 10-20-item tasks with precise
specifications, not one-bug-one-agent waste.

## The loop

1. **SEE — drive before you speak.** The moment a UI topic opens,
   reach for `bun run drive` FIRST (scripts/harness/drive.md): ordered
   action flags with per-action condition waits, `--gesture` verbs,
   and `--cells ROW,C1-C2` color dumps — most sightings are one
   command, no probe file. Write a probe .ts (PtyTestDriver at a real
   size, real fixtures) only when the sighting needs loops or logic
   a flag chain cannot express. Capture the concrete
   geometry/text/colors: slot tables, findText positions, cell
   values. THE SIGHTING IS THE ENTRY TICKET to the conversation —
   a fix for something that exists must be CONFIRMED AS SEEN before
   any other step. Probe gotchas live where probes live
   (tmp/probe-*.ts; mouse kind is press/release, never down/up).
2. **CONFIRM — converse over the same pixels.** Reply to the user
   with what you saw, in numbers and names ("bottomPanel L37 W54
   while rightDockRemainder sits W29 blank"). If your sighting
   disagrees with their words, say so and re-drive with their exact
   recipe. You may propose your own design decisions here — you are
   both looking at the same thing; that is what makes the
   conversation possible.
3. **ACCUMULATE — one brief, many items.** Keep a running itemized
   draft (numbered, one line of seen-evidence per item + the wanted
   outcome). UI items are cheap to add once a builder is in the
   area: alignment, color, spacing, tooltip text, glyph choice.
   Target 10-20 items when the surface allows; a single-item
   dispatch needs a reason (urgent breakage, seam risk).
4. **CONCLUDE — ask before sending.** Explicitly ask the user
   "is this brief concluded, or is more coming?" Dispatch only on
   their yes. Their pause is not a yes.
5. **BRIEF — translate sight into agent language.** Each item: the
   exact driven reproduction (fixture, size, gesture), the observed
   values, the expected values, and the smoke assertion that locks
   it. The builder must be able to SEE each item the same way —
   name the probe or drive recipe per item. The standard brief
   sections (Invariants in scope, Bycatch expected) still apply.

## Rules

- Never brief a UI fix you have not driven and seen. The user's
  description names the symptom; the probe names the mechanism.
- Never dispatch mid-conversation. The brief concludes when the
  user says it concludes.
- Batch by surface, not by symptom count: one builder per UI area
  (panel chrome, editor gutter, status bar), all its items at once.
- Precision is what buys the batch: 20 vague items fail; 20 items
  with driven before/after values land in one round.
- Design proposals are welcome but marked as proposals — the user
  decides; record their ruling verbatim in the task file.
- The probe that confirmed the sighting ships with the task (commit
  it or reference it) so the builder starts from the same evidence.

## Refine the driving instrument itself

While driving, the conductor is allowed — encouraged — to refine the
PTY driving layer so that driving is comfortable, fast, and
mechanical. But the refinement direction matters: **the API is not `openBottomPanel()` — it is "drive to the
button and click it" or "press the shortcut" — the same path the user
takes.** The reduction is never an alternative interface that
bypasses the user's path; it is a more accurate reproduction of that
path in fewer steps.

Two layers, refined differently:

- **Gestures stay real, always.** Mouse moves travel through cells,
  hover precedes click, the click lands on the visible affordance,
  shortcuts are the user's chords. This is non-negotiable because a
  whole defect class lives only on the real path: hover states that
  never appear, hit targets one cell off, tooltips that flicker
  mid-travel, affordances nothing highlights. A helper that teleports
  (calls the command registry, sets state directly) stops seeing what
  the user sees and forfeits the shared-sight premise of this skill.
- **The envelope is deterministic.** What gets encoded to reduce
  variance and increase speed: the one correct byte form of each
  input event (press/release, never down/up), the condition wait
  between gestures (the popup IS open before the next click), and the
  reading of results (slot tables, findText positions). The conductor
  never fights the instrument — the instrument walks the user's path.

Practical form: named gesture helpers like `clickLayoutSwitcher()`
(locate the visible control, move there, click, await the popup) or
`pressPanelShortcut()` — each named for the user action it performs,
each internally a real gesture with correct waits. When a drive step
proves fiddly, fix or wrap the DRIVER once, in the shared support
layer — not per probe. Compression that skips gestures is allowed
only for uninteresting preamble (opening a workspace before the
surface under discussion), and the brief must say where the faithful
path begins.

This also unlocks browsing as an instrument: hover-sweep probes that
walk the mouse across a row and record what lights up cell-by-cell —
per-click browsing mechanized, catching tooltip and hit-geometry
defects nothing else finds.

## The PTY is the shared entry point

The deterministic driving layer is not conductor tooling — it is THE
shared entry point into the app for every party: the user (in their
real terminal), the conductor (probing), and every builder agent
(reproducing and verifying). One instrument, all eyes.

Consequences:
- Briefs point builders at the SAME helpers and probes the conductor
  drove — a builder's first act on a UI task is to run the named
  drive and see what the conductor and user saw.
- The quality of seeing IS the quality of everything downstream:
  debugging (the mechanism is visible, not guessed), coding (the
  change is checked against the same view), and being on one page
  with the user (three parties, one picture). Improving the driving
  API is therefore never yak-shaving — it compounds across every
  future task and every agent.
- New app surfaces should land with their drive path reachable
  through this entry point (status projections, slot tables,
  deterministic gestures) — a surface only a human can reach is a
  surface no agent can verify.

## The driver is also the test driver

Gated smokes drive through the SAME gesture layer — a second, frozen
test path would fork the definition of "what the user does" and the
two would drift apart. A helper's contract is the user ACTION (drive
to the wrap toggle and click it); its mechanics (byte forms, travel,
waits) are refined only toward higher fidelity to the real path. So
when a driver improvement flips a smoke, exactly two cases exist:
the old driver's lower fidelity was hiding a bug (the flip is a
finding, file it), or the driver regressed (also a finding, in the
driver). Neither is flake. A driver change must classify every flip
it causes in its report, never silently re-green.

Guards that keep this safe:
- Smoke assertions bind to END-STATE and ordering, never to driver
  internals (travel step counts, timing) — the timeless-gate rule.
- The driver carries its own small fidelity contract (press/release
  byte forms, hover-precedes-click, waits that actually wait), so a
  driver change gates itself before downstream smokes judge it.

Migration is a RATCHET, never a wholesale conversion:
- New smokes use the gesture helpers, always.
- A task touching a surface migrates that surface's smokes in the
  same branch.
- A smoke that flakes or is caught green-while-broken converts on
  the spot as part of its fix.
- Smokes that TELEPORT past an affordance the user must traverse
  (command-registry calls where the user clicks a control) are the
  one class worth converting deliberately — they can be green while
  the visible path is broken.

## Illustrations — reproduce the target in cells

Terminal UI has the rare property that a mockup IS the medium: an
ASCII/box-drawing illustration renders exactly what the screen will
hold. Use this at two points, as explicit protocol:

- **To the user, when confirming.** After a sighting or a requested
  change, reproduce the surface in a small cell-mockup — current
  form and proposed form side by side (`now → want`). The user
  corrects the drawing, not a paragraph; misunderstandings die in
  the mockup instead of in a dispatched brief. A confirmed mockup is
  a design decision recorded.
- **To the builder, in the brief.** Ship the confirmed mockups as
  the specification of end state: per item, the `now` drawing (with
  driven cell evidence) and the `want` drawing. A builder who can
  diff two pictures against the live grid needs far fewer words —
  the mockup is simultaneously the spec and the acceptance sketch
  the smoke assertion is written from.

Rules: mockups show the CELLS (glyphs, spacing, alignment) —
annotate colors/tones as labels beside the drawing, never invent
glyphs the theme vocabulary lacks; keep each mockup minimal (the
rows/columns under discussion, not the whole screen); a mockup the
user corrected is re-shown corrected before it enters the brief.

## The design contract

`design.invariants.md` (repo root, once it exists) is the design
system: how buttons, dialogs, paddings, hover reveals, and splitters
are done, so every agent builds consistent UI. Every UI brief lists
it in Invariants in scope; every settled design ruling from a ui-task
conversation is proposed into it as a record — the conversation's
design decisions outlive the task.
