# READY — 555 iv-harness warm graph server (M2)

## In plain words

The graph now boots once per checkout and stays warm: it watches the
task folders, gate logs, and heartbeat, and every agent or observer
taps the same process over a local socket. You can now WAIT for a
condition ("tell me when a gate goes green") instead of polling. If
the server dies, nothing is lost — queries fall back to reading the
files directly.

## Delivered

- server module (iv-harness/src/modules/server/): fs-watchers bump
  per-domain version signals; parked waitFor conditions evaluate on
  watcher events via the instance's own $watch scope; unix socket +
  checkout-keyed rendezvous manifest (DriveSession convention);
  refuses a second server per rendezvous; disposable by contract.
- CLI: --serve / --stop (verified stop: POST + manifest-gone check) /
  --server-status / waitFor <path> <json> [--timeout MS]; get/ls
  auto-attach, cold fallback identical answers.
- New contract record "A graph server is a disposable cache" (checker
  PASS, 5 records); grammar ratchet includes iv-harness/server;
  colocated tests now 24 across 6 files.

## Invariants in scope (answered)

- The harness graph never imports from the app: upheld (grep clean).
- Disk is the store and the graph is a projection: upheld and
  STRENGTHENED — the server carries the projection discipline into
  watch mode (bump-only watchers, per-request re-derive).
- A wrapped script keeps its logic in one place: upheld (server reads
  the same GATE_EXIT sentinel and heartbeat mtime; no guard duplicated).
- Only the files arbitrate process state: upheld (disposable-cache test
  kills the server and proves cold answers survive).
- NEW: A graph server is a disposable cache — recorded, annotated,
  tested.

## Verification

- 24/24 colocated tests (parked-wait-resolves-on-fs-event is the
  load-bearing one; timeout arm proves waits can fail; wire-stop test
  proves GET cannot stop and POST does).
- End-to-end drive on the real worktree: serve -> status (155
  watchers) -> attached get 48ms -> waitFor tasks.counts.draft 2
  parked (parkedWaits: 1 observed) -> satisfied by planting a real
  folder mid-wait -> stop verified -> serve process exited 0 -> cold
  query still answers.
- DRIVING CAUGHT A REAL BUG the tests missed: --stop sent GET to the
  POST-only route, got 404, and reported success without verifying
  (a check that could only fail toward pass). Fixed: POST + both-arms
  stop verification + exitProcessOnStop; wire test added. The first
  drive also leaked the serve process — same fix.
- Gate: GREEN first run (GATE_EXIT=0, /tmp/gate-555.log).

## Bycatch

None observed beyond the in-task stop bug (fixed in-branch before
landing, with its regression test).

## Instrument feedback

EASY: the M1 graph made the server a thin layer; ivue $watch scope fit
the parked-wait evaluation exactly. MISSING (M3 material): structured
TaskReport nodes; dispatch/land wrapping per the ladder.
