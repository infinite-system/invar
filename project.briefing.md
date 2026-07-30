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
  (cron: NONE by default. The user disarmed the "/loop keep going till all tasks
  are done" cron on 2026-07-30 and directed that it must NOT re-arm on cold start.
  fleet-watch events are the wake signal. Arm the conductor skill's :07/:37
  doctrine pair ONLY if the user asks for autonomous pacing again.)
fleet-watch now: CTX speedometer on every event batch, CHECKPOINT at 85% (ANCHOR
PROTOCOL = family 0 project.conductor.md + top of conductor skill), content-keyed READY
stamps (rewritten reports re-fire), steer.sh treats [Pasted Content] chips as composer
occupants. Gauge: scripts/context-usage.sh (repo-local, transplant-aware).

LAWS DELTA since 11: read-the-verdict via cwd-resolved rollout hook-chain extraction
(GATE_EXIT=0 + 'merge-gate GREEN' + commit hash, 7-char abbrev in hook output); a
re-delivered report is a NEW event; a chip is a composer occupant; never hardcode repo
root; bundle landings complete ALL constituent records; census tally per landing (#214
at 31 pool events 07-29).

POST-ANCHOR DELTA (2026-07-30 ~01:2x, pre-compaction checkpoint fired at 86.9%):
User went to LUNCH mid-handoff with instruction "keep going". TWO LANES DISPATCHED from
~/dev/invar: #329 (tasks:watch animation tick) + #323 (quit dialog; brief warns the
harness-teardown path must survive the confirmation — check that decision hard at
landing). fleet-watch Monitor armed from invar cwd; cron 38059f05 alive. Land these two
on read verdicts as they go READY. The session-handoff drill (user launches fresh
incarnation from ~/dev/invar) is STILL PENDING — user does it after lunch; if you are
that incarnation, the two lanes above may be live or READY — pick them up from disk.
#326 stage-2 still awaits his explicit verdict on the revised plan.

