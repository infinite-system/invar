# Brief — #298: breadcrumbs — drop nav arrows, lighten separators

Read first: [task-298-breadcrumbs-drop-nav-arrows-lighten-separators.md](task-298-breadcrumbs-drop-nav-arrows-lighten-separators.md)
— USER-DIRECTED; his verbatim words are in the record and GOVERN.

Arms:

1. **Remove prev/forward** from the breadcrumbs bar — the top workspace
   bar already owns navigation history; the duplicate goes. Keyboard
   bindings that routed through the breadcrumb controls must keep
   working via the workspace-bar owner (both polarities: control gone
   from breadcrumbs, navigation still drives from the bar).
2. **Separator arrow colour**: currently blends with the background —
   "should be a bit lighter". DERIVE the colour from the active theme
   (derive-don't-copy law — no hardcoded hex; take the theme token and
   lighten at the seam). Verify with truecolor cell asserts
   (COLORTERM=truecolor) at both scales, and under live theme switch
   (#284 just landed live-theme derivation — reuse that seam).

Drive the real breadcrumb bar in the PTY harness; frame quotes for
before/after; contrast assert (separator fg != background, and
measurably lighter than previous token).

## Invariants in scope

The breadcrumbs records; theme/colour derivation records touched by
#284; navigation-ownership records for the workspace bar.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: arrows removed with navigation preserved (both
polarities), separator colour derived + contrast-asserted at both
scales + across a live theme switch, green `bun test` + breadcrumb
smokes. The conductor gates at landing.
