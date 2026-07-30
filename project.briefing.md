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

## RESUME ANCHOR 12 (2026-07-30 ~00:5x — THE TRANSPLANT; supersedes 11)

**You are the conductor, possibly a FRESH incarnation in ~/dev/invar (project dir
-home-parallels-dev-invar). This is the resurrection drill the user designed: prove you
recover identity + state + lessons from disk alone.** Prior life: -home-parallels-dev-ibr
transcripts; memory seeded to your project dir with a TRANSPLANT NOTE on top.

STATE: repo renamed tui-editor -> invar (mv + git worktree repair + functional sweep;
recorded fixtures and historic records deliberately untouched). Full ENFORCING gate ran
GREEN from ~/dev/invar (5eb10e69) — the rename is instrument-validated. USER LAW landed
with it: never hardcode the repo root; derive (git rev-parse / cwd).

LANDED: 47 today incl. #300 ten-nitpick bundle (ec651408), #324 media plugin (f9394d58),
#325 A/V map (90b64204), #320+#321 fidelity (f64f85ef), #319, #317, #314 bundle, #301.
All sessions archived by cwd-resolved rollout + commit-hash verdicts.

FLEET: STILL. No builders, no orphans (200/205/326/bc-idle killed by exact name with user
approval). Worktrees parked: 194-reserved-chord, 200-pool, 205-flake-population,
326-vendor (holds the REVISED plan on fleet/326-...), old agent-*, /tmp gate trees
(repaired, user said keep).

QUEUE (dispatch order, user-directed first): #329 tasks:watch animation tick (60fps diff
frames; design in record) -> #323 quit dialog -> #326 STAGE 2 (REVISED plan approved
direction: runtime install via signed registry artifacts, network-edge gating, declared
kernel overrides; plan file in the task folder is the brief base; fresh session OK) ->
#322 status-lie family (now 2 instances) -> #327 Invarnet p2p research (4-invariant
reduction in record is the test target) -> backlog (#283, #272, #269-271, 25x cluster).
WAIT FOR USER: #241 #242; capsule HELD.

WATCHERS (re-arm from ~/dev/invar, ONE each):
  Monitor(command: "cd /home/parallels/dev/invar && bash scripts/fleet/fleet-watch.sh", persistent: true)
  CronCreate(cron: "7,37 * * * *", prompt: "/loop keep going till all tasks are done", recurring: true)
fleet-watch now: CTX speedometer on every event batch, CHECKPOINT at 85% (ANCHOR
PROTOCOL = family 0 project.conductor.md + top of conductor skill), content-keyed READY
stamps (rewritten reports re-fire), steer.sh treats [Pasted Content] chips as composer
occupants. Gauge: scripts/context-usage.sh (repo-local, transplant-aware).

LAWS DELTA since 11: read-the-verdict via cwd-resolved rollout hook-chain extraction
(GATE_EXIT=0 + 'merge-gate GREEN' + commit hash, 7-char abbrev in hook output); a
re-delivered report is a NEW event; a chip is a composer occupant; never hardcode repo
root; bundle landings complete ALL constituent records; census tally per landing (#214
at 31 pool events 07-29).

USER CONTEXT: he watches tasks:watch (animation broken until #329); his iv was closed
for the rename — colors/flicker fixes confirmed by him live. North star: Indranet
Invarnet (#327). He may be GRADING you against the old incarnation — reconstruct fully,
say what you know, then continue the queue.
