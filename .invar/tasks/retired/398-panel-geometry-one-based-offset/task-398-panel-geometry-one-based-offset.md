# #398 — panelSeparatorGeometry publishes columns one higher than the grid

State: RETIRED — root already fixed on main by the #346 row rewrite; evidence: #387 round-4 grab probe (GRAB run starts at published left, negative controls both ends). Edge-close intermittent stays observable via #214.
Priority: verification-integrity
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Origin — #387 bycatch 4 (root) + 6 (symptom), measured

RootView.ts lines near 2246-2274 add a literal +1 to published separator
geometry columns; the emulator grid and PTY mouse are zero-based. Measured:
published strip left=44 width=18, actual grabbing columns 43-60. Every
3-cell control absorbs the offset, so it stayed invisible — until an
edge-anchored 1-cell target: the panel list CLOSE control at
list.left+width-1 misses intermittently (2 of 4 base runs — the #214-class
"Terminal 2 / Agent 2 list close" timeout is CONSISTENT with this root).

Fix at the publisher (drop the +1, publish zero-based), then sweep every
smoke that clicks published geometry — they shift together. Re-measure the
#214/#359 flake family afterward; this may close a chunk of it.
