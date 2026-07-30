# Overnight briefing — started 2026-07-29 00:28

## RESUME ANCHOR 20 — 2026-07-30 14:06 (written at 77.6% gauge, pre-compaction)

### ANCHOR 20 — delta 4 (2026-07-30 ~19:5x): #393 LANDED — PAUSE IS NOW ACTIVE

#393 landed at 79b325ea (summary in the completed folder: 9 rounds, two
builders, evidence re-attributed mid-task, one refuted red
classification). Fleet is EMPTY. The user's review pause is IN FORCE:
no dispatches, no queue draining, no experiments, until the user's
word. #412 (monitoring LSP CPU rows) filed and queued. fleet-watch
Monitor stays armed; crons stay disarmed (740c5d81). User should
rebuild to get the idle fix.

### ANCHOR 20 — delta 3 (2026-07-30 ~17:5x, post-compaction — OPERATIVE ORDER)

USER ORDER (verbatim): "keep cooking on this, have a break after this
task, no more tasks for now, i need to do a review of everything, been
resting." Meaning: land #393 when READY, then FULL STOP — no new
dispatches, no queue draining, no experiments, until the user's word.
The NEXT DISPATCHES list in delta 2 is HELD for the user's review, not
a work order.

ONE LANE LIVE: #393 relaunched fresh (codex sol-medium, 17:37) after the
prior builder wedged (killed by cwd-resolved pid only). Consolidated
round-5 brief: merge main + observed=painted hidden-pane fix +
proportional visible tick + real-shaped fixture contracts + one gate.
Land via the ritual (extract-gate-verdict.sh, overlap check FIRST —
Bootstrap + dashboard smoke are hot files).

Briefing TRIMMED this delta (user-requested): anchors 8-19 + overnight
sections pruned; git history holds them.

### ANCHOR 20 — delta 2 (2026-07-30 ~16:0x, at 96% — FINAL before compaction)

LANDED since delta 1: #409 (layout tiling, 91249982, narrow-rule
markdown flake recorded into #362), #404 (panel v2, 17b89a64 — full
three-message spec), #381 (LSP everywhere, d8526062 — compiled binary
lacked PATH augmentation; app-root discovery added; #294 fixture blind
spot explained), #408 (workspace isolation, 68fcad24, 2 rounds — six
leaks closed, v2 panel covered). 27 landings today. FILED #410
(merge-gate scratch cleanup; 2212 dead-owner files swept by hand once)
and #411 (gate-load starvation family — retry-green machinery defect,
evidence consolidated).

ONE LANE LIVE: #393 — merge round done or near; then the two queued
rounds: hidden-tasks-pane 30% polling (observed=painted fix +
proportional visible tick, real-shaped fixture). Land on its green via
the ritual (extract-gate-verdict for codex; overlap check FIRST — comm
-12 on merge-base diffs; builder merge-forward round on semantic
overlap).

NEXT DISPATCHES when slots free: #382 (claude resume dialog cut off),
#395 (Database connect hidden-field focus), #397 (FrameProbe misdecode),
#403 (shrunk: record the cache bound), #405 (check against v2 PanelHost
first), #406, #407, #410, #411, #376 (delta sampling + whoami),
#392/#394/#396/#399/#400/#401 hygiene. User offer OPEN: flip
~/.codex/config.toml effort to medium — awaiting their word.

Post-compaction: read this anchor, verify lanes via tmux ls + git log,
re-arm fleet-watch Monitor if TaskList shows none. Landed-today count
and ritual live in delta 1 + anchor 20 body.

### ANCHOR 20 — delta 1 (2026-07-30 ~14:5x, written at the 85% CHECKPOINT)

Since anchor 20: LANDED #402 Invar Monitoring plugin (dae7fba9, opus —
answers the memory question: allocator high-water RSS, NOT file cache;
cache is bounded at 2 hydrated docs). FILED #405 (PanelHost kind tables,
coordinate with #404), #406 (SettingSpec text kind), #407 (keybinding
collision detection), #408 (workspace state isolation — user verbatim +
modularity addendum), #409 (layout switch leaves unfilled space — total
tiling contract). #403 SHRUNK (cache already bounded — record it).

LANES LIVE (5): #393 (merge round + hidden-pane-30%-polling rounds
queued), #404 (panel v2, three verbatim details), #408 (workspace
isolation, opus — census by enumeration, must not touch #404 files),
#409 (layout tiling, codex), #381 (TS LSP only in launch workspace —
routing/rooting experiment, codex).

CODEX EFFORT: all fleet lanes verified medium TWICE by /proc cmdline +
TUI footers. The "sol high" the user sees is their OWN bare codex (pid
843626, from zsh) running ~/.codex/config.toml default high. OFFERED to
flip their config to medium — awaiting their word; do NOT touch it
unprompted.

