<!-- RULE (user, 2026-08-03): this file keeps AT MOST 5 resume anchors.
When writing a new anchor, DELETE the oldest kept anchor and add its heading
line to the Condensed history below. Durable lessons never live here — they
go to project.conductor.md (families) and the skills; this file is the
CURRENT STATE pointer only. Git is the archive for every pruned anchor. -->

# RESUME ANCHOR 90 — 2026-08-14 16:45 EDT — IV-HARNESS COMPLETE THROUGH #562; GOAL DONE; TEN LANDINGS TODAY

CRONS DISARMED BY USER 2026-08-14 18:36 (the :37 sweep had already
expired from the list). fleet-watch Monitor bb2l40462 STAYS armed
(event watcher, not a cron). Re-arm lines below when asked. Fleet IDLE. main clean at 3a9ec712.

TODAY'S TEN LANDINGS (all conductor self-do, serial gates):
#553 M1 process graph (9c151355) · conventions ext (d11d8f01) ·
fixture range (f6d4578a) · #555 M2 warm server (a1111764) · #557
did-you-mean (050eebdf) · #556 M3 reports+drift+staleness (fe4d59fd) ·
#560 compat fix (376a86cf) · #561 bounded output (49ed5e62) · #559
verb contract rung 1 (7558931a) · #558 describe shapes (3b7180be) ·
#562 contributor seam (ec7b2a13).

