---
name: ui-design
description: >-
  The Invar UI design doctrine — harvested, not invented: every rule below
  was established by a landed task or an invariant record, and cites its
  source. Use when building or reviewing ANY surface (pane, dialog, button,
  input, list, scroll area): the six chapters are binding on every future
  window. A surface that violates a chapter is a defect even if it works.
---

# ui-design — the six chapters every surface satisfies

Read this as a builder mid-task with thirty seconds: each rule is one
paragraph, its WHY one sentence, its SOURCE one citation. The
enforcement substrate for all of it is the no-logic-in-views law
(ivue skill): every visual decision is a NAMED getter on a class, so
doctrine compliance is greppable and driveable.

## 1. BUTTONS

- One stored geometry per control: paint, hover, tooltip, and hit
  testing read the SAME half-open range — never parallel coordinate
  math. (Record: "Panel controls share paint and hit geometry",
  ui.invariants.md; established by the #503 glyph and #356 status
  control.)
- States are explicit and all present: rest, hover, active/pressed,
  and — where the control toggles — an ON state visibly distinct
  from hover. Hover backgrounds MATCH the control they decorate
  (the #514 hover-mismatch is the canonical counter-example).
- Affordance text carries its own air: one key-width padding inside
  the button; a leading space before glyph-led labels ("+ Terminal",
  #514). Never default-selected: a control is selected by the user's
  act, not by appearing.
- Glyphs come from the active theme's icon slots through the
  capability ladder (Nerd -> Unicode -> ASCII) — never a hardcoded
  tier. (Record: "Appearance is data with a capability fallback",
  project.invariants.md; the #356 r4 nerd-arm fix.)
- Semantics before chrome: a button that opens a surface TOGGLES it
  when the surface can be open (the #514 panel-button rule); creation
  belongs to Add menus, reach belongs to buttons.

## 2. DIALOGS

- ONE overlay family. Every confirmation and consent surface uses the
  shared overlay-dialog component — the quit-confirmation dialog is
  the exemplar — never inline y/N text. (User law, 2026-08-05;
  overlay-dialog smoke.)
- Buttons in dialogs carry the 1-key padding; the safe action is
  focused by default; Escape always means the non-destructive exit.
  (Record: "Quit requires explicit confirmation", app.invariants.md.)
- Consent copy states COUNTS and consequences: "Undo will revert 20
  items across 6 files; 2 changed since and will be skipped."
  Silent bulk operations are forbidden in both directions (do and
  undo). (The #515 design law.)
- Dialogs share the one modal slot; a modal dialog owns the keyboard;
  a non-capturing popup (suggestion lists) declares it and leaves
  typing with its owner. (Records: "Input overlays share one modal
  slot"; the capturesKeyboard option, #356 r5.)

## 3. FLOWS (multi-step interactions)

- A flow is a chain of surfaces with ONE cancel spine: Escape at any
  step returns to the prior stable state, never half-applied. Steps
  that mutate state late (pickers -> upload -> open) do the mutation
  LAST, after all consent.
- Every flow step is drive-addressable: its state is published
  (graph/status) so the step can be awaited as a CONDITION — a flow
  whose progress only paint can see is untestable by doctrine.
  (Harness law: waits observe conditions.)
- Mid-flight invalidation is detected, not hoped away: flows over
  mutable data (files, panes) verify their premise at the acting
  step and surface DRIFTED items per-item. (The #515 verification
  design; the #502 liveness test.)

## 4. TEXT INPUTS

- Every editable field is a citizen of the shared input model —
  BINDING record: "Editable text fields share one input model"
  (project.invariants.md). That means, everywhere, for free:
  selection (keyboard and pointer), alt+arrow word movements,
  alt+backspace / alt+delete word removals, home/end, the full set.
  A field hand-rolling a subset is a violation, not a shortcut.
- Inputs paint through the same caret/selection machinery the editor
  uses (field-caret smoke family); placeholder text is styled as
  hint, never as value.
- Inputs inside popups follow the popup's keyboard-ownership
  declaration (chapter 2).

## 5. SCROLL AREAS

- One generator owns each scroll position (Record:
  scroll.invariants.md); keyboard, wheel, drags, and animations write
  through it — a second writer first HALTS the current motion
  (the #356 r6 momentum-halt fix).
- Momentum discipline is shared: the one Momentum generator, its
  progressive gain, contrary-direction restart, and stop threshold —
  no surface invents its own physics. ("Live motion defines gesture
  continuation", scroll.invariants.md.)
- Thumbs are painted from the same position+extent the content uses;
  content and chrome cannot disagree. (The scrollbars smoke family;
  #461's border-anchor lesson: measure the pane, never guess cells.)
- Bottom-follow on fresh output, glide-halt on user intent — the
  terminal scrollback rules generalize to any streaming list.

## 6. COPY TEXT CAPABILITY — universal

- ANY surface presenting text — panes, dialogs, results lists,
  scroll areas, help sheets — supports selecting that text and
  copying it through the shared seams: TextSelectionModel +
  SelectionDragBehavior for selection (inclusive release cell, edge
  autoscroll), the Clipboard capability + OSC 52 for copy. "A window
  where text cannot be selected and copied is a doctrine violation
  by definition." (User law 2026-08-05; records: "Copy reaches the
  host terminal"; the #495 Shift+drag rule for mouse-aware children.)
- Copy feedback is visible: the Copied-N-chars flash (the #487
  telemetry surface) is the shared acknowledgment.

## The meta-rules

- DESIGN COHERENCE IS THE SAME DUTY AS CODE COHERENCE (user law,
  2026-08-06): every surface you add or touch must leave the whole
  EXPERIENCE more integrated — the same gesture means the same thing
  everywhere, new affordances speak the existing vocabulary (glyphs,
  paddings, hover grammar), flows have no gaps (every state
  reachable, every state exitable, nothing dead-ends), and the
  result is friendlier than before, not just compliant. A feature
  that works but introduces a second dialect — a new dialog style, a
  different hover behavior, an unfamiliar consent pattern — makes
  the product LESS designed. Check your surface against its
  siblings; if you and the neighbor disagree, either adopt the
  neighbor's form or propose the doctrine change that unifies both.
- HARVESTED, NOT INVENTED: extend this doctrine only with rules that
  cite a landed decision or record. Taste proposals go to the user
  first.
- Doctrine compliance is DRIVEN: every chapter's claims are
  assertable through the PTY harness and the graph; a compliance
  claim without a driven sighting is unverified (drive-pty skill,
  DRIVE ADVERSARIALLY).
- Counter-examples are curriculum: when a chrome bug lands in the
  backlog, its fix adds the missing sentence here, citing the task.
