# Task 516 — the UI design doctrine (distilled from our own designs)

Priority: user-directed
Engine: claude
Environment: linux
Model: fable-5
Effort: high
State: ACTIVE

## In plain words (user, 2026-08-05)

"We have to have a whole design doctrine made, based on our designs."
Distill the app's existing UI decisions into one written design
system that builders inherit: not invented taste — HARVESTED rules,
each citing the record, code, or landed task that established it.

## The harvest list (extend as the sources demand)

- The shared input model (selection, word ops, movements) — the
  editable-fields record + TextSelectionModel/SelectionDragBehavior.
- The overlay dialog family: component, 1-key button padding, focus
  and Escape rules (quit-confirmation as the exemplar).
- Hover/click state discipline: hover precedes click, active states,
  background unification (the #514 items are the counter-examples).
- Panel controls share paint and hit geometry (the record) — one
  stored range for paint/hover/tooltip/hit.
- The icon capability ladder (Nerd/Unicode/ASCII) + theme-contributed
  glyphs, never hardcoded tiers.
- Theme tokens: colors always via the active theme; contrast rules
  from the breadcrumb/scrollbar work.
- Spacing is information (the ivue skill section, generalized to
  chrome); 1-key paddings; leading-space affordances (#514's
  + Terminal item).
- Popup discipline: BoundedListPopup ownership (capturesKeyboard,
  owner-checked close), one modal slot.
- Templates-read-as-prose / no-logic-in-views as the enforcement
  substrate for all of it.

## Deliverable

.claude/skills/ui-design/SKILL.md — written for a builder mid-task
with thirty seconds, every rule with its WHY and its source cited;
plus a one-line addition proposal for the builder-fundamentals list
(user decides whether it joins the injection). Propose-only for any
invariant record changes it suggests.
