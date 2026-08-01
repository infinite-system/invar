# Overnight briefing — started 2026-07-29 00:28

## RESUME ANCHOR 21 — 2026-07-31 ~02:0x (written at the 86% CHECKPOINT; supersedes anchor 20)

### OPERATIVE STATE

RESUME ANCHOR 28 (2026-08-01 ~14:2x EDT — CHECKPOINT at 84%; supersedes 27. ACTIVE ui-task session, user present)

STATE (all verified on disk at write time):
- LANDED TODAY: #433 (7a33c34b — dashboard smoke isolated from host fleet state via
  INVAR_FLEET_GATE_REGISTRY; my filed diagnosis refuted twice, summary honest) and
  #435 (69886b7e — folderOpen tasks once per root; issues are notice panes; green
  gate 82 OK). Summaries written. Session archives repaired (link by COMMIT grep).
- #439 READ (delta 14:3x): builder REFUTED my list-auto-close and inert-close
  findings — my probe's toggle click on an already-pinned list caused both
  (pre-satisfied gesture; lesson in conductor family 1). Real cascade cause:
  folderOpen launch BEFORE panel restore; fixed by ordering. Bycatch converted:
  #440 (panelListGeometry left:-24 impossible coords), #441 (contentIds/labels
  pairing drift). REMAINING for landing: micro-round to apply the confirmed
  displaced-builtins contract wording (report section Invariants), then merge
  main -> gate -> land. Report (formerly UNREAD): .invar/tasks/in-progress/439-notice-persistence-
  restored-state-defects/report-439-*.md. Task: notices persisted as terminals,
  restored-state list auto-close (~1.5s), close-control unreliability, Displaced
  suppression when config redeclares the label (user-approved), user cascade
  (close Displaced -> neighbors die + Database takeover; conductor could NOT
  reproduce in 4 attempts). NEXT: read report, convert bycatch, merge main into
  fleet/439-..., gate combined tree (register log in /tmp/fleet-watch-gates),
  land on read GATE_EXIT=0. Landing over red allowed ONLY for the #436
  pre-existing step (tasks:watch partial frame under load; baseline proof
  /tmp/gate-main-baseline-1785582277.log).