USER CONTEXT: he watches tasks:watch (animation broken until #329 lands); his iv was
closed for the rename — colors/flicker fixes confirmed by him live. North star: Indranet
Invarnet (#327). He may be GRADING a fresh incarnation against the old one — reconstruct
fully, say what you know, then continue the queue.

## RESUME ANCHOR 13 (2026-07-30 ~01:5x — RESURRECT-2; supersedes 12)

**You are the conductor, resurrected fresh via claude-conductor.sh from ~/dev/invar.
The user restarts incarnations deliberately; the ORIGINAL (pid 3252926, fable HIGH,
old ~/dev/ibr launch) may still exist but is NOT working — the user confirmed it is
not monitoring or looping. Its script WIP (orientation dedup in resume-conductor.sh
+ claude-conductor.sh + conductor-system-prompt.sh) was ADOPTED by anchor-13's
incarnation after both self-tests passed.**

STATE AT WRITE (main = 740c5d81; verify with git log first — a background commit was
IN FLIGHT when this anchor was written):

1. PENDING COMMIT (background, gate running): "tasks: #322 bycatch conversion — file
   #334, #214 census 40th-43rd; conductor scripts: orientation dedup (adopted)".
   If git log shows it landed: proceed. If NOT: the staged/dirty files are exactly
   those task records + 3 scripts — recommit them (self-tests already green).
   CAUTION: an earlier commit attempt was killed by a 2m shell timeout MID-GATE
   (lesson: gate takes ~3-4m; always background + 10m). That killed run showed 2
   smoke FAILs (scrollbars diff-thumb, terminal tasks:watch motion row) under
   dual-writer load — census-known classes. If they fail AGAIN on a quiet rerun,
   treat as live main-tree red and investigate BEFORE landing anything.

2. #322 READY TO LAND (do this first once the commit above is resolved):
   merge commit 813bc7f38a80b5fce5b17faf9cf7def40f36a903 on
   fleet/322-status-editor-column-content-stale-in-preview, combined with main
   e57752cd; verdict READ per the hook-chain precedent: cwd-resolved rollout
   ~/.codex/sessions/2026/07/30/rollout-2026-07-30T00-55-01-*.jsonl line 591/608
   shows [fleet/322... 813bc7f3] + GATE_EXIT=0 + 'merge-gate GREEN — commit
   allowed'. Extraction log: tmp/gate-verdict-322.log (first line GATE_EXIT=0).
   Bycatch ALREADY CONVERTED (#334 + #214 census in the pending commit). Land:
   GATE_LOG=tmp/gate-verdict-322.log BYCATCH_TRIAGED=1 bash scripts/fleet/land.sh \
     322 status-editor-column-content-stale-in-preview tmp/merge-msg-322.md \
     "status/editor columns read the shared projection seam; combined-tree gate green"
   Builder tmux invar/322-... is idle; codex sol low. Main moved ONE doc-only commit
   (740c5d81, project.briefing.md) past the merged e57752cd — acceptable delta,
   named here per the moved-main rule.

3. LANDED EARLIER TONIGHT: #329 (b8cfdc62), #323 (e8e57083), #327 (e332ebd9).
   tasks:watch animation is FIXED on main — the user watches it.

QUEUE after #322: #326 STAGE 2 — WAIT for the user's explicit go on the revised plan
(runtime install via signed registry artifacts, network-edge gating, declared kernel
overrides; plan file in .invar/tasks/in-progress/326-*/). Then #322's family sibling
check, then backlog: #283, #272, #269-271, 25x cluster. WAIT FOR USER: #241 #242;
capsule HELD.

WATCHERS (re-arm, this exact set, nothing more):
  Monitor(command: "bash scripts/fleet/fleet-watch.sh", persistent: true)
  CRON: NONE. The user permanently disarmed autonomous pacing (2026-07-30). Do not
  re-arm the :07/:37 pair unless he asks again.

DRIFT KNOWN (hold until convenient): STALE-ACTIVE-VIEW (run write-active, fold into
next landing commit); STATE-MISMATCH #114 #122 #223 headers; THIN task files x5.
tmux session invar/329-... is a stale leftover (task landed) — reap when convenient.

LESSON THIS INCARNATION: resurrection works — anchor 12 + disk reconstructed
everything; the one gap was NOT CHECKING for a live prior incarnation before
writing (mtimes on scripts caught it). On resume: pgrep claude + /proc cwd BEFORE
any commit. Also: log -12 was too short to see #329/#323 landings 18 commits back —
use merge-base/ancestry checks, not short logs, before declaring a fork.

## RESUME ANCHOR 14 (2026-07-30 01:52 — post-#322 landing; supersedes 13)

**You are the conductor (pid check first: this anchor's writer was 3752392, launched
via claude-conductor.sh from ~/dev/invar). The old ibr-launched incarnation (3541394,
cwd ~/dev/ibr) may still exist — the user says it is NOT working. Leave it alone.**

STATE AT WRITE (main = 58a2565d + this hygiene commit):

1. #322 LANDED: 0f871cbc (56m dispatch-to-landing), task COMPLETED at 58a2565d,
   tag finished/322-..., worktree and tmux reaped, summary written. Verdict was
   READ from tmp/gate-verdict-322.log (GATE_EXIT=0, combined tree 813bc7f3).
2. LANDED EARLIER TONIGHT: #329 (b8cfdc62), #323 (e8e57083), #327 (e332ebd9).
   tasks:watch animation is FIXED on main.
3. DRIFT CLEARED THIS TURN: STALE-ACTIVE-VIEW (write-active ran), STATE-MISMATCH
   #114/#122/#223 headers fixed. REMAINING: THIN task files x5 (#300 #312 #313
   #314 #320 — filed without reasoning; backfill when touched, not urgent).
   REPORT-IN-OPEN #326 is EXPECTED (stage-1 plan report; stage 2 waits).

QUEUE (all blocked or awaiting user):
- #326 STAGE 2 — WAIT for the user's explicit go on the revised plan (runtime
  install via signed registry artifacts, network-edge gating, declared kernel
  overrides; plan in .invar/tasks/in-progress/326-*/).
- #322 family-sibling check (do other status consumers read the projection seam
  or snapshots?) — not yet filed; pose or fold into #326-adjacent work.
- Backlog: #283, #272, #269-271, 25x cluster. WAIT FOR USER: #241 #242; capsule HELD.

WATCHERS (re-arm on resume, this exact set, nothing more):
  Monitor(command: "bash scripts/fleet/fleet-watch.sh", persistent: true)
  CRON: NONE — user permanently disarmed autonomous pacing (2026-07-30). Do not
  re-arm the :07/:37 pair unless he asks again.

LESSON THIS TURN: none new — anchor-13's resurrection protocol ran clean end to end
(pgrep-first, verdict re-read from log, named moved-main delta, land, hygiene).

## RESUME ANCHOR 15 (2026-07-30 02:50 — post-#336 landing; supersedes 14)

**Conductor pid check first: anchor-15's writer is 3752392 (~/dev/invar launch).
DANGER, UNRESOLVED: the OLD ibr incarnation pid 3541394 (cwd ~/dev/ibr) is ALIVE
and COMMITTING to this repo — it filed a DUPLICATE #338
(338-declared-graphics-tier-fails-silently, a1c9f878) one minute after ours
(338-forced-graphics-tier-blank-pane-silent, 56731af9). The user was asked to stop
it; NO ANSWER YET. On resume: check `ps -p 3541394`, re-ask if alive. Once stopped,
retire the duplicate folder (git mv to retired/ + reason) — do NOT delete.**

STATE AT WRITE (verify with git log; main was at the #344 filing commit):

LANDED TONIGHT: #322 (0f871cbc), #335 (359ca6da), #336 (eaf04d09 — user's video
-y fix, landed over a PRE-EXISTING red per the narrow rule), plus earlier #329
#323 #327. User's live symptoms both fixed: video plays after rebuild; 3D demo
was his graphicsTier=kitty setting in a non-kitty terminal (#338 filed).

MAIN-TREE RED, GATE-BLOCKING: Drive.test.ts "prints a large Markdown file only
after preview and structure work settle" — structure dock paints "No file is
open." while structureStatus=ready, structureRows=110. Fails on main WITHOUT
any branch content (conductor run: 11 pass / 1 fail). This is #334, upgraded to
verification-integrity and DISPATCHED. Every landing until it fixes must either
ride a gate that got lucky or use the pre-existing-red narrow rule citing #334.

LANES LIVE (3, at cap): #334 (gate-blocking structure transient), #339
(supersampled 3D demo for the user's Ghostty/cmux), #340 (file tree reveals open
file + header-button row). All codex sol high.

QUEUE next slot, in order: #342 (tasks.json panes fail to load — SAFETY RAIL in
task file: real tasks spawn aws-vault+claude, fixture-only reproduction, audit
the folderOpen guard); #343 (tasks activity icon → play glyph + LIVE spinner
reusing TasksWatchRenderer's cycle); #344 (breadcrumb hover highlight, one-cell
side padding, row shifts one right); #341 (tree add/drag-drop, BLOCKED on #340).
#326 stage 2 STILL WAITS for the user's explicit go. #337 accumulating.

