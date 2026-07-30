# Summary #380 — idle CPU from dashboard motion

Landed 5a1a52a7 (branch commit 8d860007), 30m dispatch-to-landing.

What happened: the tasks dashboard kept a 30 Hz motion timer alive for any
building row anywhere in the model, painted or not. Off-screen 103-row case:
33.17% CPU, zero frames emitted. Fix scopes motion to the painted row window,
re-checks visibility inside timer callbacks, resyncs on scroll/viewport, and
advances one visual step per callback (removed 4/5 redundant render requests).

What the report refuted: the user's older --smol binary showed no CPU drop
with the pane CLOSED; current source's closed-pane arm was already quiet
before the fix. So the user's exact observation was partly from an older
binary state — the off-screen generator was the live defect in current source.

Left undone: nothing in scope. Bycatch was three known flakes (#362, #214,
voice-picker one-off) — no conversions.
