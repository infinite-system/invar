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

## RESUME ANCHOR 9 — 2026-07-29 ~20:30 (35 landed)

Main GREEN. Landed since anchor 8: #294 #277 #295 #298 #296 #299 #305 #311
(35 total). Watchers: fleet-watch Monitor + cron :07/:37 (re-arm after any
session restart — both die with the session; builders in tmux survive, VM
suspend/resume is clean).

FOUR LANES LIVE (user-approved 4th):
- 300-eight-ui-nitpicks-bundled — TEN nitpicks (#300 #302 #303 #304 #306
  #307 #309 #310 #316 #318), one commit per item, land completes all ten.
  #318 includes rounded fence corners follow-up.
- 313-child-owns-its-io-bundle — #313 mouse passthrough + #315 child
  colors; chrome-vs-content boundary recorded once, shared child fixture.
- 308-markdown-view-only-mode-persistent — temp-HOME isolation mandatory.
- 312-vue-sfc-block-syntax-and-routing — phases 1-2 ONLY of the accepted
  map (completed/311-vue-sfc-integration-map/project-vue-integration-map.md);
  user accepted ALL FIVE recommendations verbatim ("all five as
  recommended, go ahead with 312"). Phases 3-5 are later dispatches.

QUEUE: Bundle B (#314+#292+#297, brief /tmp/brief-314-bundle-1.md) →
#317 splitter row → #319 tasks pane → #301 chords → #283 vue rc2 (solo)
→ #272 → #269-#271 → #255-#258 → #260-#262 → 25x cluster.
WAIT FOR USER: #241 #242; capsule HELD; orphans 200-pool/205-flake.

VERDICT LAW (forms a/b/c) unchanged; hand-filed records MUST use
'State:' not 'Status:' (land.sh contract). Bundle landing maps commits
to records by '(#NNN)' suffixes. Census: 10 pool-flakes today in #214;
load-bound timing metrics tallied there too. .invar/tasks.json is
UNTRACKED+gitignored (broke every PTY drive — #314). Steer only via
steer.sh; land only on read verdicts; grep session links by COMMIT.
