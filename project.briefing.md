# Overnight briefing — started 2026-07-29 00:28

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

Conductor reduction (for seam decisions, not yet tasks): presence
(discovery) -> shared state (ledger/records sync across instances) ->
live surfaces (panes projected between instances; panel content-set
machinery is the seam) -> fleet mesh (cross-machine dispatch).
Standing implication: prefer seams that keep panel content sets,
task records, and plugins location-independent.

## SUPERSEDED ANCHORS 1-7 PRUNED 2026-07-29 20:3x (user-approved cleanup; git history holds them)

## RESUME ANCHOR 8 — 2026-07-29 ~17:5x (context 86% — compaction imminent)

USER PRESENT, rapid-firing UI refinements; every item filed verbatim. Codex/5.6-sol builders, fable=conductor. Context tool: ibr scripts/context-usage.sh (400k budget).

LANDED TODAY (27): anchor-7's 25 + #267 go-to-line (d1784f94: Alt+G — Git owns Ctrl+G; shared painter; both jump ends; 10+100k contract) + #284 live-theme scrollbar colours (29d815ea: derive-per-frame at ScrollbarSync; census clean). Earlier: #290 corner+parity (f22d86e3, landed on READ quiet-gate log /tmp/gate-290-quiet.log), #293 hover 1.1s->15ms, #280 comment drift, #285 last-row hit test, #265 keys-absent, #279, #281, #291, #273, #289. Main GREEN.

BUILDING: #294 LSP/structure dead in secondary workspace (USER bug; round-2 addendum = multi-workspace test coverage + multi-tsconfig app/api hypothesis, both fixture shapes permanent); #277 preview body viewport after parent growth (remove remount workaround tell); #295 vscode task variables (${env:}, predefined set, fail-before-shell kept, VSCode reference quoted for undefined-env).

USER-DIRECTED QUEUE (dispatch in order as lanes free):
#296 terminal worlds (doubling bug + per-workspace parallel-reality design, verbatim in record; agents same law; capsule HELD)
#298 breadcrumbs (drop prev/forward — workspace bar owns; separators lighter slot)
#299 input primitive EVERYWHERE (shift+arrows selection, copy, alt+backspace uniform; census fixes all single-line inputs; breadcrumb search gets structure's active-search state; search icon 1 cell off edge; AFTER #267-landed seam = ready now; one-painter Scope enumeration fold)
#300 depth menu (highlight current row + activity-bar-style edge marker replaces "(current)" text)
#301 chord-prefix resolver (only first binding with shared prefix arms; #267's unit repro becomes permanent test)
#302 status bar (git user/date: user icon + 1-cell left margin; project name: extra space out; arm 3: better Nerd agent-button glyph, real-terminal evaluation)
#303 shortcuts+settings dialogs (top/bottom margin + content-derived width at shared overlay seam; small-terminal degradation rule)
#304 structure rows (slimmer cache/getter marks 1 cell; line numbers OFF by default behind setting, ":" separator removed)
Then: #283 vue rc2 (solo lane), #272 (record system + 316 bare refs), #292, #297 (dispatch TASK.md pointer fix — 4x toil), #269/#270/#271, #255-#258, #260-#262, #286?landed, 25x cluster. WAIT: #241/#242; capsule HELD.

VERDICT PRECEDENTS: enforcing-hook-chain (transcript quotes run + commit exists past refusing hook); read-verdict from builder gate (last sentinels GATE_EXIT=0, match transcripts BY COMMIT HASH never slug); red-classified-with-controls (all runtime steps green + each red controlled: solo re-run same tree, main control, or instrument-standalone pass). SKIP_GATE builder commits REQUIRE one of the above — recurred 4x.

MECHANICS: steer.sh ONLY (composer-stuck class, 2 incidents); land/dispatch run --fix --moved-only; tasks-status delta = merge-base per tick + committed-only mid-merge + cache PRUNES landed (user's 5-builders-stuck find; both-polarity cache law: every write needs an eviction rule); fleet-watch survives dispatch race (|| true on matchless ls glob, e23f8f4e); session-link repair BY COMMIT HASH + verify grep -c before archive; gate tree /tmp/gate-tree-268-238 reusable (bun install after re-point).

WATCHERS: fleet-watch Monitor bva4qa3i4 persistent; cron 86218567 :07/:37 loop prompt; dynamic loop = no ScheduleWakeup (cron paces). inotify was fine. Orphans 200-pool + 205-flake-population STILL parked (no completed record, numeral collision) — user disposition pending.

CONTEXT DISCIPLINE: anchor at natural boundaries AND before 85%; this anchor written at 86%.

## RESUME ANCHOR 10 — 2026-07-29 ~21:10 (37 landed; context 80% pre-compaction)

Main GREEN at 08403def+. 37 landings today. Latest: #313+#315 child-I/O
bundle (mouse passthrough — USER CONFIRMED WORKING; child colors exact).
Watchers: fleet-watch Monitor + cron 38059f05 :07/:37 (re-arm both after
any session restart; builders in tmux survive; VM suspend/resume clean).

FOUR LANES LIVE (user-approved 4th):
- 300-eight-ui-nitpicks-bundled — TEN items (#300 #302 #303 #304 #306
  #307 #309 #310 #316 #318), one commit per '(#NNN)', 3h20m in. Landing:
  complete ALL constituent active records (move to completed + State
  line) AND create dispatch-folder stub task file if missing (land.sh
  requires task-<folder>.md — learned on #313).
- 308-markdown-view-only-mode-persistent — temp-HOME isolation mandatory.
- 312-vue-sfc-block-syntax-and-routing — phases 1-2 ONLY of accepted map
  (completed/311-vue-sfc-integration-map/project-vue-integration-map.md).
  User accepted ALL FIVE recommendations. Phases 3-5 later, spike gates 3.
- 314-harness-and-tooling-integrity-bundle — #314+#292+#297, one commit
  per number.

NEXT DISPATCH: #320 (terminal default bg from OUR theme + VSCode-default
ANSI palette; corrects #315's fixed-xterm overshoot; child-explicit lanes
stay byte-exact) — ahead of #317 splitter → #319 tasks pane → #301
chords → #283 vue rc2 (solo) → #272 → #269-#271 → #255-#258 → #260-#262
→ 25x cluster. WAIT FOR USER: #241 #242; capsule HELD; orphans
200-pool/205-flake disposition.

VERDICT LAW: forms (a) hook-chain quote + commit past hook; (b) builder
gate GATE_EXIT=0 matched by COMMIT HASH; (c) red-classified-with-controls.
SKIP_GATE commits REQUIRE one. Hand-filed records use 'State:' not
'Status:'. Rollout identified by session-meta cwd ONLY (agent-tmux fix
2026-07-29 — content grep matched other sessions' mentions, reported
finished builder busy). Session links repaired by COMMIT hash grep.
dispatch.sh: per-engine defaults codex->5.6-sol, medium effort REFUSED
loudly -> high (USER: codex medium not allowed); tasks-status falls back
to meta.json. .invar/tasks.json UNTRACKED+gitignored (broke every PTY
drive — #314 owns the seam). Census #214: 15 pool events today. Steer
only via steer.sh. context-usage.sh committed in ibr (3892f03).

USER PENDING COMMS: none — vue five decisions ANSWERED ("all five as
recommended"), #313 confirmed working by user. #320 is his freshest
correction (filed verbatim in its record).
