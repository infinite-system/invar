# 281 — structure pane round two: no imports, visibility/$cache marks, override detection, in-pane depth gear

State: IN-PROGRESS
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: USER-DIRECTED (2026-07-29 09:5x, verbatim; RECORDED FOR NEXT ROUND — do not dispatch until the user's queue reopens)

## Outline

User refinements on the landed #274 pane, verbatim-derived:

1. **Imports do not belong in the outline.** Filter import declarations
   out of the structure source (all file types the TS analyzer serves).
2. **Public/private differentiator.** Rows mark member visibility
   (public vs private/#private) — glyph or color per the pane's existing
   vocabulary; both themes.
3. **$cache differentiator** (ivue convention): members under the $cache
   namespace/manifest read distinctly from plain members — our own
   convention deserves its own mark.
4. **Override detection.** A member that overrides a parent's is marked
   as an override. Requires inheritance awareness in the analyzer arm.
5. **The "subclass of parent" line**: currently the outline shows an
   inheritance line — REMOVE it, or keep behind an optional setting
   (default off). User said either; prefer the setting if it is one flag
   on the existing settings seam, else remove.
6a. **Getters get their own glyph** (and a touch of color): getter/setter
   accessors read distinctly from methods and fields in the outline —
   their own glyph, subtle color per the pane vocabulary, both themes.

6. **Depth control in-pane.** The depth/indent selector reachable from a
   gear affordance in the pane itself (tooltip/gear row near the filter
   field), not only via settings. Same setting underneath — the gear is
   a second surface on the ONE generator, never a second source of truth.

All arms under real defaults, positive control each, labels stable.

## Invariants in scope

- structure.invariants.md (#274's records — extend, don't fork); the
  settings records; the ivue $cache conventions (project.ivue-reference).

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- User message 2026-07-29 09:5x (verbatim in session); #274 completed
  report.