VERDICT-EXTRACTION RITUAL (now 3x by hand — HARDENING DEBT, next incarnation
scripts it): find codex rollout `grep -l '<slug>' ~/.codex/sessions/<date>/rollout-*.jsonl`,
confirm chain GATE_EXIT=0 + 'merge-gate GREEN — commit allowed' + [branch commit]
in ONE hook output block, write tmp/gate-verdict-<n>.log with those lines, land
with GATE_LOG=. For a red: GATE_OVERRIDE with named pre-existing evidence.

WATCHERS: Monitor(command: "bash scripts/fleet/fleet-watch.sh", persistent: true).
CRON: NONE (user's permanent disarm stands).

LESSONS THIS INCARNATION: (1) land.sh refuses on dirty tree — commit records
BEFORE landing, always. (2) dispatch.sh refuses untracked task folders — git add
before dispatch. (3) A builder merge-round can surface a main-tree red the
builder did not cause: prove pre-existence by running the exact failing test on
main, then narrow-rule land. (4) The other-incarnation hazard is real: check
`pgrep -x claude` + /proc cwd BEFORE trusting main history; a duplicate task
number filed by a twin looks exactly like your own work.

## RESUME ANCHOR 16 (2026-07-30 03:01 — CHECKPOINT anchor; supersedes 15)

**Pid check first (writer: 3752392, ~/dev/invar launch). TWIN HAZARD STILL OPEN:
old ibr incarnation pid 3541394 alive, filed duplicate #338
(338-declared-graphics-tier-fails-silently, a1c9f878). User asked twice, no
answer. On resume: ps -p 3541394; if alive, ask again; once dead, git mv the
duplicate folder to retired/ with reason "duplicate of 338-forced-... filed by
twin incarnation".**

MAIN-TREE RED (gate-blocking, unchanged): Drive.test.ts large-Markdown
structure-dock case (#334, dispatched). Landings until fixed use the narrow
rule citing #334 (pre-existing proof: fails on main without branch content).

LANES LIVE (3, cap): #334 (the red), #339 (supersampled demo), #340 (tree
reveal + button row). All codex sol high. Verdict at READY: use
scripts/fleet/extract-gate-verdict.sh <n> <slug> (NEW, self-tested — the
hand ritual is retired), then land.sh with GATE_LOG=. Remember merge-round
discipline: if main moved with CODE, round-brief a merge before landing.

DISPATCH QUEUE (user-directed, in order): #342 tasks.json panes (SAFETY RAIL
in task file — never drive repo root with real tasks.json, fixture-only,
audit folderOpen guard) → #343 tasks icon + LIVE spinner → #344 breadcrumb
hover pad → #345 separator glyph U+2501 (record re-choice rides the diff) →
#346 panel tab bar (BIG spec, 7 numbered points + addenda; depends on #342)
→ #347 markdown links red + double-click open → #348 tasks:watch gradient
60fps time-based phase. #341 blocked on #340. #326 stage 2 awaits user go.
#337 accumulating.

