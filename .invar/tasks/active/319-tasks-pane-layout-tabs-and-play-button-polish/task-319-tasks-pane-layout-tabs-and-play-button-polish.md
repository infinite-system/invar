# 319 — tasks pane: live-item two-line layout, play button tooltip/toggle, tab highlight + active state, one-line items, capitalized sections

State: active
Engine: codex
Effort: medium
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> live tasks should put 'building' and the rest of line in the next
> line, make it closer to how tasks:watch looks, also play btn should
> have tooltip and be able to turn off, also tabs live, active, done
> should highlight and maybe highlight 1 key from right and left of it
> too for background padding, and set an active state too so you see
> what's selected, also completed, and active all items should be on 1
> line only and the section capitalized

## Arms (each both polarities)

1. **Live items two-line**: a LIVE task row wraps — title line, then
   'building' + the rest of the status on the NEXT line; visual target
   is the tasks:watch terminal layout (quote tasks:watch output in the
   report and mirror its shape).
2. **Play button**: gets a tooltip (follow the existing tooltip seam if
   one exists — census it; if none exists, that's a seam finding to
   report before building one) and a way to TURN IT OFF (decide from
   context: toggle-off = stop/disable the run action; record the chosen
   semantic and make it discoverable).
3. **Tabs (Live / Active / Done)**: hover/selection highlight extends 1
   cell left and right of the label as background padding; a persistent
   ACTIVE state marks the selected tab so the current filter is always
   visible (theme-derived tones, no literals).
4. **Completed + Active item rows**: exactly ONE line per item — no
   wrapping (truncate with the shared truncation treatment).
5. **Section headers capitalized.**

## Acceptance

PTY frames: live row two-line matching tasks:watch shape; tooltip
appears on play hover/focus and the off-state works; selected tab
padded highlight + active marker across theme switch; completed/active
rows single-line at narrow widths; capitalized headers; both scales.
