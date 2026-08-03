# Task 472 — one warm app serves the harness

Priority: user-directed
State: ACTIVE — case 1 SHIPPED (see Delivered below); case 2 deprioritized by measurement
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

- Boot time, spawn -> first status ready: MEASURED 247ms median (5 samples:
  289, 274, 247, 246, 246). The conductor's prior 2-3s guess was wrong by 10x.
- Static count of PtyTestDriver constructions across smokes: 119 sites in 72
  files (runtime boots higher: loops and per-geometry reruns).
- Estimated boot share of gate wall-clock: ~5% (200 boots x 0.25s / 6 workers
  over a ~150s gate). CONCLUSION: boots are NOT the gate's contention driver;
  case 2's payoff is small and it is DEPRIORITIZED. The gate's cost is the
  drive work itself. Case 1 (interactive drive server) keeps its full value:
  the per-sighting cost is the whole run cycle plus RE-NAVIGATION, and a warm
  session eliminates both.

## Verification

Case 1 both arms: an attached snippet sees state created by the previous
attach (shared session proven) AND a snippet error is reported in the
response without killing the server (the next attach still works). Attach
latency vs boot latency measured and reported.

## Delivered — case 1 (2026-08-02)

`DriveSession.ts` grew a warm-app server:

- `--serve [--open DIR] [--home DIR] [--server-dir DIR]` — boots ONCE, writes
  a manifest (pid + statusPath) to the rendezvous dir, then executes attached
  snippets against the same live session forever. A snippet error answers
  loudly, abandons the queued steps it left behind, and the server keeps
  serving.
- `--attach CODE` / `--attach-script FILE` / `--stop` — run a snippet against
  the RUNNING session from any process; dead-pid manifests are detected and
  named. File protocol: write-temp+rename request/response, time-monotone ids,
  one attach at a time.

Verified, both arms: attach 1 opened the panel (142ms); attach 2 saw that
state alive in the same session (80ms); a bad snippet answered with the loud
graph miss and REAL exit 1 (read unpiped — the tail-exit trap struck a fourth
time and was caught); attach 4 proved the server survived. A cold `--eval`
control took 377ms AND had lost the navigated state ("cold false") — the
re-navigation saving is the real product, the milliseconds are the bonus.
`--stop` removes the manifest and the process.