- UI BATCH (ui-task loop, ACCUMULATE stage — user is actively adding items, do
  NOT dispatch without their conclusion). Confirmed items with driven cell
  evidence, all panel/editor chrome:
  1. Vertical-splitter crossings on the bottom-panel splitter row keep the
     vertical splitter bg 1447454 instead of row bg 1710886 — cols 37 (sidebar
     seam) and 91 (right-dock seam, Ctrl+Alt+b opens dock). ONE generator.
  2. Splitter left gap: first cell becomes a SPACE carrying row bg 1710886,
     line starts one cell later (user design, merged with the old item 1).
  3. Instances toggle padding: one space between the tab-row ☰ (col 118) and
     the right border │ (col 119 is REAL border, not artifact — user corrected
     me); the space joins the toggle hit area.
  4. Editor bottom-border dashes left of the wrap/goto/bottom button trio
     (row 21 cols 38-39) paint fg 1052692 instead of border tone 8037111.
  Withdrawn: scroll-anchoring item (already works), close-fallback-to-Database
  (rides #439), right-edge stray-bar artifact (was the real border).
- QUEUE: #434 (dead no-registry gate render branch), #436 (tasks:watch partial
  frame under load, four-log A/B evidence in task file), #437 (gesture mechanics
  to shared driver layer), #438 (Engine: user — hook-gate policy in builder
  worktrees, recommend auto-skip in .invar/worktrees/*).
- DRIVE UPGRADES THIS SESSION (all landed on main): --home (persistent home;
  stale status.json cleared on reuse — the #435 builder caught my bug), --env
  KEY=VALUE, --type TEXT (literal characters). AGENTS.md now requires gesture
  mechanics in the SHARED driver layer, CLI table only binds (commit this
  morning). Realized 9-terminals mystery SOLVED: legacy pile persisted in
  ~/.config/invar/settings.json; user cleared it; #439 sanitizes.
- Probes: tmp/probe-close-displaced-notice.ts (copy shipped into #439 folder as
  probe-439-...; PROBE_COPY_REAL_SETTINGS=1 copies user settings READ-ONLY).
- LAWS DELTA today: AGENTS.md gesture-two-layer rule; land.sh needs GATE_LOG
  with read GATE_EXIT or written GATE_OVERRIDE + BYCATCH_TRIAGED=1; archive-
  session repair = write rollout path into tmp/transcripts/session-link-<slug>.txt.
- WATCHER RE-ARM (verbatim): Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)
  Crons remain DISARMED by user order — never re-arm without their word.
- Gate discipline reminder: builder READY-idle counts as live in probe.sh; take
  the written exception or steer a hold. My own PTY drives count as load too.


RESUME ANCHOR 27 (2026-08-01 ~06:2x local — pre-compaction refresh; supersedes 26. ACTIVE ui-task session, user present)

STATE: user ACTIVE and directing UI work. Crons DISARMED (user order; never re-arm without their word).
fleet-watch Monitor armed. Re-arm on restart: Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true) — nothing else.

IMMEDIATE NEXT ACTIONS (in order):
1. #433 auto-reveal: READY report just landed at
   .invar/tasks/in-progress/433-tasks-dashboard-auto-reveal-priced-out/report-433-*.md — READ it,
   convert bycatch, merge main forward, gate combined tree (background, log registered in
   /tmp/fleet-watch-gates), land via scripts/fleet/land.sh (needs GATE_LOG with GATE_EXIT=0 read
   from log, BYCATCH_TRIAGED=1, merge-message file). Feed said: activation-seed fix, positive
   control proven, full dashboard smoke green INCLUDING the 500-task step (the #432 override
   debt clears with this landing).
2. LIVE ui-task investigation (user's newest report, NOT yet confirmed): "closing terminals in
   a right pane shows Database in Terminals plugin; sometimes deleting 1 terminal deletes its
   split neighbors and shows Database content". Probe in progress:
   tmp/probe-close-terminal-database-leak.ts — got as far as: panel open, instances list opens
   via status panelSeparatorGeometry.instancesToggle (click startColumn+1 at tabRow), + Terminal
   dropdown adds 'Terminal 2' INSTANCE (not a split; panelCellColumns stays length 1), toggle
   count paints '☰  2'. STUCK: hover on list row 26 shows 'Split instance' tooltip but click at
   listGeometry.left+width-5 does not produce a 2nd subwindow (panelCellColumns stays 1) — the
   smoke smoke-panel-split-harness.ts lines ~296-360 has the canonical hover/click geometry
   (top+3, width-5 for split, width-2 for close); compare hover row offsets. Then: close left
   subwindow ×, watch status panelSpaceLabels/headings + tabs row for Database leakage.
3. #434 accumulation (do NOT dispatch until user concludes): (1) splitter first cell col37
   bg1447454 vs row 1710886; (2) stray │ at col119 rows 20+23 right edge; (3) instances toggle
   ☰ at col118 with NO trailing space (needs ␣-part-of-button cell); (4) terminal pane scroll
   anchoring + jump-to-bottom; (+ items from the Database-leak investigation once confirmed).

TOOLS SINCE LAST ANCHOR: bun run drive now has --gesture (openPanel/closePanel, waits built in)
and --cells ROW,C1-C2 color dumps (commit dad4ba2c); referenced from AGENTS.md primary loop,
conductor skill verify-by-driving, project.tools.md (own instrument row), project.conventions.md
verification channels, ui-task skill SEE step. agent-feed.ts = monitoring channel.

GOTCHAS (family 14, cost an hour): awaitGridCondition is (label, predicate, timeout) — never
catch-all a wait; cell colors are cell.background/.foreground; splitter row = the one WITH
↗ × controls, row above is editor bottom border with ↵ ↕ ⇊ actions.

QUEUE: #431, import.meta.dir census, teleport-census, 12 held user-directed items.
Checkout = user's; 309+ commits ahead of origin; do not push unasked.

RESUME ANCHOR 26 (2026-08-01 ~06:1x local — CHECKPOINT; supersedes 25. ACTIVE ui-task session)

STATE: user is BACK and directing. Crons remain DISARMED (user order; do not re-arm).
fleet-watch Monitor armed (persistent). Re-arm on restart:
Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true) — NOTHING ELSE.

LANES:
- #432 panel/editor/instances overhaul: LANDED 7d2cc879 (123m, one round). Landed over a
  documented pre-existing red (GATE_OVERRIDE, see below). Summary written. User has NOT yet
  confirmed the new UI in their terminal — their veto is outstanding.
- #433 tasks-dashboard auto-reveal priced out (bisected to 417084fa: PASS at ~1, FAIL at it;
  hidden pane does zero tree reads so auto-reveal-on-READY cannot fire): codex sol/high
  DISPATCHED, in-progress. Attach: tmux attach -t invar/433-tasks-dashboard-auto-reveal-priced-out
  Feed: bun scripts/fleet/agent-feed.ts 433 --follow
- #434 accumulation (NOT filed yet): ui-task session live with the user. Confirmed items so far
  (probe tmp/probe-splitter-edge-bg.ts, 120x40): (1) panel splitter first cell col37 bg 1447454
  vs row bg 1710886 — one-cell off-tone left edge; (2) stray `|` fragment at col 119 rows 20+23
  (right edge line-through artifact); (3) instances toggle at col 118 with NO trailing space,
  col 119 is the stray border — needs its 1-space part-of-button cell. (4) queued: terminal pane
  must hold scroll position when scrolled up + jump-to-bottom affordance (agent-feed follow UX).
  ASK THE USER for more items; dispatch ONLY on their explicit conclusion.

LANDING #432 ACCOUNT (for reference): round-1 gate caught my hotfix annotation without record
(fixed 6f55ecc6); round-2 red = smoke small-fixture phase flip caused by my 68230d8a (fixed by
planting real worktree diff 3825fc27) + pre-existing 417084fa large-fixture red (filed #433);
landed with written GATE_OVERRIDE per the narrow rule. Gate log round-2:
/tmp/gate-432-r2-1785573679.log.

NEW INSTRUMENTS TODAY:
- scripts/fleet/agent-feed.ts <task#> [--follow] — clean monitoring feed from codex rollout
  jsonl (agent/steer/brief/patch lines, noise stripped). Indexed in project.tools.md. Monitoring
  channel; tmux attach is steering only.
- Compiled-binary defect class: import.meta.dir = /$bunfs/root in bun-compiled binaries; fleet
  paths must derive from the workspace (record: tasks-dashboard.invariants.md "Fleet paths
  derive from the workspace, never the bundle"). A census of other import.meta.dir uses in app
  code is UNFILED follow-up.
- ui-task skill + AGENTS.md now carry: gesture driver is the ONE entry point for probes AND
  tests; ratchet migration (new smokes use helpers; old convert when touched/flaky/teleporting);
  driver-caused smoke flips are findings to classify, never flake.

PROBE GOTCHAS (cost an hour tonight): awaitGridCondition is (label, predicate, timeout) — 
passing (predicate, timeout) THROWS, and a .catch() converts that into "condition never
appeared". NEVER catch-all a wait. Cell colors are cell.background/.foreground, NOT
backgroundColor. The panel splitter is the row matching /[-x]{6}/ WITH the arrow controls;
row before it is the editor bottom border with actions.

QUEUE after current: #431 (dead panelAlignment + zombie remainders), 12 held user-directed
items in project.active-tasks.md, import.meta.dir census, teleport-census of old smokes.

USER CHECKOUT: this checkout IS the user's; main at 008d30c3+ (they rebuild with bun run build).
309 commits ahead of origin — push not requested; do not push unasked.

RESUME ANCHOR 25 (2026-08-01 — CHECKPOINT; supersedes 24. STILL PAUSED)

STATE: PAUSED per the user (resting; refinements coming). Crons
remain DISARMED — do not re-arm until the user restarts work.
fleet-watch Monitor stays armed (passive sentinel). No builders, no
in-progress lanes, checkout clean.

SINCE ANCHOR 24: the user authored a NEW SKILL with the conductor —
.claude/skills/ui-task/SKILL.md — read it BEFORE handling any UI
topic. Its core: (1) drive the PTY and SEE before briefing any UI
work; (2) converse with the user over the same driven pixels; (3)
accumulate 10-20 confirmed items into ONE brief per surface; (4)
dispatch only when the user says the brief is concluded; (5) the
driving layer is refined as REAL GESTURES in a DETERMINISTIC
ENVELOPE — helpers named for user actions that travel/hover/click
the visible affordance or press the real chord; never teleporting
command calls; compression only for preamble; the PTY drive API is
the SHARED ENTRY POINT for user, conductor, and builders alike.

ON RESUME: user refinements arrive first and go through the ui-task
loop (see, confirm, accumulate, conclude, brief). Fresh queue: #431.
12 held user-directed items. Anchor 23's rules (family 13, probe
press/release gotcha, steer/gate rules) remain true.

RESUME ANCHOR 24 (2026-07-31 ~18:0x EDT — superseded by 25)

STATE: PAUSED. User (verbatim): "ok, disarm crons, and pause all
tasks for now, gonna go rest, there are refinements coming when i
come back." Both crons DELETED (were :07 orchestration + :37 sweep).
Do NOT re-arm them on resume until the user asks or work restarts.
fleet-watch Monitor left armed (harmless, event-driven, still the
sprawl sentinel). NO builders live; no in-progress lanes; checkout
clean; #430 landed 483725e4 (bottom panel absorbs remainders — the
user's layout thread is closed pending their refinements).

ON RESUME: expect user refinements first — their direction IS the
backlog. Fresh queue: #431 (dead panelAlignment + zombie remainders).
12 held user-directed items in project.active-tasks.md. Everything
else in anchor 23 below still true (family 13, probe gotcha, steer
rules).

RESUME ANCHOR 23 (2026-07-31 ~17:2x EDT — superseded by 24)

LANES: ONE live builder — #430-bottom-panel-absorbs-dock-remainders
(codex sol high, dispatched 14:59, tmux invar/430-bottom-panel-absorbs-dock-remainders).
Brief carries the USER RULING (verbatim in task file): bottom panel
absorbs EVERY dock remainder, all presets, all span combinations —
no blank space. Evidence: conductor probe tmp/probe-430-preset-spans.ts
(mouse kind press/release, NOT down/up). On READY: triage report,
merge main forward, gate (read GATE_EXIT), land serially, convert
bycatch first.

RESOLVED SINCE ANCHOR 22: #428 LANDED (fold-dense == commanded rows;
gate flake class closed). The open #430 question was ANSWERED by the
user (always absorb). ORPHAN RETIRED: the user-rejected early
dispatch had already launched 430-bottom-panel-span-centered-layout
(folder now in retired/, branch tagged retired/, builder killed by
cwd-resolved pid, zero work lost). LESSON: a rejected tool call may
have PARTIALLY EXECUTED — after any mid-call interruption, verify
side effects on disk (family 13).

QUEUE: 12 held user-directed items in project.active-tasks.md.
WATCHERS: fleet-watch Monitor b5j7xg9gf (liveness = heartbeat file,
never TaskList). Crons :07 + :37 live. Restart re-arm: Monitor + two
crons per conductor SKILL.md.

RESUME ANCHOR 22 (2026-07-31 ~16:40 EDT — superseded by 23)

LANES: one builder lane #428 (fold-dense count-based fix) is READY at
commit 068e8aa2; its combined-tree gate is RUNNING (log
tmp/gate-428.log; read GATE_EXIT, land via land.sh with GATE_LOG on 0;
the known flake IS what #428 fixes, so a fold-dense red on the OLD
predicate cannot occur — any red is real). After landing: run
write-active, commit views.

OPEN USER QUESTION (asked, unanswered): #430 bottom-panel span. My own
PTY probe (tmp/probe-430-preset-spans.ts, mouse kind press/release is
required — down/up silently no-ops) proved: in Centered panel both
docks end at row 19 and the freed area becomes primaryDockRemainder +
rightDockRemainder while bottomPanel keeps editor width 54/120.
Default has the same on the right side only. Asked the user: fix
Centered only, or apply dock-yields-to-panel in Default's right side
too? Task #430 folder is DRAFTED IN CONTEXT ONLY (user rejected the
early dispatch — they wanted the probe first; the folder does NOT
exist on disk). On answer: file #430 with the probe table as evidence,
brief per the invariant "a dock that ends at the panel yields its
columns to the panel below".

TODAY'S LANDINGS (all on main): 414,422,412,423,424,425,421,426,388,
395,379,382,391,429,427 — see project.tasks-completed.md. #428 in
flight. User-directed queue: 12 held items remain in
project.active-tasks.md.

WATCHERS: fleet-watch Monitor b5j7xg9gf (liveness = heartbeat file
-mmin -3, NEVER TaskList — family 12). Crons: hourly :07 + sweep :37,
both live this session. Re-arm set after restart: Monitor + both crons
(conductor SKILL.md verbatim).

STEER RULES: steer.sh only (landed-proof in builder's own session
record); relaunch.sh for dead lanes (resume --last / --continue).
Gate rules: read GATE_EXIT from the log, never wrapper exit; serial
landings; overlap-check with merge-base; contract-only landings use
GATE_OVERRIDE with written reason.

DAY CHAIN 2026-07-31 (all landed, fleet idle): #414 354d1527,
#422 ea808dcb, #412 22e667f2 (LSP CPU rows), #423 e92011c0, #424
41715591 (ten condition-wait fixes; gates stopped flaking), #425
db19dec4, #421 b327cc93 (one-commit snapshots), #426 5b761903 (glyph
breach closed). Fresh queue EMPTY; 17 held user-directed tasks await
user review. Watcher truth: fleet-watch liveness = heartbeat file,
NEVER TaskList (family 12). FIELD V2 PROGRAM: COMPLETE (all six landed; see #419 summary). The
goal hook's condition is met. Remaining follow-ups: #421 (scanner
mixed sources), #414, #412, and the held queue. Original goal — make the Invariant Field app look awesome, game-like,
reimagined; 3D version; code lenses with TS/Vue syntax highlighting
(the Field as a door into the implementation); Vue SFC script setup
lang ts; strict project.conventions.md same as the app; timeline
playout. 5 tasks, max 3 builders concurrent, Opus-5-MEDIUM synthesis
capstone. USER: v2 is built on a CLONE (tools/invariant-field-v2/);
v1 (tools/invariant-field/) stays byte-untouched.

THE PIPELINE (task folders + briefs all committed):
- #415 foundation — LANDED c25b135f (v2 clone, Vue SFC + ivue,
  Bun.build+compiler-sfc, tokens seam; v1 untouched, ports 4313/4314).
- #416 design language — LANDED ff82192e (spec+tokens+mockup at
  tools/invariant-field-v2-design/; mockup is the visual north star).
- #417 3D+playout — LANDED 508616e9 (GATE_OVERRIDE: pre-existing main
  terminal-stage red, conductor-verified standalone -> #420).
- #418 code lenses — LANDED 7435c3c8 (shiki TS+Vue lenses, honest
  unresolved states, read-only path-confined span endpoint).
- #419 Opus synthesis — DISPATCHED (claude opus MEDIUM, verified by
  pane: thinking at medium). Brief: coherence pass + simple release
  gate + the instrument's own invariants+lattice + SELF-MEASUREMENT
  (its contract enters the scan -> own dots + own birth in playout) +
  title it the "Invariable representation instrument". Land on green;
  the #420 red is pre-classified for its gate.
- #420 terminal-stage stale expanded result — DISPATCHED (codex sol
  HIGH): DETERMINISTIC main red (was #411 flake, hardened); bisect
  79b325ea..main by driving; fix code never timeout.
- #419 Opus synthesis (claude opus MEDIUM, user explicit) — last;
  integrates all into the "Invariable representation instrument".
  USER ADDITIONS (recorded verbatim in the #419 task file): a simple
  release GATE (tests + driven smoke confirming the formula); the
  instrument's OWN invariant-field.invariants.md + .lattice.md
  (found vs chosen, interactions); SELF-MEASUREMENT — its contract
  enters the scan so the Field shows its own dots and evolution,
  surfaced beautifully.
Wave sequencing: land 415+416 -> write briefs 417+418 from their
reports -> dispatch both -> land -> write 419 brief -> dispatch ->
land. Landing ritual unchanged (extract-gate-verdict.sh, overlap
check, land.sh with GATE_LOG).

LANDED THIS SESSION: #393 idle CPU (79b325ea, painted-priced
dashboard); #413 Invariant Field v1 (df9419cc, 77m — 377 records,
axiom-mapped 11-component rank, ivue UI, calibration by planted rot).
V1 runs: bun tools/invariant-field/server.ts --host=0.0.0.0 (port
4313; --host flag committed; user views from macOS host at
http://10.211.55.7:4313/). A field server may still be running.

FILED: #414 citation-drift pair (#413 bycatch; fixing it moves two
dots inward). #412 monitoring LSP CPU rows (queued). The pre-goal
review-pause was superseded by the user's Field v2 goal.

### MECHANICS HARDENED TODAY (all committed, self-tested)

- steer.sh: landing PROVEN at the builder's own session record
  (rollout/claude store); steers.log records ONLY confirmed landings;
  pending markers -> fleet-watch confirms or raises STEER_LOST (15m).
  Fragment = longest punctuation-free run (em-dash/period defeats
  found live). Composer occupancy = normalized region after last
  prompt + queue-hint. If a steer reports QUEUED mid-turn that is
  normal.
- steer.sh AUTO-RESTORES dead in-progress lanes (relaunch.sh: codex
  resume --last / claude --continue); closed lanes need STEER_REVIVE=1.
  Never hand-relaunch bare (plants @ready/@busy markers land.sh needs).
- relaunch.sh: resume-in-conversation relauncher, meta.json-driven.
- Doctrine for all of this is IN the conductor skill (Liveness section).

### WATCHERS

fleet-watch Monitor: `Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)` — re-arm if TaskList shows none.
Crons: RE-ARMED by user 2026-07-31 ~02:2x ("The 2 crons loaded?") — the pair per the conductor skill: hourly orchestration :07 + reconciliation sweep :37. This supersedes the 740c5d81 disarm. Re-arm both on restart.

### USER CONTEXT

User on macOS host, VM is 10.211.55.7. Codex effort floor HIGH
(dc24997d) for creative work; opus synthesis MEDIUM (explicit). Open
offer (untouched): flip user's ~/.codex/config.toml to medium.
Known open bugs the user mentioned but has NOT yet detailed: "I see
some bugs, but will get back to it soon" — expect reports later.

## NORTH STAR (user, 2026-07-29 12:4x, verbatim intent — long-term direction)

Beyond VS Code parity: **InvarOS** — an AI-powered system that codes WITH
you and runs fleets on ANY codebase: prepare a repo with its own merge
gate + contracts + task ledger, deliver at fleet rate under invariants.
Terminal-native is the moat: tmux/ssh/cron/processes/PTYs are first-class
controllable and monitorable surfaces VS Code's sandbox cannot reach. The
fleet discipline stack (dispatch/land/gate/watch/round-brief/link-lint)
is deliberately PORTABLE — it is the product; the editor is the cockpit.
(Related: the capsule/populate-a-repo skill remains HELD by the user until
architecture refinement — do not start it unprompted.)


## NORTH STAR ADDITION (user, 2026-07-29 ~21:5x, verbatim)

> imagine we create our own internet between Invar instances

Named by the user 2026-07-29 (verbatim): "Indranet Invarnet" — Indra's
net. Follow-on exploration filed as #327 (p2p streaming underlay,
capped transfer allocation, server independence), his words verbatim
in the record.

Conductor reduction (for seam decisions, not yet tasks): presence
(discovery) -> shared state (ledger/records sync across instances) ->
live surfaces (panes projected between instances; panel content-set
machinery is the seam) -> fleet mesh (cross-machine dispatch).
Standing implication: prefer seams that keep panel content sets,
task records, and plugins location-independent.

## SUPERSEDED ANCHORS 1-19 PRUNED 2026-07-30 (user-approved cleanup; git history holds them — anchors 1-7 pruned 2026-07-29 20:3x, anchors 8-19 + overnight sections pruned 2026-07-30)
