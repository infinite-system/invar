# #391 — splitter size writes and bounds stay coherent

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Origin — two #383 bycatch items at the same seam (read, not driven)

1. STRESSED RECORD: "A reported size never leaves its configured bounds"
   says all size writes route through clamp. Two host paths in
   SplitterElement.ts write the ref directly: `set size(size)` and the
   `onMouseDown` seed (`this.model.size.value = currentSize`). With a
   persisted right-dock width 33 on an 80-column terminal the model reports
   an out-of-bounds 33 until the first dragTo. Paint stays clamped by the
   layout, so no wrong geometry reaches the screen — the model's REPORT is
   what leaks.
2. Right-dock splitter keeps `minimumSize: 16` while its maximum is now
   live; at 64 columns the maximum is 12 and clamp lets the lower bound win,
   so the divider reports 16 for a dock painted 12.

Fix both at the seam: route host writes through clamp, and make the minimum
coherent with a live maximum (function or derived). Re-verify the stressed
record and refine its wording if the mechanism moves.