USER SYMPTOMS RESOLVED TONIGHT: video (-y, #336 landed eaf04d09 — user must
rebuild); 3D demo blank (his graphicsTier=kitty in non-kitty terminal; #338
filed; he sees it on auto now; #339 brings real res for his Ghostty/cmux).

WATCHERS: Monitor(command: "bash scripts/fleet/fleet-watch.sh", persistent:
true). CRON: NONE (permanent disarm stands).

LESSON SWEEP delta since 15: (5) the READY-to-land ritual is now a script —
extract-gate-verdict.sh; use it, extend it, never hand-grep again. (6) A
user firing many small feature requests mid-session: file each as its own
numbered task WITH verbatim intent + conductor seam-triage, commit
immediately, keep the dispatch queue ordered in the anchor — the filing IS
the ack.

## ANCHOR 16 DELTA (2026-07-30 03:2x — append-only, anchor 16 otherwise stands)

- #334 LANDED b4695e2f (Drive settled-wait fixed; re-gate red was #214's
  panel-chrome class, narrow-ruled with census evidence). Main-tree Drive red
  is GONE.
- #342 DISPATCHED into the freed lane (tasks.json panes; SAFETY RAIL in its
  task file). Lanes: #339, #340, #342.
- QUEUE REORDERED (user): #350 (nicer sample video — mandelbrot/life pick)
  jumps to right after #342. Then #343 #344 #345 #346 #347 #348 #349; #341
  behind #340.
- #346 grew points 8-10 tonight: close controls -> then REMOVED in favor of
  the chip-expanded management list (point 9); spaces are MULTI-PANE
  containers; rounded pane frames REMOVED entirely, tabs are the only
  chrome, density goal, focus cue must be re-proposed (point 10).
- NEW since anchor 16: #349 (extensions pane knobs/icons/hover/detail),
  #350 (sample video source swap).
- extract-gate-verdict.sh was hardened (cwd-based rollout selection, the
  #280/#289 lesson) — someone edited it in-place; self-test it before first
  use: bash scripts/fleet/extract-gate-verdict.sh --self-test.
- Twin conductor 3541394: STILL no user decision. Keep asking.

## OVERNIGHT ORDERS (2026-07-30 03:2x — user to bed; SUPERSEDES queue notes above)

USER DIRECTIVES, verbatim intent: (1) "Go stage 2 326" — explicit GO given.
(2) "keep going till everything is done" — drain the ENTIRE queue overnight,
autonomous. (3) "keep max agents at 3" — hard cap 3 builders, confirmed.

DISPATCH ORDER (next free lane takes the front): #326-stage-2 (its old tmux
is GONE — fresh dispatch; plan file + in-app-restart guidance in its
in-progress folder; brief = execute the revised stage-2 plan) → #350 → #343
→ #344 → #345 → #346 (BIG — points 1-10 in task file) → #347 → #348 → #349
→ #341 (after #340 lands). Lanes now: #340, #342, #351.

LANDING LOOP per READY: extract-gate-verdict.sh <n> <slug> (self-test first
use each session) → land.sh with GATE_LOG → bycatch conversion BEFORE merge
→ summary + write-active periodically → dispatch next from order above.
Known pre-existing red classes (narrow-rule with these citations only):
#214 panel-chrome close; #337 structure-outline timeouts (2-night evidence).
Merge-round rule stands: main moved with CODE since a builder's base →
round-brief merge + re-gate before landing.

WAKE DISCIPLINE: fleet-watch Monitor is the primary wake. A ScheduleWakeup
fallback chain (~30m) is armed as drift-catcher — re-arm each firing while
queue non-empty; STOP the chain when everything is done. Crons stay
disarmed (this fallback is not the retired :07/:37 pair).