IV-HARNESS NOW: graph (tasks/gates/lanes/fleet/metrics/drift/verbs/
events) · warm server + waitFor + stale-warning · bounded printing ·
did-you-mean · run channel + event ledger (.invar/harness-events.jsonl,
gitignored) · describe (shapes.generated.json, no-drift test — FIRED
cross-branch at 562's merge, proving itself) · contributor seam
(.invar/harness/*.harness.ts, contract v1, skew/collision/breakage
loud + non-fatal). All modules ratcheted; ~54 iv-harness tests.

RECORDED: "The app runs where the files are" (07225a04) — streaming
PTY is the remote shape; host-based-Invar-with-remote-fs REJECTED,
revisit trigger = felt typing latency -> predictive echo.

OPEN FLAKES: #563 bracket-match (NEW, first sighting, solo-green) ·
#554 markdown CJK · #549 diff-overview (4 sightings) · #545 · #552 ·
census #551. #544 #548 filed. LESSON QUEUE for next sweep: scripted
edits must assert (556's false switch claim, summary-556); git add -A
never in user checkout (in conductor md).

ALSO LANDED POST-ANCHOR: #564 describe (9dc13a81) — references +
--depth mini-dts + VERBATIM TS with doc comments (four gate rounds;
born-red cycle test exposed behind tail-cropped output — lesson in
conductor md). FILED #565 conductor action verbs + NIGHT DIGEST
(fight log, time accounting, claim-vs-evidence — user insight: track
the conductor so the night is legible by query) — BUILD NEXT, self-do.
#563 bracket-match flake filed; #549 at 5 sightings (priority).

LANDED: #565 (ad84a7ef) conductor action verbs + night digest —
commit/test/gate guarded+ledgered, land.sh tip guard (driven both
arms), digest node (fights/time/gates). First ledgered action on main:
action.test 71 pass. Observer access ruling: attach warm + waitFor,
re-derive from disk always; memoize-behind-version-signals is the
reserved upgrade, profile-gated.

NEXT (user-queued): the TWO-AXIS NAVIGATION discussion (top bar =
projects, left rail = worktrees fed by lanes.fleet) — drive current
tab surfaces + mock per ui-task protocol BEFORE any brief. #559 rung 2
(land face) and M2-watch-mode extras unfiled.

WATCHER RE-ARM LINES (verbatim):
  Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)
  CronCreate 7 * * * * + 37 * * * * — prompts verbatim in conductor SKILL.md

# RESUME ANCHOR 89 — 2026-08-14 14:00 EDT — M2 WARM SERVER LANDED (a1111764); AWAITING USER M2 REVIEW, THEN M3

Crons armed (:07 e0b76439, :37 db522e11). fleet-watch Monitor bkhy5pn2s armed.
Fleet IDLE. main clean at a1111764 (post-landing).

TODAY'S THREE LANDINGS (all conductor self-do, user-directed):
- #553 M1 (9c151355): iv-harness process graph — see anchor 88.
- conventions extension (d11d8f01) + fixture range fix (f6d4578a).
- #555 M2 (a1111764): WARM GRAPH SERVER — `bun iv-harness/cli.ts
  --serve` boots once per checkout (fs-watchers bump per-domain version
  signals; parked waitFor conditions evaluate on watcher events); unix
  socket + checkout-keyed rendezvous (DriveSession convention);
  get/ls/waitFor auto-attach, cold fallback identical; --stop verified
  both-arms; server is a DISPOSABLE projection cache (new contract
  record, tested). DRIVING CAUGHT the GET-stop bug tests missed (CLI
  sent GET to POST route, reported success unverified) — fixed + wire
  test. 24 colocated tests, gate GREEN first run.

ALSO LANDED: #557 (050eebdf) — graph misses suggest the intended key
(get tasks.count -> Did you mean 'tasks.counts'?). Shapes/describe
projection discussed: file as #558 AFTER M3 (user discussing, not yet
filed). TS-over-bash conviction confirmed with user; M3 absorption
order (tasks-status vs probe vs land first) is a user call at M2 review.

NEXT (user's explicit sequence): USER REVIEWS M2, then M3 (#556, in
draft/): script absorption per the wrap-ladder + structured TaskReport
graph nodes. Do NOT start M3 before the user's M2 review verdict.

OPEN: flake holds #554 #549 #545 #552; census #551; #544 #548 filed.
Backlog user-priority; no autonomous dispatch.

WATCHER RE-ARM LINES (verbatim):
  Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)
  CronCreate 7 * * * * + 37 * * * * — prompts verbatim in conductor SKILL.md

# RESUME ANCHOR 88 — 2026-08-14 13:29 EDT — IV-HARNESS BORN AND LANDED; SESSION SPANS REBOOT; CONTEXT DEEP

Crons armed (:07 e0b76439, :37 db522e11 — session-only, re-arm on restart).
fleet-watch Monitor bkhy5pn2s armed (re-armed after Aug-14 reboot wiped /tmp).
Fleet IDLE. main clean at f6d4578a.

THE DAY: user shared the Invariant Engineering paper
(/media/psf/dev/ibr/IBR/Invariant Engineering/ — Mac-host checkout, NOT
~/dev/ibr). Its gap diagnosis (no Observer; steering not recorded as data)
led to #553: iv-harness — the development-process graph. FILED, BUILT
(conductor self-do, user order), LANDED 9c151355 in 17m.

IV-HARNESS (the new thing): iv-harness/ at repo root, own app, own module
tree (src/modules/{tasks,gates,lanes,fleet,graph}), ivue grammar, CLI:
`bun iv-harness/cli.ts get tasks.counts | gates.last | lanes.dirty |
fleet.heartbeat` — projection of disk, never a store. Contract:
iv-harness/iv-harness.invariants.md (one-way arrow to app,
disk-is-the-store, wrap-never-duplicate). In the conventions gate since
d11d8f01 (grammar walks it namespaced 'iv-harness/<mod>', all 5 modules
ratcheted at birth; 15 colocated tests). Fixture numbers 990xxx
(f6d4578a) so they never collide with real tasks. M2 (fs-watch reactive)
and M3 (script absorption) are FUTURE tasks, not yet filed.

GATE RULE CHANGE (user-adopted): GATE SERIALLY BY DEFAULT — in skill +
live :07 cron. Landing #553 used the narrow red rule: r1 red = markdown
CJK (filed #554, first sighting), r2 red = diff-overview (pre-existing
#549, third sighting appended); both solo-green both arms.

OPEN: #554 + #549 + #545 + #552 flake holds; #551 race census; #544,
#548 filed unstarted. Backlog user-priority — no autonomous dispatch.
LESSON THIS SESSION (in conductor md): git add -A NEVER in the user's
checkout (swept Aug-12 screenshot files into 5b9fb9ec under a tasks-only
message — benign content, wrong scope).

WATCHER RE-ARM LINES (verbatim):
  Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)
  CronCreate 7 * * * * + 37 * * * * — prompts verbatim in conductor SKILL.md

# RESUME ANCHOR 87 — 2026-08-11 17:08 EDT — 18 LANDED; DETERMINISTIC-RED-IN-CONTENTION-TIER FOUND; HOLDING (context deep)

Crons armed (:07, :37). fleet-watch blc4t5ql6 armed. Fleet IDLE, clean.

THE FIND (#550, 0a3e97d0): the "scrollbars contention flake" was a
DETERMINISTIC red on main (3/3 solo timeout), hiding in the NON-BLOCKING
contention tier so every gate "passed" while a scrollbar behavior went
untested. Root cause (by driving): a Quick-Open-Enter race — typed a
fixture name and pressed Enter before the ranked result was ready. Same
class as #354's move-line. Fixed via the shared openFileThroughQuickOpen
helper; conductor-verified 3/3-timeout -> 2/2-pass solo.

TWO FOLLOW-UPS FILED: #551 (Quick-Open-Enter race CENSUS — the class hit
#354 and #550; sweep the suite, route every site through the helper;
ALSO proposes a periodic solo-run guard so a deterministic red cannot
hide in the contention tier again), #552 (the NEXT scrollbars wait
"100000-line fixture paints its target line" exposed once #550 unblocked
progress — contention-only, 1 sighting).

SESSION LESSON (the through-line #522 -> #354 -> #550, all in
project.conductor.md): a red I cannot explain is a HYPOTHESIS to test —
solo re-run + merge-base + driving — never a "flake" to wave through.
"Contention" is the answer reached for when one stops looking. The
contention tier's leniency actively HID a real bug for days.

OTHER OPEN FLAKE HOLDS: #545 (structure scrollbar diag), #549
(diff-overview). Filed unstarted: #544 #548. Remaining backlog
user-priority. HOLDING autonomous dispatch — 18 landed, context deep;
next careful call better made fresh. Loops catch anything inbound.

# RESUME ANCHOR 86 — 2026-08-11 16:06 EDT — #547 LANDED (REAL PRODUCT BUG); 17 THIS SESSION; HOLDING

Crons armed (:07, :37). fleet-watch blc4t5ql6 armed. Fleet IDLE, clean.

LANDED SINCE 85: #547 22f06fd9 — the popup-wheel "flake" was a REAL
PRODUCT BUG: OpenTUI silently drops render requests in feed-busy /
overlapping-async states; a wheel impulse parked unpainted until the next
input. Fix: render-delivery watchdog in Bootstrap (re-request until a
completed frame answers; disarms at rest). Two records refined (render
loop never wedges; wheel impulses start their own frame sequence).
dist/iv rebuilt. The flake-census strategy converted a 4-branch gate
flake into a user-facing fix. SESSION TOTAL: 17.

OPEN — smoke-scrollbars-harness RECURRING: it fired contention on #354
r3/r5 and #547 gates AFTER #531 landed a fix for that same smoke today.
A landed fix + same smoke re-flaking = a DIFFERENT wait or a reopened
concern — needs its OWN task (#529 three-clocks method), NOT a quick
dispatch. Noted on #545's file. This is the next flake to investigate.

OTHER FLAKE HOLDS: #545 (structure scrollbar diagnostic, 2), #549
(diff-overview, 1). Filed unstarted: #544 (observation predicate
distillation), #548 (land refuses committed priming files).

CONDUCTOR CONTEXT is very large after a long session — held further
autonomous builder spawns rather than drop attention quality. Remaining
backlog user-priority; no user-decision items pending.


## Condensed history (pruned anchors — full text in git)

- # RESUME ANCHOR 85 — 2026-08-11 15:08 EDT — #354 + #526 LANDED; FLEET IDLE; 16 LANDED THIS SESSION
- # RESUME ANCHOR 84 — 2026-08-11 14:09 EDT — QUEUE-DRAIN WAVES DONE (14 LANDED THIS SESSION); FLEET IDLE
- # RESUME ANCHOR 83 — 2026-08-11 11:34 EDT — QUEUE RUNNING: 3 LANES; CRONS RE-ARMED BY USER
- # RESUME ANCHOR 82 — 2026-08-11 09:13 EDT — #539 + #531 LANDED; ALL KNOWN GATE FLAKES CLOSED; IDLE
- # RESUME ANCHOR 81 — 2026-08-11 08:37 EDT — #539 DISPATCHED; DOCS SPRINT DONE; GAUGE SUSPECT
- # RESUME ANCHOR 80 — 2026-08-07 17:45 EDT — LOOPS DISARMED BY USER
- # RESUME ANCHOR 79 — 2026-08-06 21:10 EDT — #530 LANDED; DAY CLOSED; FLEET IDLE
- # RESUME ANCHOR 78 — 2026-08-06 19:49 EDT — #538 LANDED; FLEET IDLE; AWAITING USER
- # RESUME ANCHOR 77 — 2026-08-06 17:23 EDT — FIND/REPLACE COMPLETE: ALL SIX MILESTONES LANDED
- # RESUME ANCHOR 76 — 2026-08-06 14:25 EDT — SEARCH VISIBLE (M4 LANDED); M5 DISPATCHED
- # RESUME ANCHOR 75 — 2026-08-06 11:08 EDT — MORNING CORRECTIONS LANDED; MILESTONE CONVEYOR RUNNING
- # RESUME ANCHOR 74 — 2026-08-06 07:21 EDT — NINE LANDED; GATE FLAKE KILLED; IDLE FOR MORNING
- # RESUME ANCHOR 73 — 2026-08-06 ~05:35 EDT — EIGHT LANDED; USER-DIRECTED BACKLOG DRAINED; HOLDING FOR MORNING
- # RESUME ANCHOR 72 — 2026-08-06 ~04:55 EDT — #504 LANDED (STANDING RED CLOSED); #505 DISPATCHED
- # RESUME ANCHOR 71 — 2026-08-06 ~04:35 EDT — #521 LANDED; MILESTONE 1 DONE; QUEUE: 504/505
- # RESUME ANCHOR 70 — 2026-08-06 ~03:25 EDT — ALL FIVE LANDED; #521 DISPATCHED
- # RESUME ANCHOR 69 — 2026-08-06 ~03:20 EDT — FOUR OF FIVE LANDED; GATE-518 LIVE
- # RESUME ANCHOR 68 — 2026-08-06 ~02:15 EDT — 513+515 LANDED; 514 IN ROUND 2; GATES HELD
- # RESUME ANCHOR 67 — 2026-08-06 01:53 EDT — GATE-513 RED DIAGNOSED AND FIXED; RERUN LIVE
- # RESUME ANCHOR 66 — 2026-08-06 ~00:45 EDT — FINAL PRE-COMPACT CHECKPOINT; NIGHT SEQUENCE RUNNING
- # RESUME ANCHOR 65 — 2026-08-05 ~23:40 EDT — NIGHT GOAL 2: LAND ALL, THEN THE FIND/REPLACE WAVE
- # RESUME ANCHOR 64 — 2026-08-05 ~20:50 EDT — CHECKPOINT 85%: LAND 509, THEN 510+511
- # RESUME ANCHOR 63 — 2026-08-05 ~19:55 EDT — CHECKPOINT AT 82%: 506 GATING, 508 AWAITS REVIEW
- RESUME ANCHOR 62 — 2026-08-04 ~04:25 EDT — THE NIGHT GOAL IS MET
- RESUME ANCHOR 60 — 2026-08-04 ~01:45 EDT — TASKS ARE TERMINALS; PRIMING IS MECHANICAL
- RESUME ANCHOR 59 — 2026-08-04 ~00:10 EDT — BUG NIGHT CLOSED; FLEET AT ZERO
- RESUME ANCHOR 58b — 2026-08-03 ~23:10 EDT — WAVE COMPLETE + RECORDS WRITTEN + #501 LANDED
- RESUME ANCHOR 58 — 2026-08-03 ~19:25 EDT — DECOUPLING WAVE COMPLETE
- RESUME ANCHOR 57 — 2026-08-03 ~14:05 EDT — GOAL: DECOUPLING WAVE, FULLY LANDED
- RESUME ANCHOR 56 — 2026-08-03 ~11:10 EDT — LAND #485, THEN PRESENT THE NUMBER
- RESUME ANCHOR 55 — 2026-08-03 ~10:45 EDT — #485 MEASUREMENT IN FLIGHT
- RESUME ANCHOR 54 — 2026-08-03 ~10:20 EDT — FIFTEEN LANDINGS; FLEET AT ZERO
- RESUME ANCHOR 53 — 2026-08-03 ~09:35 EDT — GOAL MET; 484 EXPERIMENT IN FLIGHT
- RESUME ANCHOR 50c — 2026-08-03 ~08:15 EDT — COPY: TRANSPORT PROVEN INNOCENT
- RESUME ANCHOR 50b — 2026-08-03 ~08:00 EDT — LIVE COPY INVESTIGATION OPEN
- RESUME ANCHOR 50 — 2026-08-03 ~06:25 EDT — TWELVE LANDINGS; FLEET AT ZERO
- RESUME ANCHOR 49 — 2026-08-03 ~06:15 EDT — ELEVEN LANDINGS; THE NIGHT IS DONE
- RESUME ANCHOR 48b — 2026-08-03 ~05:30 EDT — ONE LANDING IN FLIGHT
- RESUME ANCHOR 48 — 2026-08-03 ~05:15 EDT — THE FULL NIGHT IS LANDED
- RESUME ANCHOR 47 — 2026-08-03 ~04:30 EDT — OVERNIGHT WAVE 2 LANDED
- RESUME ANCHOR 46 — 2026-08-03 ~03:00 EDT — THE OVERNIGHT GOAL IS MET
- RESUME ANCHOR 45 — 2026-08-03 ~00:55 EDT — START HERE
- RESUME ANCHOR 44 — 2026-08-02 ~19:53 EDT — START HERE
- RESUME ANCHOR 43 — 2026-08-02 ~19:10 EDT — START HERE, DO #469 DIRECTLY
- RESUME ANCHOR 38 — 2026-08-02 ~15:00 EDT (98% gauge)
- RESUME ANCHOR 37 — 2026-08-02 ~14:30 EDT (95% gauge)
- RESUME ANCHOR 36 — 2026-08-02 ~14:10 EDT (90% gauge)
- RESUME ANCHOR 35 — 2026-08-02 ~13:45 EDT (85% gauge, CHECKPOINT)
- RESUME ANCHOR 34 — 2026-08-02 ~13:15 EDT (81% gauge)
- RESUME ANCHOR 33 — 2026-08-01 ~20:30 EDT (100% gauge)
- RESUME ANCHOR 32 — 2026-08-01 ~19:15 EDT (97% gauge)
- RESUME ANCHOR 51 — 2026-08-03 ~08:20 EDT — #482 IN FLIGHT; USER PRESENT
- RESUME ANCHOR 52 — 2026-08-03 ~09:10 EDT — 483 IN FLIGHT, 484 STAGED