LESSONS this window: (1) a user field report beat two green fixture
verdicts twice — idle contracts now require REAL-SHAPED fixtures
(hundreds of task folders); (2) overlap check before EVERY landing
(comm -12 on merge-base diffs) is now the ritual's hard step — semantic
merges broke the build once and needed rounds twice; (3) claude-lane
session-link repair done by hand 3x — HARDENED into archive-session.sh
lazy resolution this checkpoint.

Supersedes anchor 19 and its deltas. State reconstructed from disk; verify with
git log --oneline -15 and bun scripts/tasks/tasks-status.ts on resume.

### Session shape
- Conductor pid 3752392 in the MAIN checkout /home/parallels/dev/invar. The
  twin guard is LANDED in scripts/claude-conductor.sh (refuses when a live
  conductor exists; CONDUCTOR_TWIN_OK=1 overrides). A pre-guard twin pid
  1494453 may still sit idle in the user's Invar pane — user cancels by hand;
  never kill without their word.
- Fleet mix: 2 codex sol-MEDIUM + 1 opus-MEDIUM, cap flexed to 4 on user
  priorities. dispatch.sh effort floor is medium (fixed today).
- Landed today: 21 tasks incl. #380 (idle motion), #383 (right dock bound),
  #386 (OSC 66 glyphs), #346 (panel tab bar, 3 rounds), #389 (watch autowrap),
  #387 (slim splitters + pad, opus), #384 (quit dialog), #390 (both docks
  bounded). Build hotfix c325bb41 (the #380 x #348 semantic merge break).

### LANES LIVE (3)
1. #393 idle-cpu-multiple-workspaces (codex) — merge-forward round PLUS two
   queued rounds: hidden-tasks-pane-still-observed (user evidence: hidden pane
   polls at ~30% CPU; hypothesis selected-vs-painted in isObserved derivation;
   fix observed=painted; real-shaped fixture: hundreds of folders) AND the
   addendum (visible tick must be proportional — profile the tick, target low
   single digits on a 250-folder tree). Brief files brief-393-3 + addendum in
   its in-progress folder.
2. #402 invar-monitoring-plugin (opus) — user-directed observability plugin:
   pane citizen, delta CPU (never ps lifetime), heap vs RSS, per-plugin render
   load with logging toggle, file memory ledger, agent-readable projections,
   one stats generator shared with future #376 CLI. Must answer the user's
   206->263MB question in its report.
3. #404 panel-two-row-chrome (codex) — BIG user redesign, THREE verbatim
   details in the task file: two rows (splitter row with wrap/go-to-line/NEW
   go-to-bottom icons left; tab row BELOW with per-tab close + blank cell +
   ellipsis); tabs create CONTAINERS only; lower-level + adds WINDOWS
   (Terminal/Claude/Invar Agent) inside a container — NEVER nested tabs; add
   never auto-splits (full-width groups, explicit split button per list item,
   joined glyphs, drag-out separates, reorder at both levels); pane list pins
   sticky + splitter-resizable + persists closed.

### LANDING RITUAL (unchanged, plus one lesson)
extract-gate-verdict.sh writes its OWN log (never redirect onto the same
path); claude lanes get a hand-written verdict log + session-link repair from
the worktree-keyed project dir. ALWAYS check overlap before landing:
comm -12 of both sides' diffs from merge-base; overlap on a hot file =
round-brief the builder to merge forward + re-gate (semantic conflicts merged
cleanly TWICE today: #380 x #348 broke the build; #346 x #383 needed manual
rounds). Trivial disjoint overlap MAY be conductor-combined with targeted
smokes and a composed three-part verdict log (#387 precedent).

### QUEUE (user-directed first)
381 (LSP missing realized/blackline — reopens #294, hover repro) -> 382
(claude resume dialog cut off) -> 395 (Database connect hidden-field focus) ->
361 (tasks-icon crash) -> 356 (Invar Agent plugin decoupling — partially
refined by #404's composable-placement) -> 397 (FrameProbe misdecode) -> 403
(file cache bounds audit; coordinate with #402) -> 376 (instances:watch CLI;
delta sampling + whoami notes in task) -> 391/392/394/396/399/400/401 hygiene
-> #214/#359/#360/385 flake family (NOTE: #398 retired — one-based offset
already fixed on main).

### WATCHERS
fleet-watch Monitor persistent (ONE only — TaskStop duplicates). Crons
permanently disarmed (user order, commit 740c5d81) — do NOT re-arm.

### USER CONTEXT
- IV_WHOAMI=egor marks the user's instance; measure with DELTA sampling only.
- User's idle measured 0.6% real when tasks deselected; 30% when tasks pane
  hidden-but-selected (the #393 round-3 subject).
- Standing safety: never drive the app with THIS repo as opened workspace
  (real tasks.json spawns aws-vault+conductor sessions); fixtures only.
  Never kill user sessions. Branches never deleted. Builders never push.

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