WHEN ALL DONE: final write-active, summaries complete, trees clean, closing
report for the user's morning: what landed (hashes), what remains (why),
bycatch filed. Do NOT invent new experiments — the queue IS the goal.
Twin conductor 3541394: if still alive and committing, note collisions,
never fight it — user decides in the morning.

## OVERNIGHT DELTA 2 (2026-07-30 03:23)

- TOKEN POLICY (user): codex = sol MEDIUM for all new lanes (dispatch.sh
  default changed, queued task Effort fields changed, e16dce5c). Quota 66%
  weekly, expires Aug 5 — be economical, land on first green, no
  speculative rounds.
- LANES (3, cap): invar/326-stage-two (MANUAL launch — branch
  fleet/326-stage-two cut from e16dce5c, worktree .invar/worktrees/326-stage-two,
  brief brief-326-2-stage-two-execute.md, transcript
  tmp/transcripts/transcript-codex-5.6-sol-medium-326-stage-two.md; its
  report lands in the 326 in-progress folder as report-326-stage-two.md;
  fleet-watch may not auto-key on this nonstandard lane — check it on every
  wake); invar/342 (tasks.json); invar/351 (quick open).
- LANDED: #340 (78de90d2, tree reveal). #339 (0d24d168, 8x demo).
- agent-tmux GOTCHA relearned: verbs take the BARE name with
  AGENT_TMUX_PREFIX="invar/" env — never the prefixed name.
- NEW: #352 filed (markdown code-preview side borders still black —
  incomplete theme conversion). Queue after #351's landing:
  #350 → #343 → #344 → #345 → #346 → #347 → #348 → #349 → #352 → #341.
- dispatch.sh CANNOT relaunch an in-progress task (record-exists guard) —
  the #326 manual sequence above is the workaround; consider a
  --relaunch flag as future hardening, do not hack the guard.

## OVERNIGHT DELTA 3 (2026-07-30 03:2x): fleet mix

