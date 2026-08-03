# Task 472 — one warm app serves the harness

Priority: user-directed
State: ACTIVE — case 1 being built inline by the conductor (user: "build case 1 right now")
Engine: claude
Environment: any
Model: fable-5
Effort: high

## Ordering

PRECEDES #471 (graph completeness), which precedes #470 (wait migration).
Queue: 472 -> 471 -> 470. Rationale: the drive server makes every subsequent
sighting and probe faster and cheaper, and the boot-count reduction lowers the
contention floor that all later verification runs under.

## The user's direction (2026-08-02)

Every probe and smoke boots a fresh `iv`; the gate boots hundreds of apps and
gates conflict. Reuse one started app: drive it, reset to base state between
uses. Three cases, agreed in discussion:

1. **Interactive probing (BUILD NOW):** a drive server — one persistent app in
   a PTY owned by a long-lived driver process; `--attach` sends snippets to
   the SAME session. Input stays real PTY bytes; the graph channel already
   works cross-process. No reset needed for interactive use.
2. **Within a smoke file:** one app per FILE, scenarios share it with a
   VERIFIED reset between (base-state fingerprint through the graph; mismatch
   -> recycle to fresh boot). Isolation between files preserved. Most of the
   boot-count win.
3. **One app across the whole gate: REJECTED.** Reset would be a second
   implementation of boot whose gaps become an order-dependent flake class
   (the mktemp-HOME scar exists for exactly this), and a singleton serializes
   a currently 6-way-parallel suite.

## Measurement (fill in before case 2 is scoped)

- Boot time, spawn -> first status ready: MEASURED <pending>
- Static count of PtyTestDriver constructions across smokes: <pending>
- Estimated boot share of gate wall-clock: <pending>

## Verification

Case 1 both arms: an attached snippet sees state created by the previous
attach (shared session proven) AND a snippet error is reported in the
response without killing the server (the next attach still works). Attach
latency vs boot latency measured and reported.
