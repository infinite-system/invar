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

The user's request that created this skill (2026-08-01, condensed):
when discussing a UI task, the conductor drives the PTY and looks at
the thing itself, confirms what the user means by using the app, and
only then briefs an agent — in language grounded in what BOTH the
user and the conductor have seen. No jumping into development before
seeing. Propose design decisions from shared sight. Do not rush to
dispatch: confirm with the user that the brief has reached its
conclusion, then send comprehensive 10-20-item tasks with precise
specifications, not one-bug-one-agent waste.

## The loop

1. **SEE — drive before you speak.** The moment a UI topic opens,
   write or reuse a probe (PtyTestDriver at a real size, real
   fixtures) or run the app path the user names. Capture the concrete
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

## Refine the driving instrument itself (user addition, 2026-08-01)

While driving, the conductor is allowed — encouraged — to refine the
PTY driving layer so that driving is comfortable, fast, and
mechanical. The goal is a DETERMINISTIC API: helpers that reduce the
variance of HOW a drive is performed while increasing its accuracy.

- Prefer one named helper over a re-typed idiom: `selectPreset(name,
  appliedPredicate)`, `openBottomPanel()`, `slotTable(status)` —
  each encapsulating the correct waits and the correct mouse/key
  forms, so a drive reads as intent, not as key-and-click plumbing.
- When a drive step proves fiddly (a click that silently no-ops, a
  wait that races), fix or wrap the DRIVER, not the one probe — the
  press/release-vs-down/up gotcha belongs solved in a shared helper,
  not re-remembered per probe.
- Promote recurring probe fragments into the harness support layer
  (HarnessSmokeSupport or a conductor probe library) with the same
  discipline as any code: named, typed, condition-waited.
- The same refinements serve the builders: a deterministic drive API
  the conductor uses to SEE is the API the brief cites for the
  builder to REPRODUCE — one instrument, two users, zero variance
  between what each of us observed.

## The PTY is the shared entry point (user addition, 2026-08-01)

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