User: run 2x codex gpt-5.6-sol MEDIUM + 1x claude OPUS MEDIUM. Maintain the
mix as lanes free: whenever no opus lane is live, the next dispatch goes
opus-5 medium (Engine: claude in the task file — dispatch.sh transmits
--model opus --effort medium). #350 is pre-marked opus. Claude builders:
prime per doctrine (they auto-read CLAUDE.md; tell them to load /ivue +
/invariants; IBR via the system-prompt flags is dispatch.sh's job).
## RESUME ANCHOR 17 (2026-07-30 03:5x, pre-compact CHECKPOINT)

Overnight autonomous run. Stop hooks active: drain the queue, cap 3 agents,
no user questions. Morning report with hashes when drained.

### Lanes (3 live tmux sessions, AGENT_TMUX_PREFIX="invar/")
- 326-stage-two — codex sol MEDIUM, manual lane (branch fleet/326-stage-two,
  worktree .invar/worktrees/326-stage-two). Stage-2 execute per
  brief-326-2-stage-two-execute.md. fleet-watch may not auto-key this
  nonstandard lane; check its tmux + worktree on every wake.
- 342-tasks-json-panes-fail-to-load — READY DELIVERED. Report = NEGATIVE
  diagnosis (all 4 rivals rejected; smoke ratchet added, no product code).
  Commit 60810aa9 on fleet/342-…. NEXT ACTION: extract-gate-verdict.sh 342
  tasks-json-panes-fail-to-load → land via land.sh (bycatch: none stated —
  re-read the report ## Bycatch before landing). After landing: lane FREES.
- 351-quick-open-search-bar-vanishes-list-corrupts — codex sol HIGH, still
  building (recent writes).

### Fleet mix (user, final directive)
2x codex gpt-5.6-sol MEDIUM + 1x claude OPUS MEDIUM. #350 pre-marked
Engine: claude / Model: opus-5 / Effort: medium — it is the NEXT dispatch
when a lane frees (becomes the opus lane). dispatch.sh transmits flags.

### Queue (front first)
350 (opus lane) → 343 → 344 → 345 → 346 (needs 342) → 347 → 348 → 349 →
352 → 341 (unblocked, #340 landed) → 337 (promoted, gate-taxing red).

### Landing ritual
bash scripts/fleet/extract-gate-verdict.sh <n> <slug>  (self-test on first
use each session) → GATE_LOG=tmp/gate-verdict-<n>.log BYCATCH_TRIAGED=1
bash scripts/fleet/land.sh <n> <slug> tmp/merge-msg-<n>.md "<summary>".
Pre-existing red classes for GATE_OVERRIDE: #214 panel-chrome, #337
structure-outline timeouts. Doc-only commits: SKIP_GATE=1.

### Watchers to re-arm on resume (crons stay DISARMED, user order 740c5d81)
1. Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)
2. ScheduleWakeup ~1800s overnight-loop fallback (re-arm while queue
   non-empty; stop when drained).

### Hazards
- NEVER drive the app with this repo as opened workspace while real
  .invar/tasks.json present (spawns real aws-vault/claude). #342 work was
  fixture-only by design.
- Twin conductor pid 3541394 (old ibr session) may still commit; never
  kill without user word; duplicate #338 folder retires after its death.
- Builders misread "do not run merge-gate.sh" as SKIP_GATE license; briefs
  must say: let the commit hook run the gate.

### ANCHOR 17 DELTA (03:4x)
- #342 LANDED e93995e7 (negative diagnosis + smoke ratchet). #353 filed
  from its bycatch (harness contract omits folder-open suppression). Two
  single-occurrence gate flakes logged inside #353, not converted.
- #350 DISPATCHED as the OPUS lane (claude opus medium), branch
  fleet/350-nicer-generated-sample-video. dispatch's send said NOT
  CONFIRMED but the pane shows the builder actively thinking — the
  confirm heuristic is codex-shaped; claude delivery verified by pane
  capture. LESSON: for claude lanes verify delivery by pane capture.
- Lanes now: 326-stage-two (codex med), 351 (codex high), 350 (opus med).
  Mix satisfied. Queue front after these: 343 → 344 → 345 → 346 → 347 →
  348 → 349 → 352 → 341 → 337 (+ 353 hygiene).

### ANCHOR 17 DELTA 2 (05:0x)
- LANDED tonight so far: #342 e93995e7, #351 7f57b019 (+#354/#355 bycatch),
  #350 4017f53c (mandelbrot; narrow-rule over #359/#360/#337 reds),
  #337 64ca4df5 (ordinal->label walks; root cause was #340's contributed
  row; +#362/#363/#364 bycatch). #338 duplicate consolidated+retired
  (twin conductor asleep per user).
- User filed live: #356 agent pane = decoupled "Invar Agent" plugin
  (analysis in task file: module exists, plugin wrapper missing, wired in
  Bootstrap/RootView); #361 tasks-icon click -> panel warnings ->
  terminal buffer crash (verbatim log in task); #90 PROMOTED user-directed
  (full test-isolation census + provenance fix).
- Lanes: 326-stage-two (codex med) · 343 (codex med, round-3: merge main
  + re-gate after #337 unblock) · 90 (opus med, census+fix).
- dispatch.sh codex floor is now MEDIUM (supersedes 07-29 high floor).
- Claude-lane lessons: steer.sh/send confirm heuristics are codex-shaped —
  verify delivery by pane capture; claude builders may write READY before
  committing — briefs now order commit-before-READY; land.sh busy-check
  needs builder idle — wait, retry.
- Queue: 344 345 346 347 348 349 352 341 356 361 362 353 357 358 363 364
  359 360 (+#326 stage-2 in flight).

### ANCHOR 17 DELTA 3 (05:4x)
- More landings: #90 21bf9c71 (isolation census + provenance guard;
  bycatch #365-368), #344 dc30d875 (breadcrumb hover; bycatch #369/#370),
  #343 68a95c11 (play glyph + LIVE spinner; #371 git-watch flake filed;
  post-landing spot smokes green). 7 landings this shift.
- Lanes: 326-stage-two (codex med) · 345 separator glyph (opus med) ·
  346 panel tab bar ten-point spec (codex med, just dispatched).
- Queue: 347 348 349 352 341 356 361 362 353 357 358 363-371 tail.
- Codex-lane report lesson: #343 wrote its report only in the WORKTREE
  task folder; land.sh refused until the conductor copied it to the main
  checkout folder. #346 brief now orders absolute-path report delivery.

### ANCHOR 17 DELTA 4 (06:0x)
- #345 LANDED 085bfca0 (heavy-line centered separator; bycatch #372
  glyph-tier gap, #373 user-visible border hole with repro). 8 landings.
- #326 stage-2 READY delivered (signed runtime plugin install + in-place
  execve relaunch, catalog identity/provenance, atomic selection record).
  Its one gate run was red on the since-fixed plugin-manifest class +
  word-delete double timeout (filed #374). Round-3 brief filed + steered:
  merge main, re-check, re-gate through hook, append chain. Land next.
- #347 dispatched opus (markdown link resolution rivals + double-click).
- Lanes: 326 (codex, round-3 merge) · 346 panel tab bar (codex) ·
  347 (opus). Queue: 348 349 352 341 356 361 + hygiene tail 353-374.
- land.sh claude-lane note: busy-check accepts idle-unconfirmed for
  engine=claude in meta.json; transient 'busy' comes from background
  shells — wait and retry.

### ANCHOR 17 DELTA 5 (06:5x) — #326 endgame state
- #326 round 4 DONE: Alt+Delete regression FIXED on branch (was the
  vendor diff, proven 0/3 vs 3/3; #374 reclassified accordingly). Round-5
  authorization SENT: one SKIP_GATE commit of the staged merge+fix;
  remaining red accepted as pre-existing #359 (discrimination: main 5/5
  green standalone, 326 tree 3/4 with one intermittent red — NOT
  deterministic). Land next with GATE_OVERRIDE citing #359/#214 evidence.
  A commit-waiter (brvxrlq3j) fires when the builder commits; then:
  extract nothing (claude-style manual verdict log), land.sh with
  GATE_OVERRIDE, convert any new bycatch first.
- #350 completed-report conflict markers on main RESOLVED (326 bycatch).
- #326 meta.json repointed to live lane names (user attach failure);
  #375 filed+extended: invisible attach icon AND stale meta.json tracking
  (fix shape: resolve target at click time; degraded state for dead
  sessions; smoke proves mid-session meta edit is honored). User-directed,
  next free lane.
- 4 lanes: 326 (endgame) · 346 panel tab bar (codex) · 347 markdown links
  (opus) · 365 gate scratch namespacing (codex, user-directed for gate
  parallelism). All verified running at their assigned efforts (medium).
- CWD TRAP lesson: Bash cwd persists between calls — two "branch tree"
  smoke runs actually ran in main; always cd explicitly at cell start and
  never pipe smoke output through tail/grep -c without reading the full
  verdict once.

### ANCHOR 17 DELTA 6 (07:0x) — #326 LANDED
- #326 stage 2 LANDED 98c9a7bb (manual merge — land.sh cannot land the
  nonstandard stage-two lane name; followed its steps by hand: no-ff
  merge with the override reason in the message, finished/326-stage-two
  tag, record to completed/, write-active, worktree+session removed).
  Signed runtime vendor plugins + execve in-place restart are ON MAIN.
  NINE landings this shift: 342 351 350 337 90 344 343 345 326.
- Lanes (3, mix 2+1 correct): 346 panel tab bar (codex) · 347 markdown
  links (opus) · 348 next after a lane frees. 365 gate namespacing
  (codex) also live. Queue: 348 349 352 341 356 361 375 + hygiene tail.
- On resume: 346/347/365 READY reports follow the established ritual
  (convert bycatch -> verdict log -> land.sh; claude lanes get manual
  verdict logs from report + conductor verification of commit/clean).

### ANCHOR 17 DELTA 7 (07:2x) — #365 LANDED, ten landings
- #365 LANDED 33024fec: gate scratch paths per-worktree — overlapping
  gates now safe (user-directed gate parallelism). Bycatch all known
  classes; one #364 sighting appended.
- TEN landings: 342 351 350 337 90 344 343 345 326 365.
- Lanes (2 live): 346 panel tab bar (codex) · 347 markdown links (opus).
  One codex slot FREE -> dispatch #375 (tasks live view: invisible attach
  icon + stale meta.json target; user-hit twice) next, then queue: 348
  349 352 341 356 361 376 + hygiene tail.
