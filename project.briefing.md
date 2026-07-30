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

## RESUME ANCHOR 11 — 2026-07-29 ~22:0x (39 landed; compaction imminent)

Main GREEN at 277c4aae+. 39 landed. Since anchor 10: #308 landed 284d53c1
(view-only md mode); #312 phases 1-2 landed b0f78747 (vue block syntax +
routing); BUILD FIX 35402196 (compiler-sfc esm-browser import — CJS broke
bun build --compile; gate now has 'binary build' step per USER directive
'bun run build must be run'); steer.sh hardened 039107df (composer-cleared
is ONLY delivery proof — compaction spinner false-positived #314's steer
14m; memory updated); dispatch.sh writes stub task records 4ba5d6be (land
needs task-<name>.md; #313/#312 stalled on it); all meta.json newline-swept
601e7385 (my json.dump broke 3 builder gates).

LANES (4): 300-eight-ui-nitpicks-bundled (TEN items, 4h+ — at landing:
complete ALL constituent records); 314-harness-and-tooling-integrity-bundle
(#314+#292+#297 — was BLOCKED on my newlines, steered via hand-Enter to
merge main + re-gate through hook; lands on GATE_EXIT=0 + hash);
320-terminal-pane-fidelity-two-bundle (#320 theme bg/palette + #321 DEC-2026
flicker — #320 corrects #315's fixed-xterm overshoot); 317-splitter row.

QUEUE: #319 tasks pane → #301 chords → #323 quit dialog (needs bundle's
#303/#316/#318) → #324 3D demo+video → #325 A/V sync research map →
#326 vendor modularity STAGE-1 (SAME-AGENT two-stage: at plan-READY do
NOT land/close the lane — plan to user, steer approval into same session)
→ #322 status lie → backlog (#283 solo, #272, #269-271, #255-258,
#260-262, 25x). WAIT USER: #241 #242, capsule, orphans 200/205.

NORTH STAR added verbatim: 'our own internet between Invar instances'
(presence → ledger sync → projected panes → fleet mesh; prefer
location-independent seams). New records #322-#326 all verbatim.

LAWS (delta): binary-build gate step exists; steer only via steer.sh
(composer-cleared proof); rollout by session-meta cwd; verdict forms
a/b/c by COMMIT HASH; census #214 at 18 pool events; codex medium
REFUSED->high; State: not Status:; meta.json needs trailing newline
(use print(json.dumps)+newline or echo >>). Watchers: Monitor
bfz27vcz0 + cron 38059f05 :07/:37 — REARM BOTH after session restart.
User's claude symlink verified 2.1.220 after #313-probe damage.
