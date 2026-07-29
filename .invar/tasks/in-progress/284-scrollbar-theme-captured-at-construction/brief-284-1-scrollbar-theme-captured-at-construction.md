# Brief — #284: scrollbar colours must derive from the live theme, not a construction snapshot

Read first: [task-284-scrollbar-theme-captured-at-construction.md](task-284-scrollbar-theme-captured-at-construction.md)
— the record governs. #290 just landed in this seam: both axes now share
ONE panel/dim pair supplied by ScrollbarSync, and the corner/track
geometry changed — build on current main, do not resurrect the old
accent pair.

Your exact failing oracle, banked by #290's driven run (both scales):

> OBSERVED #284: colours stayed 16161e/787c99 after the live light switch

Arms:

1. **Generator fix**: `ScrollbarSync` captures `theme.palette` into
   trackOptions at CONSTRUCTION and never refreshes — the ivue law is
   derive-don't-copy. Make bar colours derive from the live theme ref at
   the shared painter so every bar follows a switch live.
2. **Sweep the shape**: find other appearance options captured eagerly
   at construction in the scrollbar consumers (#282's census names
   them) and any similar capture in the painter's orbit; same fix
   shape, list the census in the report.
3. **Driven assertion, both polarities**: PTY run switches dark→light —
   both axes repaint with the light pair AND the dark pair is absent;
   switch back — dark pair returns. At 500 and 100k. #290's parity
   assertions must stay green throughout.
4. **Positive control**: re-plant the captured snapshot — the theme
   switch arm must go red.

## Invariants in scope

[One scrollbar painter gives each axis equal visual weight](../../../../src/modules/ui/ui.invariants.md#one-scrollbar-painter-gives-each-axis-equal-visual-weight)
and the track-derivation record (extend with live-theme derivation);
the theme records; ivue derive-not-copy conventions in
[project.ivue-reference.md](../../../../project.ivue-reference.md).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: generator fix, capture-shape census with fixes, theme
switch driven both directions at both scales with both polarities,
planted-snapshot red quoted, green `bun test` + scrollbar/settings
smokes. The conductor gates at landing.