- #376 filed (instances:watch cpu/mem tool, cwd-based filter).

## RESUME ANCHOR 18 (2026-07-30 07:3x, pre-compact — supersedes anchor 17 + deltas)

Overnight/morning run, user AWAKE and directing. Goal hook: "keep going on
the tasks". TEN landings this shift: #342 e93995e7 · #351 7f57b019 ·
#350 4017f53c · #337 64ca4df5 · #90 21bf9c71 · #344 dc30d875 ·
#343 68a95c11 · #345 085bfca0 · #326 98c9a7bb · #365 33024fec.

### Lanes (3 live, mix 2 codex sol-medium + 1 opus-medium)
- 346 panel tab bar (codex) — the user's ten-point panel spec. Long build.
- 347 markdown links + double-click (opus).
- 375 tasks live view: invisible attach icon + click-time target
  resolution (codex, just dispatched).

### Landing ritual (unchanged)
Convert bycatch FIRST -> verdict log (codex: extract-gate-verdict.sh;
claude lanes: manual log from report header + conductor verification of
commit-on-branch and clean tree) -> land.sh with GATE_LOG (or
GATE_OVERRIDE with named narrow-rule evidence). land.sh busy-check:
claude lanes report idle-unconfirmed (accepted via meta.json engine);
transient busy = background shells, wait and retry. Codex lanes may write
reports only in their worktree — copy to main folder + commit, then land.

### Queue (front first)
348 gradients 60fps · 349 extensions pane · 352 markdown borders ·
341 tree add/drag-drop · 356 Invar Agent plugin (analysis in task file) ·
361 tasks-icon crash (verbatim log) · 376 instances:watch (cwd filter) ·
hygiene tail: 353 354 355 357 358 362 363 364 366 367 368 369 370 371
372 373 374(reclassified) · #214/#359/#360 flake family.

### Standing rules re-learned this shift (operative)
- Both-arms discrimination BEFORE accepting any "pre-existing" claim:
  run the failing smoke standalone on main AND on the branch tree, full
  output (never tail/grep -c), explicit cd every cell (cwd persists).
  This caught the #326 Alt+Delete regression that was nearly landed as a
  filed flake (#374 holds the record).
- Manual lanes MUST update meta.json (tmuxSession/branch/worktree) —
  the tasks live view trusts the record (user attach failure).
- dispatch.sh codex effort floor = MEDIUM (user token policy; verified
  live processes carry medium). Fleet mix: 2 sol-medium + 1 opus-medium.
- Every new claude-lane brief orders: commit BEFORE READY, real hash +
  GATE_EXIT in header, report to main-checkout folder absolute path.

### Watchers
Monitor b08ipqblm = fleet-watch (persistent; the ONE watcher — a twin
survived compaction once, TaskStop the duplicate if two fire). Goal Stop
hook active. Crons DISARMED permanently (user 740c5d81).

### Hazards (standing)
- NEVER drive the app with this repo as workspace + real tasks.json
  (spawns real agents); fixtures only.
- Twin conductor pid 3541394 asleep; ibr repo has its uncommitted
  leftovers (user aware). Duplicate #338 already consolidated+retired.
- User runs an older --smol build; #376 will give instances:watch.

## RESUME ANCHOR 19 (2026-07-30 08:2x, pre-compact — supersedes 18)

User AWAKE, directing. Goal hook: "keep going on the tasks". ELEVEN
landings: 342 351 350 337 90 344 343 345 326 365 347 (last: 27a42bfe,
document-relative markdown links + double-click open).

### Lanes (4 — user prioritization raised the cap)
- 346 panel tab bar (codex) — LONG build, ten-point user spec.
- 375 tasks live view attach icon + click-time target (codex).
- 348 tasks:watch gradients time-based 60fps (opus).
- 380 idle CPU 15-25% (codex, USER PRIORITY). Steered evidence: CPU does
  NOT drop with tasks pane closed -> surviving timer or unconditional
  render loop; toggle matrix in brief.

### Landing ritual: unchanged (anchor 18). Claude lanes: manual verdict
log from report header + verify commit-on-branch + clean tree; codex:
extract-gate-verdict.sh. Bycatch converts BEFORE landing, always.

### Queue (user-directed first)
383 right panel proportional (editor prominent, holistic generator) ·
381 realized LSP reopen (field refutes #294's clean verdict; delta-hunt
brief in task) · 382 claude resume dialog cut off (resize propagation
proof first) · 361 tasks-icon crash · 356 Invar Agent plugin · 349
extensions pane · 352 markdown borders · 341 tree add/drag · 376
instances:watch (cwd filter) · 379 quick-open ranking · hygiene tail
353-374 377 378.

### SPRAWL note (08:2x): +329 /tmp entries = two CONCURRENT GATES'
namespaced builds + harness homes (the #365 design working); 28G free;
NOT a leak. No deletion done.

### Watchers: Monitor b08ipqblm fleet-watch (the ONE); goal hook active;
crons disarmed. On resume re-arm per anchor-18 list if missing.

### User feedback this hour: flicker/3d/video confirmed GOOD in field.
Field bugs live: LSP realized (381), resume dialog (382), right panel
width (383), idle CPU (380 in flight).
