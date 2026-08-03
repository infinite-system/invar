# RESUME ANCHOR 53 — 2026-08-03 ~09:35 EDT — GOAL MET; 484 EXPERIMENT IN FLIGHT

483 LANDED (7330851c): both conversion phases, 112->0 non-test chains,
AST-census-proven. The user's "get both done intelligently" goal is MET.
#484 (per-file smoke reuse churn experiment) DISPATCHED — ON READY: read the
measurement table, convert bycatch/instrument feedback, gate with a
death-reporting monitor, land — but the ROLLOUT DECISION IS THE USER'S; the
report ends with numbers, not a rollout. User RESTING. Copy saga: app proven
under all arms; ask the user which selection highlight they see when they
return. Fourteen landings this session.

---

# RESUME ANCHOR 52 — 2026-08-03 ~09:10 EDT — 483 IN FLIGHT, 484 STAGED

Chain: 482 LANDED (03fc43fe: composer-focus eliminated, smoke arm added;
user-side question = which selection highlight they see). #483 DISPATCHED
(shortcut-getter conversion, two phases, judgment rules in the brief).
ON READY: convert bycatch + instrument feedback, merge main, gate with a
death-reporting monitor, land. THEN dispatch #484 (per-file smoke reuse
churn experiment — task file has the full design; user redirected the axis
from latency to churn; 236MB/instance measured). Goal hook: "get both done
intelligently" = 483's two phases landed. User RESTING. No experiments.

---

# RESUME ANCHOR 51 — 2026-08-03 ~08:20 EDT — #482 IN FLIGHT; USER PRESENT

Delta over 50c: the user's Ctrl+C observation ("claude flinches") pointed at
composer-vs-transcript focus; #482 filed and DISPATCHED (codex, worktree
482-agent-pane-copy-fails-with-composer-focus) driving the exact sequence
with BOTH focus arms + clipboardEmissions() + child-interrupt observation.
ON READY: convert bycatch, merge main forward, gate (log to a fresh
/tmp/gate-482.log, death-reporting monitor), land via land.sh with
GATE_LOG + BYCATCH_TRIAGED=1.

User is PRESENT, happy with the loop (their words: confident agents will do
the job and we stay on the same page via mirror or conductor-driving).
No experiments. Everything else per anchors 49-50: twelve landings, fleet
otherwise zero, morning items: #464 retire call; #460-#463 hygiene backlog
awaiting the user's word; 7 historical worktrees (194-439) await a
user-authorized sweep.

---

# RESUME ANCHOR 50c — 2026-08-03 ~08:15 EDT — COPY: TRANSPORT PROVEN INNOCENT

Delta over 50b: the user ran the raw OSC 52 printf — IT PASTES. Transport is
fine; the break is BEFORE emission. Awaiting the user's next observation:
select the reply, press plain Ctrl+C, report (a) was Invar's selection
highlight alive at chord time, (b) did Claude react (a flinch = SIGINT went
to the child = the selection-active carve-out did not engage -> suspect
focus composer-vs-transcript or a selection-clearing click; then drive it).
Everything else per anchor 50: fleet zero, twelve landings, tree clean.

---

# RESUME ANCHOR 50b — 2026-08-03 ~08:00 EDT — LIVE COPY INVESTIGATION OPEN

Delta over anchor 50: the user reports agent-pane copy STILL fails in cmux.
The decisive differential is pending THEIR answer: a raw OSC 52 printf test
(bypasses Invar entirely). If it pastes -> the chord/selection never reaches
the app (ask: is Invar's selection highlight live at chord time? which
chord?). If it does not paste -> cmux/ghostty clipboard-write policy
(ghostty config `clipboard-write = allow`), nothing Invar can fix.
App-side is PROVEN (#477: five chord forms emit OSC 52 with selection).
Do not re-litigate the app side; wait for the user's branch answer.

---

# RESUME ANCHOR 50 — 2026-08-03 ~06:25 EDT — TWELVE LANDINGS; FLEET AT ZERO

Delta over anchor 49: #451 landed (367e4458) after a day idle — the fleet is
FULLY DRAINED, zero tmux lanes, zero open worktrees. dist/iv rebuilt.

Backlog triage done: #464 looks largely subsumed by the census arc (user
should confirm retire); #461 matches the scrollbars wrap-off residual (real,
keep); #460/#462/#463 ordinary hygiene backlog. User items unchanged:
cmux Cmd+C test; #464 retire call. No experiments (standing order).

---

# RESUME ANCHOR 49 — 2026-08-03 ~06:15 EDT — ELEVEN LANDINGS; THE NIGHT IS DONE

## STATE: main green and clean; dist/iv rebuilt at e3e3316a.
Waves 1-3 (anchor 48) + #480 Quick Open idiom (04ea99ab) + #481 shared
machinery + Drive gesture deletion (e3e3316a) + the GraphClient timeout-vs-
miss fix (53344f6b). The census migration is COMPLETE except remainders
DECLARED with reasons (11 shell delays; two contention-tier residuals:
plugin-manifest SHELL focus wait, scrollbars wrap-off layout wait).

## USER MORNING ITEMS (unchanged from anchor 48, plus):
1. cmux Cmd+C / kitty Ctrl+C forwarding test — the only open copy hop.
2. #481 round 1 was a conductor brief mistake (template substitution
   silently failed); the builder's NO-CHANGE + conflict note was exemplary.
   Lesson: verify a templated brief's substitutions before dispatch.
3. Conductor decisions pending: #451 review-or-retire; #460-#464 re-read.

## STANDING: crons :07/:37; fleet-watch armed; only the dormant 451 codex
remains in tmux; no experiments; goal MET in full.

---

# RESUME ANCHOR 48b — 2026-08-03 ~05:30 EDT — ONE LANDING IN FLIGHT

READ ANCHOR 48 BELOW FIRST (nine landings sealed). Delta since:

- #480 (Quick Open idiom five files, all six sites) is READY at ad6d5038 in
  .invar/worktrees/480-migrate-the-quick-open-idiom; its gate runs at
  /tmp/gate-480.log with a death-reporting monitor. ON GREEN: land via
  GATE_LOG=/tmp/gate-480.log BYCATCH_TRIAGED=1 bash scripts/fleet/land.sh
  480 migrate-the-quick-open-idiom <msg-file> "<summary>"; convert bycatch
  from the report FIRST (read its ## Bycatch + ## PTY usability).
- After 480: remaining queue per anchor 48 (shared-machinery migration
  round, Drive.ts deletion, 451 review, 460-464 re-read). NO experiments.
- Builders: only 480's codex (idle-READY) + the dormant 451 codex.

---

# RESUME ANCHOR 48 — 2026-08-03 ~05:15 EDT — THE FULL NIGHT IS LANDED

## STATE: main green and clean; dist/iv rebuilt. NINE landings tonight:
Wave 1: 470-slice(5136cdfa) 471(1d03a604) 473(da9f70f2)
Wave 2: 477(08ab9d46) 478-r1(655c0db0) 476(305185c5)
Wave 3: 474(7b8b889d) 475(f10ebd13) 479-r1(c5316ddf)
Plus: reach-completeness record (f23bba4b), modifier clicks, mirror
auto-pacing, gauge budget file, gate-death rerun discipline (474's first
gate died silently mid-tests — reran, landed on the second's own sentinel).

## USER MORNING ITEMS
1. #477: the app copies agent-pane selections (proven, 5 chord forms); test
   whether cmux forwards Cmd+C / kitty Ctrl+C over ssh — the only open hop.
2. #475 landed a REAL bug the demo agent found: Quick Open now focuses the
   editor. The demo loop is already paying for itself.
3. Quit is silent now (#474) and reload cannot strand a dead session (#476).

## OPEN QUEUE (nothing in flight, no builders live)
- Migration remainder: the #479 report's table names every remaining file
  (Quick Open idiom five, shared machinery, agent/terminal, shell sites).
  Next round dispatches from that table verbatim.
- Drive.ts --gesture deletion (now unblocked; conflicts cleared).
- #451 dormant codex: review-or-retire, conductor decision.
- #460-#464 old bycatch: re-read before any dispatch.
- Residual contention flakes (remainder-tier, named): plugin-manifest SHELL
  smoke focus wait; scrollbars wrap-off layout wait.

## STANDING: crons :07/:37 armed; fleet-watch armed; no experiments (user
order); the goal ("470,477,475,476,474 and the rest in smart order") is MET
except the migration remainder + Drive.ts deletion, which are next-round
work by the honest-boundary rule.

---

# RESUME ANCHOR 47 — 2026-08-03 ~04:30 EDT — OVERNIGHT WAVE 2 LANDED

## STATE: main green and clean. Tonight's landings, in order:
470-slice(5136cdfa) 471(1d03a604) 473(da9f70f2) — wave 1 (goal 1, met)
477(08ab9d46) 478-r1(655c0db0) 476(305185c5) — wave 2 (goal 2, in progress)
Plus: reach-completeness record CONFIRMED+landed (f23bba4b); modifier clicks;
mirrored-pace default; gauge budget file.

## USER MORNING ITEMS
- #477 verdict: the APP copies agent-pane selections fine (5 chord forms
  proven). The failure is the cmux/ssh hop — user must test whether cmux
  forwards Cmd+C / kitty Ctrl+C at all. Nothing left on our side.
- The invar-builds-invar live demo works (user drove it via MCP); pacing now
  automatic on mirrors.

## WAVE 3 (dispatching now, user-authorized "and the rest in smart order")
- #479 (to file): migration round 2 — plugin-manifest + scrollbars contention
  files, then the census tail. Work list unchanged: the census + 471's path map.
- #475 Quick Open focus (reproduce-first).
- #474 dispose-order warnings.
- HELD for wave 4 (conflicts with 479): Drive.ts --gesture deletion.
- #451 dormant codex: review-or-retire, conductor decision, pending.

## STANDING: crons :07/:37 armed; fleet-watch armed; no experiments
(user order); cap 3 builders; land serially; gate per landing.

---

# RESUME ANCHOR 46 — 2026-08-03 ~03:00 EDT — THE OVERNIGHT GOAL IS MET

## STATE: all three pipeline tasks LANDED, main green, tree clean.

- #470 slice 1 -> 5136cdfa (wait generators: quiescence reset with
  publication parity after a round-2 conductor-gate catch, pre-satisfaction
  guard, model-count panel waits, settled Drive join, activitybar needles).
- #471 -> 1d03a604 (composition-rooted graph, automatic contributor reach,
  shortcut getters; 26 of 34 census facts now migratable with named paths).
- #473 -> da9f70f2 (the MCP doorway: agents drive Invar through MCP; seven
  instrument fixes; MCP-client-verified at 10 and 100k lines).
- dist/iv rebuilt from da9f70f2. Crons at :07/:37 armed; fleet-watch armed.
- User constraint honored: no experiments, no other tasks.

## For the user's morning — PTY usability tracking (their question)

Three builders used the drive loop overnight. Verdict: IT WORKS — all three
verified real behavior through warm servers without hand-rolled probes.
Collected friction, ALL NOW FIXED in #473's landing: labeled show, --size
fixtures, loud attach exits, stop-command docs, status-vs-graph split
documented, SIGWINCH forwarding. Remaining asks: MCP server_start has no
line-count option (workspace prep still manual for MCP-only callers).
AWAITING THE USER: the proposed reach-completeness invariant record
("the composition graph reaches every installed contributor").

## Open queue (nothing in flight)

#470 remainder (the ~125-site migration, now unblocked by #471) · #475
(Quick Open focus bycatch) · #476 (reload boot-failure) · #474 (dispose
warnings) · Drive.ts --gesture deletion · #451 dormant codex · #460-#464.
The invar-builds-invar DEMO LOOP waits for the user to watch it live.

---

# RESUME ANCHOR 45 — 2026-08-03 ~00:55 EDT — START HERE

## STATE: gate GREEN at 7654e61d (ALL-PASS, GATE_EXIT=0, clean tree, log
/tmp/gate-final-clean2.log). Everything the marathon built is landed and gated.

The user is PRESENT and directing. Crons stay DISARMED (standing order).
fleet-watch Monitor is the only watcher; re-arm on restart:
`Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)`.

## What exists now (all gated)

- The graph channel (#469): get/waitFor(parked)/set(experiment)/awaitTransition.
- The drive server (#472 case 1): --serve/--attach/--reload/--stop, rendezvous
  KEYED TO THE CHECKOUT (each worktree its own server), --mirror for humans
  (trail, click rings, scroll marks, humanPace Fitts model).
- The drive-pty SKILL (.claude/skills/drive-pty/SKILL.md) — LEADS with the
  agent's headless primary loop; encoded demos in scripts/harness/drives/.
- Census #470 complete (all 77+ files), panel-chrome fixed, conductor
  families 15-17 recorded.

## Open queue (order decided by the user)

1. #472 remainder: NONE (case 2 deprioritized by measurement — 5% of gate).
2. #471 graph completeness (contributor state; shortcut getters) — accumulating
   tangents, DO NOT LAUNCH without the user.
3. #470 wait repairs — blocked on #471; renderQuiescent fix + PtyTestDriver
   guard could land independently.
4. #473 remainder: the MCP doorway (agents drive via MCP) + resize forwarding.
5. Drive.ts --gesture layer deletion (#466 rejected direction) — STILL OPEN.
6. #474 dispose-order warnings; #451 dormant codex in its worktree (steer or
   retire); #460-#464 bycatch backlog.

## The night's lessons live in project.conductor.md families 15-17 and the
drive-pty skill; the census is durable in task #470's folder.


---

# RESUME ANCHOR 44 — 2026-08-02 ~19:53 EDT — START HERE

## STATE: #469 is DONE and landed. Main is f1dd6a31, tree clean.

The user is PRESENT and directing. Crons stay DISARMED (standing order).
fleet-watch Monitor is the only watcher; re-arm with
`Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)`.

## THE NEXT ACTION: the user owes a DECISION. Do not fix anything until they answer.

Census batch 1 IS DELIVERED — `tmp/harness-wait-census.md` (43 of 77 files).
Batch 2 (the 34 deferred files, contention tier first) is in flight and
APPENDS to that same file. The user's exact words were "give me a report
before we do the fixes", and the report has been given; they were then asked
which fixes they want and in what order, and have NOT answered. Wait.

### THE BIGGEST FINDING — carry this even if everything else is lost
`renderQuiescent` is initialized false at StatusChannel.ts:33, set true at
StatusChannel.ts:97, and NEVER SET BACK TO FALSE ANYWHERE. Verified directly.
So after the first completed frame it is permanently true, and every `settle`
wait and every `renderQuiescent === true` check is pre-satisfied for the life
of the process. `scripts/tui-harness.sh`'s `settle` is therefore a no-op, and
the ~258 sleeps in the shell suite are the SYMPTOM of people papering over a
primitive that never worked. Also reaches perf-baselines.sh:100,
smoke-activitybar-harness.ts:260, smoke-tree-scroll-harness.ts:95/151/375,
Drive.ts:703.

Recommended order given to the user (awaiting their ruling):
1. Fix renderQuiescent (reset to false when a frame is requested).
2. PtyTestDriver.ts:412-439 — add the pre-satisfaction guard its own sibling
   already has at :277-282. The only fix that stops class 1 recurring.
3. HarnessSmoke.ts:313-316 — the surviving half of #464, in a SHARED helper
   on the contention tier.
4. Finish/act on the census; 5. the individual class-1 sites.

Census counts, batch 1: class 1 pre-satisfied 53 · class 2 proxy 22 · class 3
sleep-as-sync ~258 (needs triage, not 258 defects) · class 4 stale needle 2 ·
class 5 blink 13.

## (superseded) the census brief, kept only to re-run if the file is lost

A background subagent is auditing every `scripts/harness/smoke-*.ts` for
flake-prone waits. The user asked, verbatim: "scout the app harness
smokes/tests for where we can implement the same to reduce tests,smokes
flakiness and give me a report before we do the fixes".

**REPORT FIRST. FIX NOTHING until the user approves.** If the agent's result
was lost to compaction, re-run the census (the brief is reproduced below).

### The census brief, to re-run if lost
Defect classes, priority order:
1. PRE-SATISFIED WAIT — a wait already true when issued, so it returns a
   stale frame. This caused the real gate red (#464). Signature: an
   awaitGridCondition/findText wait on text painted BOTH before and after the
   change. Ask of every wait: "is this FALSE right now?"
2. PROXY WAIT — waiting on a repaint or row-text diff when a model condition
   exists.
3. SLEEP used as synchronization rather than as a deadline.
4. STALE NEEDLE — literal screen text the app no longer paints.
5. TRANSIENT/BLINK — needs awaitTransition, not awaitValue.
Scope: all scripts/harness/smoke-*.ts + PTY-waiting scripts/smoke-*.sh (~70
registered jobs); note which are on the CONTENTION tier (grep
`contention_smoke` in scripts/merge-gate.sh) since contention widens the
model-to-paint window. Output: file:line, class, the wait as written, why,
and a proposed graph path WITH EVIDENCE it exists (cite the defining
file:line) or "no model path". Then counts per class and the top 5 fixes.

## What shipped today (all on main, all gated by hand — see each commit)

- **#469 the graph channel.** `src/modules/system/GraphChannel.ts` answers
  path queries against the LIVE ivue graph; root is the existing
  `statusProjectionPorts` object in Bootstrap (~line 1402), so the path
  namespace is `panelHost`, `workspaceSet`, `view`, `settings`, `quickOpen`,
  `layoutSlotSizes`, `mouse`, … (25 roots). Same enablement as StatusChannel
  (`TUI_OBSERVE=1` or `TUI_STATUS_PATH`), so a shipped binary exposes nothing.
  Driver side: `scripts/harness/GraphClient.ts` (shared by DriveSession AND
  the smokes — one protocol, do not fork it).
  - `get(path)` — mode 'now'.
  - `waitFor/awaitValue(path, value)` — mode 'await': the condition is PARKED
    IN THE APP and evaluated in the frame-settle hook. One request buys every
    sample. The app owns the deadline and answers with the last settled value.
  - `set(path, value)` — EXPERIMENT only, user decision 2026-08-02. Never in
    verification: it bypasses the user's input path.
  - `awaitTransition(path, value)` — mode 'transition': subscribes (Vue watch,
    sync flush) for BLINKS only. Reports mid-update states and adds an edge to
    the reactive graph. Limits are documented at the definition.
  - Record: `Graph observation reads and never mutates` in
    src/modules/system/system.invariants.md.
- **Panel tab bar**: trailing pad after the instances toggle removed (user
  request); the toggle now ends the row flush and its hit target reaches the
  edge. `src/modules/ui/PanelTabBar.ts` + geometry contracts (endColumn 78→80
  at width 80).
- **panel-chrome smoke migrated** (97c89a44): the #464 contention red was a
  PRE-SATISFIED WAIT, not load — see the census brief above. Also repaired
  three stale needles left by #465/#467.

## Open threads, honestly stated

- **The drag flake is DIAGNOSED** (was open earlier in this anchor). The named
  wait at smoke-panel-chrome-harness.ts:740-745 is INNOCENT — its predicate is
  genuinely false at issue. The defect is the PRECONDITION at :712-717, class
  1: it waits for `─` on the splitter row and the splitter always paints `─`,
  so it returns the pre-relayout frame; splitterMarkRun then reads a stale
  edgeColumn, the press misses the new grab band, and the later wait times
  out. Today's work is exonerated. NOT YET FIXED — it is in the gated set.
- **The gate is GREEN.** `/tmp/gate-469-final.log` — `GATE_EXIT=0`, ALL-PASS,
  zero FAIL lines, on the tree at 72cf4613. `OK contention: panel-chrome
  harness` in 20.1s: independent confirmation that the #464 gate red is gone.
  Verification debt from the SKIP_GATE=1 landings is CLEARED.
- #451 READY at a80c75c0, never gated. #460-#464 filed from bycatch. The
  #466 `--gesture`/panel-role layer in Drive.ts should be DELETED (superseded
  by DriveSession; the user rejected that direction).

## Lessons captured today (already written to project.conductor.md family 16)


---

# RESUME ANCHOR 43 — 2026-08-02 ~19:10 EDT — START HERE, DO #469 DIRECTLY

## THE NEXT ACTION: implement #469 YOURSELF. Do NOT dispatch.
The user was explicit: "no, don't dispatch" then "i will compact you and we
start". A builder WAS dispatched and stopped; branch tagged
retired/fleet/469-drive-reads-the-app-class-graph, worktree removed, task
folder moved back to .invar/tasks/active/469-drive-reads-the-app-class-graph/
with brief-469-1 already written. READ THAT BRIEF AND THE TASK FILE FIRST —
they are complete and were reviewed; do not re-derive them.

### The user's direction, verbatim
"also maybe you should be able to access the whole app graph, since our whole
app is just a class graph, do not rely on status projection"
and earlier: "you can use lodash.get/set" (lodash.get is NOT a dependency;
only lodash.throttle is — a local resolver was chosen and already exists).

### What is already known — do not spend context rediscovering
- The seam is `src/modules/system/StatusChannel.ts` (130 lines). It already
  owns the observation channel, enabled by `TUI_OBSERVE=1` OR the presence of
  `TUI_STATUS_PATH`, and it writes the atomic status file. The graph bridge
  belongs beside it under the SAME enablement, so a shipped binary never
  exposes its object graph. Do not invent a second channel concept.
- The app runs in a SEPARATE PROCESS (the PTY child), so the driver cannot
  touch the objects in memory. A request/response channel is required.
- `scripts/harness/DriveSession.ts` is the surface to extend (landed today,
  #468). Its `resolvePath` is the segment walk to mirror over live objects; it
  already handles `a.b[0]` and returns a PATH_MISS symbol so "absent" and
  "published as undefined" stay distinguishable. `show()` already fails loudly
  with near-match suggestions — hold that same discipline for `get`.
- ivue getters evaluate on read, so a walk returns live values. Unwrap
  Ref/Computed IN THE RESOLVER, never at the call site.

### The one question to settle BY DRIVING, not by argument
Conductor's claim: keep the status projection alongside graph reads, because
it is published atomically at a frame boundary so a wait on it cannot observe
a half-updated app, whereas a live graph read can catch the app mid-update and
return a value that never existed (the torn-frame class #457 removed from the
gate). Therefore graph reads for ASKING, projection for WAITING.
TEST IT. If a graph read can tear, `waitFor` on a graph path is a flake
generator and must sample only at a safe point — name the point. If it cannot
tear, say what makes it safe and the caution was wrong.

### Boundaries
READ ONLY. A `set` bypasses the user's own input path, which is the premise of
the whole harness. If setting seems needed, argue it separately; do not ship
it. Bridge inert unless the harness enables it.

## LANDED ON MAIN TODAY
#457 gate determinism 687dc80f · #459 panel reachability bc367e17 ·
#465 emptied space survives ecc13a44 · #466 Drive roles/gestures f7212535 ·
#467 add control keeps one button appearance 72a6f7f3 ·
#468 DriveSession fluent + loud show + paths 4326e2cc, 50a79127, ee80a561.
dist/iv rebuilt 18:18 (from 72a6f7f3 — REBUILD after any user-facing change;
the user tests the BINARY and tested stale code once tonight).
The user CONFIRMED the panel work: "finally fuck, tested it works".

## ALSO OPEN (lower priority than #469)
- DELETE the `--gesture`/panel-role layer in Drive.ts (#466). The user
  rejected that direction as too app-specific; DriveSession supersedes it.
  Leaving both is drift. Keep the generic `status-excludes` completion.
- Gate on main RED: /tmp/gate-main-465.log GATE_EXIT=1 while printing
  "blocking verdict unchanged"; failing check is contention panel-chrome
  (#464), pre-existing. #457's report-only tier did not hold the exit code
  there though it did on gate-457 and gate-459e.
- #451 READY at a80c75c0, never gated. #460-#464 filed from bycatch.

## STANDING
Crons DISARMED by user order — never re-arm. fleet-watch Monitor only.
NEVER write to ~/.config/invar (the user's real config; theirs is damaged —
its terminal space was persisted away by the pre-fix binary; Ctrl+J restores).
ui-task skill governs UI work. project.conductor.md family 15: never write the
second probe — fix the instrument.

# RESUME ANCHOR 42 — 2026-08-02 ~18:25 EDT (85% gauge) — DO THIS FIRST

## LANDED ON MAIN THIS SESSION (all verified by driving, not by reading)
- #457 gate determinism -> 687dc80f
- #459 panel reachability -> bc367e17
- #465 An emptied space survives its last instance -> ecc13a44
- #466 Drive panel roles + gestures -> f7212535
- #467 The add control keeps one button appearance -> 72a6f7f3
dist/iv rebuilt at 18:18 from 72a6f7f3. The user tests the BINARY: rebuild
after every user-facing change or they test stale code (cost one round tonight).

## USE THE INSTRUMENT, NEVER HAND-WRITE A PROBE (user-directed, 2026-08-02)
"drive.ts should be sophisticated enough that you can drive the terminal app
without hand coding the probes each time."
  bun run drive --open <ws> --gesture openPanel --gesture openInstances \
    --gesture addInstance=Terminal --gesture closeInstance="Terminal 2"
Roles: instances-toggle · instance-add · instance-row · instance-row-close ·
popup-entry. Completion status-excludes waits for a label to LEAVE a list.
When a drive is fiddly, FIX THE INSTRUMENT ONCE — do not write probe #5.

## OPEN — mine, in priority order
1. closeInstance's close-control fallback uses `snapshot.columns - 2`. That
   assumes the list ends at the screen edge; it broke the moment the layout
   shifted. It needs the list's REAL width (status panelListGeometry.width is
   the natural source but publishes left=-24, see #463). Reproduce:
   ... --gesture closeInstance=Terminal --gesture closeInstance="Terminal 2"
   with the #467 header — the second close resolves a column off.
2. Gate on main red: /tmp/gate-main-465.log GATE_EXIT=1 while printing
   "blocking verdict unchanged". Failing check is contention panel-chrome
   (#464), pre-existing. #457's report-only tier did NOT hold the exit code
   here though it did on gate-457 and gate-459e. Hole in what I landed.
3. #451 READY at a80c75c0, never gated.
4. #460 contention evidence asymmetry · #461 scrollbar deep-wheel · #462 empty
   slowest row · #463 panelListGeometry left=-24 · #464 panel contention.

## THE USER'S OWN CONFIG IS DAMAGED (not a live bug)
~/.config/invar/settings.json panelWorkspaceStates["/home/parallels/dev/invar"]
holds ONLY a database space; the terminal space was destroyed and persisted by
the pre-fix binary. Ctrl+J restores it. NEVER write to their real config.

## STANDING
Crons DISARMED by user order — never re-arm. fleet-watch Monitor only.
The user is ACTIVELY PRESENT: their direction IS the backlog. ui-task skill
governs UI work — SEE by driving before speaking, batch items, confirm before
dispatch.

# RESUME ANCHOR 41 — 2026-08-02 ~18:40 EDT (85% gauge) — DO THIS FIRST

## USER-DIRECTED UI TASK, stated verbatim (do not paraphrase away)
"Add Terminal thing is not just a text, it's a button... but that's not
fucking clear, also my point was, it SHOULD not be like that, it should
LEAVE the right pane to exist with the existing btn on top, not switch me to
use Add Terminal in the left pane which doesn't look like a button, the left
Pane should have nice description like Database left pane when no database is
connected, or should have proper spacing and Add Terminal should clearly look
like a button, but I also want to show right pane still, if no one closed the
right pane via the toggle, it should still be there with 0 instances but a
+ Terminal button should give me the choices and be able to add new terminal"

### The three requirements
1. At 0 instances the INSTANCES LIST (the "right pane") must REMAIN, with its
   `+ Terminal ▾` button on top. It disappears ONLY via its own toggle.
2. The CONTENT area (the "left pane") shows a real empty state: description +
   proper spacing, modelled on the DATABASE pane's not-connected state.
   GO LOOK AT THAT FIRST — it is the reference the user named.
3. The add affordance must LOOK like a button. Today the list header silently
   degrades from `+ Terminal ▾` to the bare text `Add Terminal`, which reads
   as a label. Conductor wrongly reported "Add Terminal paints: yes" as if
   that closed the question.

### ui-task skill governs: SEE, CONFIRM, ACCUMULATE, ask before dispatch.
Do NOT dispatch on the three items above alone — batch 10-20 items for the
panel-chrome surface, each with driven before/after values.

## LANDED THIS SESSION
- #457 gate determinism -> 687dc80f. Five identical verdicts on one commit,
  unchanged at 3 and 6 workers, planted defect red 5/5.
- #459 panel reachability -> bc367e17.
- #465 An emptied space survives its last instance -> ecc13a44 (ON MAIN).
  PanelHost.detachContent: (a) keep a space that is active even when emptied,
  (b) last-cell fallback searches only the ACTIVE SPACE. Both load-bearing,
  proven by deletion. Record in ui.invariants.md. dist/iv rebuilt 17:59.
- #466 Drive panel roles + gestures -> f7212535 (ON MAIN).
  Roles: instances-toggle, instance-add, instance-row, instance-row-close,
  popup-entry. Gestures: openInstances, addInstance[=KIND], closeInstance=LABEL.
  New completion: status-excludes. USE THESE. Do not hand-write probes.
  Whole scenario:
    bun run drive --open <ws> --gesture openPanel --gesture openInstances \
      --gesture addInstance=Terminal --gesture closeInstance=Terminal
  Proven: panelContentLabels=[] with panelVisible=true, list still open.

## THE USER'S OWN STATE IS DAMAGED (not a live bug)
~/.config/invar/settings.json panelWorkspaceStates["/home/parallels/dev/invar"]
has ONLY a database space — the terminal space was destroyed and PERSISTED by
the pre-fix binary. Ctrl+J restores it (verified against a copy). NEVER write
to their real config.

## OPEN, MINE TO CHASE
- Gate on main /tmp/gate-main-465.log GATE_EXIT=1 while printing "blocking
  verdict unchanged". The failing check is contention panel-chrome (#464),
  pre-existing. So #457's report-only tier did NOT hold the exit code on that
  run though it did on gate-457 and gate-459e. Hole in what I just landed.
- #464 panel surfaces under contention · #460 contention evidence asymmetry
  (git-watch moved on one unreproduced retry; bounded-list popup refused on
  identical evidence) · #461 scrollbar deep-wheel · #462 empty slowest row ·
  #463 panelListGeometry publishes left=-24.
- #451 READY at a80c75c0, never gated.

## STANDING
Crons DISARMED by user order — never re-arm. fleet-watch Monitor only.
The user is ACTIVELY PRESENT and directing: their direction IS the backlog.

# RESUME ANCHOR 40 — 2026-08-02 ~15:50 EDT (100.5% gauge) — DO THIS FIRST

## #457 IS READY AND IT DELIVERED. Gate and land it FIRST.

Branch `fleet/457-serial-tail-lacks-quiet-retry`, tip `246405c3`.
Report: `.invar/tasks/in-progress/457-serial-tail-lacks-quiet-retry/report-457-serial-tail-lacks-quiet-retry.md`
(READ IN FULL — this anchor is a summary, not a substitute).

The three-part acceptance criterion was MET, with the runs reported:

| Run | Workers | Blocking verdict | Contention | Load |
| 1 | 3 | all-pass | 4/4 | 0.77 |
| 2 | 6 | all-pass | 4/4 | 1.40 |
| 3 | 3 | all-pass (one retry) | 4/4 | 1.23 |
| 4 | 6 | all-pass | panel-chrome failed | 1.07 |
| 5 | 3 | all-pass | panel-chrome failed | 0.88 |

Five identical blocking verdicts on one unchanged commit. Verdict unchanged
at 3 and 6 workers. Planted defect (the real pre-fix form) went red 5/5.

### What it actually found — the mechanism
NOT a missing retry. The founding premise stayed false. `PtyTestDriver`
already retained every completed frame; `scrollUntilVisible` in
`smoke-shortcut-help-harness.ts` read the LIVE emulator via `snapshot()`,
which can hold the start of the next synchronized frame. It removed the
three-delivery chord retry and the fixed 200 ms sleep. Shortcut contention
went 3/6 fail -> 6/6 pass.

### Four checks moved to the report-only contention tier
`panel-chrome`, `scrollbars`, `git-watch`, `plugin-manifest lifecycle`.
70 jobs registered, 67 pooled, 3 serial tail. No coverage deleted. It
explicitly did NOT move `shortcut-help` (deterministic consumer error) or
`bounded-list popup` (one unreproduced retry).

### CONDUCTOR CHECK BEFORE LANDING — do not skip
1. The moved-to-contention list is a DOWNGRADE class. Four blocking checks
   stopped being able to block. Each has a named reason in the report; read
   them and say whether you accept each one. This is the exact place a gate
   goes quiet.
2. `panel-chrome` moving to contention DIRECTLY BEARS ON #459's one red
   (anchor 39). If #457 lands first, #459's blocker may cease to block.
   Land #457, THEN re-gate #459 on the new gate. Anchor 39's A/B may be moot.
3. Proposed invariant: it found `Blocking gate verdicts use ordering and
   counts` ALREADY EXISTS in `scripts/harness/harness.invariants.md` and
   proposes REFINING it rather than adding a record. My brief said the
   invariant was written nowhere — that is a Family 14 repeat (conductor
   asserts repo facts from memory). Accept the refinement; record the miss.

### Bycatch to convert BEFORE merging (six items, all in the report)
panel-chrome load defect (-> #459) · plugin-manifest panel geometry (-> #459)
· scrollbar deep-wheel · git-watch timeout · bounded-list popup timeout
· FAST slowest-table empty row `1. 0m00.000s —`.

### Landing recipe
Cut a clean integration tree (NOT /tmp/integration-459b, it held an
unresolved conflict), merge main forward, gate, READ `GATE_EXIT` from the
log, then `land.sh` from the MAIN checkout with `GATE_LOG=` and
`BYCATCH_TRIAGED=1`. Docs commits use `SKIP_GATE=1`.

## Then, in order
- #459 — re-gate after #457 lands (see check 2 above).
- #451 — READY at `a80c75c0`, was HELD for #457's measurements. Unblocked now.
- #458 — all-terminals-dead-after-idle, unexplained, must not close quietly.
- Queue: #445, #446, #447, #450, #453–#456.

## Standing
Crons DISARMED by user order — never re-arm. fleet-watch Monitor is the
only watcher: `Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)`.
Goal: make gate solid, deterministic, hard to flake.

# RESUME ANCHOR 39 — 2026-08-02 ~15:20 EDT (99% gauge) — DO THIS FIRST

## #459 clean-tree gate: GATE_EXIT=1, ONE red
Tree `/tmp/integration-459d` (`080231be`), log `/tmp/gate-459d.log`:

```
FAIL smoke: panel-chrome harness
error: Timed out waiting for
  120-column Database add offers only another Database instance before Database 3
```

**NEXT ACTION — A/B this before blaming anything.** It is a TIMEOUT, not
an assertion failure, and this exact wait has a history: #452's builder
reported it timing out on an UNCHANGED tree (`4222e760`) and called it
pre-existing. So the live hypotheses are (a) known contention flake, or
(b) #459's factory seam genuinely changed contextual Database add.
Run it quiet on `/tmp/integration-459d` AND on plain `main`, twice each.
- passes quiet on both -> contention; land #459 with a WRITTEN
  GATE_OVERRIDE naming this red and its A/B evidence.
- fails quiet on the 459 tree only -> real; round 6 to the builder.
Do NOT re-run the gate hoping for green.

## Landing command once cleared
`GATE_LOG=/tmp/gate-459d.log BYCATCH_TRIAGED=1 bash scripts/fleet/land.sh 459 empty-right-pane-has-no-add-affordance <msg-file> "<summary>"`
Run from the MAIN checkout. Bycatch already triaged (two contract items,
both ACCEPTED and already committed to main).

## ABANDONED: `/tmp/integration-459b` — unresolved merge conflict made it
hold a stale coverage declaration; two gates judged a tree that did not
match the branch. Verify a merge SUCCEEDED before gating.

## Fleet
- **#457 gate determinism — THE PRIORITY** (user hook goal: solid,
  deterministic, hard to flake). Rounds 1+2 filed, no commits yet.
  Acceptance: 5 identical verdicts on one commit · unchanged at 3 and 6
  workers · planted defect red all 5 times. Design: deterministic
  BLOCKING tier + reported CONTENTION tier.
- **#451** READY `a80c75c0`, HELD from gating until #457 measurements
  finish.
- **#459** one red from landing, see above.

## Standing
- Crons DISARMED. One watcher: fleet-watch Monitor.
- Docs commits need `SKIP_GATE=1`. File the brief BEFORE the steer.
- A gate names a COMMIT, not a branch.
- shortcut-help passes 10/10 quiet on main, fails only in loaded gates.
- project.conductor.md family 14: derive brief facts mechanically.

---

# RESUME ANCHOR 38 — 2026-08-02 ~15:00 EDT (98% gauge)

## #459 — gating on a CLEAN tree, `/tmp/integration-459d` (`080231be`)
Log: `/tmp/gate-459d.log`. If GATE_EXIT=0 -> land #459 from the MAIN
checkout with `GATE_LOG=/tmp/gate-459d.log BYCATCH_TRIAGED=1`.

**Why the earlier gates kept failing identically:** `/tmp/integration-459b`
had an UNRESOLVED CONFLICT from a `git merge main`, so it held the OLD
coverage declaration (35->27/33->29) while the branch had the corrected
one (35->29/33->31). Two gate runs judged a tree that did not match the
branch. ABANDON `/tmp/integration-459b`. Lesson: after any merge into an
integration tree, verify the merge SUCCEEDED before gating — a gate on a
conflicted tree reports a stale verdict that looks like a real red.

Round 5 is otherwise complete: every declaration re-measured, all six
round-4 smokes pass, only the ratchet was outstanding.

## Fleet
- **#457 gate determinism — THE PRIORITY** (user hook goal). Rounds 1+2
  filed. Acceptance: 5 identical verdicts on one commit · unchanged at
  3 and 6 workers · planted defect red all 5 times. Blocking tier
  deterministic + contention tier reported.
- **#451** READY `a80c75c0`, HELD from gating until #457's measurements
  are done.
- **#459** gating now.

## New doctrine committed
`project.conductor.md` family 14 — briefs assert repo facts from
memory; derive the invariants list mechanically, never name an un-ls-ed
script, never derive a filename from a gate label, grep before claiming
no record governs X.

## Standing
- Crons DISARMED. One watcher: fleet-watch Monitor.
- Docs commits need `SKIP_GATE=1`.
- File the brief BEFORE the steer.
- A gate names a COMMIT, not a branch — re-merge and re-gate if the
  branch moved.
- shortcut-help passes 10/10 on plain main; fails only in a loaded
  gate. Contention, not a product defect. #457 owns it.

---

# RESUME ANCHOR 37 — 2026-08-02 ~14:30 EDT (95% gauge)

## USER GOAL (hook): make the gate SOLID, DETERMINISTIC, hard to flake.
Gate work outranks feature work.

## #459 — ONE failure left, fix in flight
`/tmp/gate-459b.log` GATE_EXIT=1 with exactly ONE red:
coverage ratchet. All six round-4 smokes now PASS.
```
coverage declaration: scripts/harness/smoke-panel-split-harness.ts
project.coverage-deltas.md:41 declares 35->27 / 33->29
actual                                  35->29 / 33->31
```
Round 5 filed (`brief-459-5-tmp-brief-459-5.md`) + steered: correct it
and RE-MEASURE every declaration after the final edit (the ratchet
names only the first mismatch). When the report lands: re-gate
`/tmp/integration-459b` (merge branch + main first), then land.

### #459 root cause — my hypothesis was WRONG
Not `detachContent` promotion. The DATABASE PLUGIN registered a live
pane during boot while restore replaced spaces. Repair = a factory
seam: `PanelContentFactories` owns one factory per kind; a pane is
created only on a user Add or a saved-pane restore; restore THROWS on a
registered id with no space row. Round-4 census: 84 status-field reads,
7 stale reachability assumptions across 4 smokes.
One prized find: the phantom had been SILENTLY SATISFYING a wait in
`workspace layout isolation` — a pre-satisfied wait exposed by removal.

## Fleet
- **#457 gate determinism — PRIORITY.** Rounds 1+2 filed, no commits
  yet. Acceptance: 5 identical verdicts on one commit · verdict
  unchanged at 3 and 6 workers · planted defect red all 5 times.
  Design call: deterministic BLOCKING tier + reported CONTENTION tier.
  Round 2: gate labels must resolve (merge-gate.sh:1231 labels
  `smoke-media-harness.ts` as `animated-media harness`).
- **#451** READY at `a80c75c0`, HELD from gating on purpose so it does
  not perturb #457's measurements. Land after #457 reports.
- **#459** round 5 in flight.

## shortcut-help — sharpest evidence yet it is contention, not a bug
#459's builder ran it on plain main 10 of 10 times: PASS. It fails only
inside a loaded gate. That is #457's territory.

## Standing
- Crons DISARMED. One watcher: fleet-watch Monitor.
- Docs commits need `SKIP_GATE=1`.
- File the brief BEFORE the steer — I inverted that once today; the
  round-brief was refused for a dead link while the steer landed.
- Never dispatch a builder into a running measurement sweep.
- Sweep consumers when behaviour changes (missed on #452 AND #459).
- A 1-in-5 green looks exactly like a fixed tree.

---

# RESUME ANCHOR 36 — 2026-08-02 ~14:10 EDT (90% gauge)

## USER GOAL (session hook): make the gate SOLID, DETERMINISTIC, hard to flake.
Gate work outranks feature work. The user said gate fixes affect
everything downstream.

## Fleet — 3 builders live

- **#457 GATE DETERMINISM — THE PRIORITY.** Dispatched with a rewritten
  brief. Deliverable is a PROPERTY: the gate's verdict is a function of
  the commit alone. Acceptance = (1) five consecutive runs on one commit
  give five identical verdicts; (2) verdict unchanged at 3 AND 6
  workers; (3) a planted defect goes red all five times (guards against
  determinism-by-deleting-coverage). Key design call in the brief:
  a deterministic BLOCKING tier plus a deliberately-loaded CONTENTION
  tier that is reported, never blocking. `shortcut-help` is its open
  defect (self-generated output, no convergence cover).
  Its task FILE NAME is stale (`serial-tail-lacks-quiet-retry`) — the
  original premise was FALSE, the tail does retry. Body is rewritten.
- **#459** panels — gated RED (`/tmp/gate-459.log`, GATE_EXIT=1, six
  failures). Round 4 filed+steered: mechanical CONSUMER CENSUS, not six
  patches. Two reds are consumers of removed behaviour (panel-split
  wants the deleted confirm dialog; settings-applied expects the
  phantom `agent,terminal,database` registration). Two need A/B
  (workspace-tabs, tasks). shortcut-help is the #457 flake.
- **#451** ffmpeg statics — READY, unread, ungated.

## Contract records ACCEPTED + committed to main (not yet gated)
`Every registered panel content is reachable` (ui.invariants.md) and
`One dialog component serves confirms and prompts` Scope refined to
`panel-container close` (design.invariants.md).

## Flake numbers (measured, do not re-derive)
Baseline `9f158472`: 1 green/5. After #436 convergence fix `c5dc3057`:
**4 green/5**; `terminal harness` 2/5 -> **0/5**; `shortcut-help`
2/5 -> 1/5. Pre-landing sweep proved both INHERITED.

## Standing
- Crons DISARMED. Never re-arm. One watcher: fleet-watch Monitor.
- Docs commits need `SKIP_GATE=1`.
- Never dispatch a builder into a running measurement sweep.
- A 1-in-5 green looks exactly like a fixed tree.
- Sweep consumers when behaviour changes — missed twice in two days
  (#452, #459).

---

# RESUME ANCHOR 35 — 2026-08-02 ~13:45 EDT (85% gauge, CHECKPOINT)

## #459 — gated RED, NOT landed. Round 4 filed and steered.

`/tmp/gate-459.log` on `/tmp/integration-459b` (branch tip `b428610e`
merged as `2a604c63`): SIX failures.

```
workspace tabs · workspace layout isolation · panel-split ·
tasks · settings-applied · shortcut-help
```
Logs: `/tmp/merge-gate-failures.90a0c83739b4887b.859565/`.

**Two are CONSUMERS of behaviour the user deliberately removed:**
- `panel-split` waits for "terminal frame close opens the generic
  confirmation dialog" — the dialog is gone by user ruling.
- `settings-applied` expects
  `panelContentKinds==='agent,terminal,database'` with one cell — that
  IS the phantom registration the new record forbids.
**Two need an A/B** (workspace-tabs, tasks). **shortcut-help is the
known #457 flake** (1-2 of 5 on unchanged commits).

Round 4 orders a mechanical CONSUMER CENSUS, not six patches — same
shape as #452 two days ago.

## Contract records ACCEPTED by the user and COMMITTED to main

- `Every registered panel content is reachable` (src/modules/ui/ui.invariants.md)
  — new; Impossible-if-true names a registration absent from every
  space. Evidence cites probe-459-empty-dock.ts.
- `One dialog component serves confirms and prompts` (design.invariants.md)
  — Scope refined `terminal-instance close` -> `panel-container close`,
  plus the blast-radius rule.
Both PASS the checker. NOT yet gated (added after the gate started).

## Flake verification — ANSWERED

Baseline `9f158472`: 1 green / 5. After the #436 convergence fix,
`c5dc3057`: **4 green / 5**. `terminal harness` **2/5 -> 0/5**.
`shortcut-help` 2/5 -> 1/5 (untouched, real, #457).
Measured with a builder live, so the bias ran AGAINST the fix.

## Open

- #459 round 4 in flight (builder live, session invar/459-...).
- #457 rewritten; HOLD until the machine is quiet — its job is
  measuring contention. `shortcut-help` is its open defect.
- #458 all-terminals-dead-after-idle: still unexplained, do not close.
- Queue safe to run beside #459: #445, #446, #451.
  Do NOT run beside it: #453-456, #447 (same surfaces).

## Standing

- Crons DISARMED by user order. Never re-arm.
- One watcher: `Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)`.
- Docs commits need `SKIP_GATE=1`.
- Never dispatch a builder into a running measurement sweep.
- A 1-in-5 green looks exactly like a fixed tree.

---

# RESUME ANCHOR 34 — 2026-08-02 ~13:15 EDT (81% gauge)

## Landed
`334add87` #442 · `61fd213e` #444 · `da584da4` #452 — gated on
`/tmp/gate-stack5.log` GATE_EXIT=0. NOTE: that green was a 1-in-5 draw,
not a fixed tree. Landing stands (pre-landing sweep proved the reds
were inherited), but never cite it as proof of a clean tree.

## The flake measurement — the session's main result

Five gates, ONE unchanged commit, 6 workers. Baseline `9f158472`:
**4 red / 1 green**; `terminal harness` 2/5, `shortcut-help` 2/5.
Pre-landing `eadbae0d`, 3 gates: `terminal` 1/3 — so INHERITED, not
shipped by the landing.

**After the #436 fix, commit `c5dc3057`: 4 green / 1 red.**
`terminal harness` **2/5 -> 0/5**. `shortcut-help` 2/5 -> 1/5 (untouched,
still real). Measured WITH #459's builder live, so the load bias runs
AGAINST the fix — the improvement is conservative.

## What was fixed and why (#436)

The `tasks:watch` assertion demanded a foreign process's repaint never
appear incomplete. `tasks:watch` clears then redraws without
synchronized markers, so Invar cannot make it atomic. Now asserts
CONVERGENCE: trailing blank frames must be zero; longest transient run
is reported, never gated. Both arms proven by plant.
New record: `Atomicity is claimed only for self-generated output`
(scripts/harness/harness.invariants.md). It also predicts which of the
remaining flake tasks are overclaims — any whose failure is an
incomplete intermediate state in FOREIGN output.

## Open

- **#459** — READY, branch `b428610e`, NOT gated, NOT landed. Report has
  9 sections incl. Bycatch. User rulings: Database pane is user-visible
  and outranks the rest; empty state shows "Add terminal"; **no confirm
  on instance close, EVER** (incl. foreground process); containers keep
  a dialog carrying the instance count.
- **#457** — rewritten; its original premise (serial tail lacks retry)
  was FALSE — the tail does retry. Remaining: `shortcut-help` (self-
  generated output, no convergence cover), the timing-classification
  matcher blind spot, per-run verdict recording. HOLD until the machine
  is quiet; its whole job is measuring contention.
- **#458** — the all-terminals-dead-after-idle incident. Still
  unexplained. Do not close quietly.
- Queue, non-conflicting with panels/gate: #445, #446, #451.
  Same-surface, do NOT run beside #459/#457: #453-456, #447.

## Standing

- Crons DISARMED by user order. Never re-arm.
- One watcher: `Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)`.
- Docs commits need `SKIP_GATE=1` — a plain commit launches a gate.
- Never dispatch a builder into a running measurement sweep; I
  contaminated my own verification once today by doing exactly that.

---

# RESUME ANCHOR 33 — 2026-08-01 ~20:30 EDT (100% gauge)

## Stack gate 2 — READ FROM LOG (`/tmp/gate-stack2.log`)

Tree `/tmp/integration-stack2` = main + `fleet/452-pane-identity-collides-by-name`
tip **`a94eb89f Fix pane identity consumers`** (the ROUND 4 fix; the
branch carries #442 and #444 too). Merge commit `619bfa21`.
Gate was still in the serial tail when this was written; no
`GATE_EXIT=` line yet. **Re-read the sentinel from the log before any
landing — never infer it from a wrapper's exit code.**

**The real regression from gate 1 is GONE.** `smoke-clipboard-frame-boundary`
no longer fails, so #452 round 4's kind-string consumer sweep worked.

**Four reds present, all suspected pre-existing/unrelated — each MUST be
A/B'd against main before blame is assigned:**

| red | filed as |
|---|---|
| `smoke: scrollbars harness` | #453 diff scrollbar thumb |
| `smoke: agent-pane-ux harness` | #454 / #455 (agent pane) |
| `smoke: agent-cancel harness` | NOT YET A/B'd — may be new |
| `smoke: keyboard invariant` | NOT YET A/B'd — may be new |

Failure logs: `/tmp/merge-gate-failures.e9f209f2f8469ed2.3934161/`.

## Next actions, in order

1. Wait for `GATE_EXIT=` in `/tmp/gate-stack2.log`.
2. A/B **agent-cancel** and **keyboard invariant** on plain main. If
   they fail on main too, they are pre-existing; file them and land
   with a WRITTEN `GATE_OVERRIDE` naming all four. If either passes on
   main, it is stack-caused — brief #452 round 5, do NOT land.
3. #452's READY report (round 4) is delivered and unread — read
   `## Bycatch` and convert BEFORE merging.
4. Land serially from the MAIN checkout: #442 → #444 → #452, each with
   `GATE_LOG=/tmp/gate-stack2.log BYCATCH_TRIAGED=1`.
5. #452's open question STANDS: neither fix explains the user's
   original all-terminals-dead incident. Do not close it quietly.

## Standing state

- Crons DISARMED by user order. Never re-arm.
- The one watcher: `Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)`.
- Queue after the stack lands: #445, #446, #447, #450, #451, #453, #454, #455, #456.
- Two corrections I owe the record: the tab dirty dot was NEVER lost
  (broken checker, working product); my OpenPty identity theory was
  REFUTED by measurement.
- Tasks stay markdown. User ruled against SQLite.

---

# RESUME ANCHOR 32 — 2026-08-01 ~19:15 EDT (97% gauge)

## Stack gate verdict — READ FROM LOG

`/tmp/gate-stack-final.log` → **GATE_EXIT=1**, six reds on
`main + #442 + #444 + #452` (branch `fleet/452-pane-identity-collides-by-name`
tip `4222e760`, tree `/tmp/integration-stack`).

**ONE red is a real regression, A/B proven:**
`smoke-clipboard-frame-boundary-harness.ts` is ALL-PASS on main and
fails on the stack with `error: Panel geometry unavailable for terminal`
— a lookup by the OLD kind-based id `terminal` against #452's new
opaque `pane-instance-N` ids. #452 round 4 filed + steered: enumerate
EVERY kind-string consumer (geometry, narration, status, harness
helpers), not just this one.

**Known-unrelated reds, filed as their own tasks:** #453 scrollbars
diff thumb · #454 agent-pane invalid grid region (`rows 27-2` is
inverted — suspect the region math) · #455 agent composer never
activates · #456 structure-filter focus tone. #454/#455 MIGHT share the
identity cause — #452 is told to check before assuming.

**smoke-keyboard-invariant** appeared red in the gate but there is no
such file at that path in the main checkout — resolve the real name
before judging it.

## Landing order when green

Gate the stack again → land #442, then #444, then #452, serially, with
land.sh from the MAIN checkout, GATE_LOG=<the green log>.

## Corrections I made tonight, do not re-derive

- The tab dirty dot was NEVER lost. The shared `activeTabHasDirtyMarker`
  helper read the breadcrumb row after the editor-area rewrite moved
  breadcrumbs above the tabs. I wrongly called it a user-visible
  regression. Broken checker, working product.
- My `OpenPty` identity theory for the user's terminal incident was
  REFUTED by #452. The real confirmed collision was database ids from a
  live-pane count. #452's OPEN QUESTION STANDS: neither fix explains the
  user's original all-terminal incident.

## Watcher re-arm

    Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)

CRONS REMAIN DISARMED BY USER ORDER.

# RESUME ANCHOR 31 — 2026-08-01 ~18:50 EDT (91% gauge)

## Gate verdict, read from the log

`/tmp/gate-final-444.log` → **GATE_EXIT=1**. SIX smokes failed on ONE
symptom: the active tab no longer paints its dirty dot (editor,
dirty-marker, scrollbars, agent-pane-ux, agent-cancel,
behavioral-contracts). A/B PROVEN: `bun scripts/harness/smoke-dirty-marker-harness.ts`
is ALL-PASS on main, fails on `main + #442 + #444`. Regression from
#442's TabBar/TabBarRenderer rewrite. NOT pre-existing, NOT flake.

#442 round 11 filed and steered (LANDED in its session record). It is
told to drive and look first, and to enumerate EVERY per-tab indicator
because the gate names only what it happens to cover.

## Lanes

- **#442** — round 11, fixing the dirty-dot regression. Its branch also
  carries the round-10 fixes (tooltip test, coverage declaration).
- **#444** — union with #442 complete (`9cf3817`), blocked only by
  #442's regression. Nothing wrong with #444 itself.
- **#452** — UNION DONE at merge `e05b7b61` (contains #444's `9cf3817`,
  which contains #442). The whole stack is now ONE branch:
  `fleet/452-pane-identity-collides-by-name`. It therefore also carries
  #442's dirty-dot regression — when #442's round 11 fix lands on its
  own branch, #452 must merge it, then ONE gate covers all three.
  ITS OPEN QUESTION STANDS: neither the database-id collision nor the
  OpenPty normal-close defect explains the user's original
  all-terminal incident. Do not let that be quietly closed.
- **Landed:** #443 `3d9fdca6`, #448 `eec0e5ea`.

## Landing order when green

Gate `main + #442 + #444` again → land #442, then #444. Then #452's
union tree separately.

## Mechanics hardened tonight (done, committed)

- `dispatch.sh` + `round-brief.sh` REFUSE outside the main checkout
  (`scripts/fleet/require-main-checkout.sh`, both arms self-tested).
  In dispatch the guard runs before even the brief-exists check.
- `tasks-status.ts mint <slug> [--namespace <vendor>]` — namespaces
  partition the number space; `invar` implicit; no digits and no
  trailing hyphen in a namespace.
- `tasks-status.ts contribution` — filed AND landed as a pair; only
  registered namespaces (`.invar/vendors.txt`) ranked.
- `DUPLICATE-NUMBER` drift signal.

## Watcher re-arm

    Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)

CRONS REMAIN DISARMED BY USER ORDER.

# RESUME ANCHOR 30 — 2026-08-01 ~18:40 EDT (CHECKPOINT, 85% gauge)

## Lanes

- **#442 + #444** — UNION COMPLETE on `fleet/444-history-is-editor-area-view-states`
  (merge `9cf3817`). GATING NOW: tree `/tmp/integration-final-444`,
  log `/tmp/gate-final-444.log`. Read `GATE_EXIT` FROM THE LOG. If 0,
  land #442 then #444 (serially, land.sh from the MAIN checkout).
- **#452 pane-identity-collides-by-name** — fix committed `552cf6c7`
  (opaque `pane-instance-N` ids, duplicate-ownership refusal, old-id
  migration, `OpenPty` normal-close read restart, #441's status arrays
  from one live source). Round 2 (union with #444) JUST re-steered — my
  first filing went into the wrong checkout and the builder no-opped for
  ~30 min. Its branch tip is still the pre-union commit.
- **Landed tonight:** #443 `3d9fdca6`, #448 `eec0e5ea`.

## #452's open question — DO NOT let it be closed quietly

The builder REFUTED the conductor's leading candidate (terminal restore
did not collide on that drive). It confirmed a DIFFERENT real collision
(extra database ids used the count of LIVE panes: create D2, create D3,
close D2, create another → `database-3` twice) and, separately, the
`OpenPty` normal-close defect. It states plainly that neither explains
the user's original all-terminal incident, because a new terminal owns
a fresh `OpenPty`. THAT REMAINS UNPROVEN. If the user's terminals die
again after this lands, the thread is still live with two suspects
removed.

## Queue

#445 (Ctrl+Alt+B dock) · #446 (Quick Open enumeration) · #447
(panel-drag flake) · #450 (Ctrl+P blocked by comparison focus — check
one shared cause with #445) · #451 (Ffmpeg raw anchor).

## Laws delta this session

- **Every brief's verification ends with `bun test` in FULL.** Bought by
  #442: told not to run merge-gate (correct), it ran only focused tests,
  so a full-suite red and a gate-only ratchet check reached the gate.
- **`## In plain words` required on every brief AND report** (enforced by
  dispatch.sh / round-brief.sh; stated in AGENTS.md).
- **Task numbers are MINTED, never chosen:**
  `bun scripts/tasks/tasks-status.ts mint <slug> [--namespace <vendor>]`.
  Namespaces PARTITION the space: `invar` implicit (bare numbers, zero
  migration), everyone else prefixes; no digits and no trailing hyphen in
  a namespace or `acme1234` / `fleet-194` parse wrongly.
  `tasks-status.ts contribution` reports filed AND landed as a PAIR —
  filed is cheap and local, landed counts `finished/` tags that only
  exist after a gated merge, so inflating the cheap half looks worse.
  Only REGISTERED namespaces (`.invar/vendors.txt`) are ranked.
  New drift signal: `DUPLICATE-NUMBER`.
- **Fresh integration worktrees need a real `bun install`** — a symlinked
  `node_modules` correctly fails merge-gate's dependency preflight.

## HARDENING OWED (checkpoint item, not yet done)

`round-brief.sh` and `dispatch.sh` must REFUSE to run outside the main
checkout. Tonight a `round-brief` run from inside `/tmp/integration-*`
filed a brief into that throwaway worktree; the steer pointed at a path
the builder could not see, and it silently did nothing for ~30 minutes.
A no-op is worse than an error. Same cwd-drift class that misplaced
#434's folder and a Drive.ts edit earlier.

## Watcher re-arm

    Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)

CRONS REMAIN DISARMED BY USER ORDER. Do not re-arm.

# RESUME ANCHOR 29 — 2026-08-01 ~18:00 EDT

## Fleet state

- **#452 pane-identity-collides-by-name** — BUILDING (codex 5.6-sol high).
  The user's terminal bug. Filed as an EXPERIMENT: candidate 1 is
  identity collision in `PaneRuntimes.allocateInstanceIdentity`
  (counter-based ids, in-memory count blind to restored panes,
  `TerminalPlugin.panes` keyed by `content.id` so a collision silently
  replaces a live entry); candidate 2 is `OpenPty.startMasterRead`'s
  `close` handler never restarting. Three candidates already ELIMINATED
  in the brief (runtime deadlock — UI stayed responsive; resource
  exhaustion — measured; dead child — shell alive). #441 folded in.
- **#442 panel-editor-tree-chrome-polish** — round 10, fixing two gate
  reds that reproduce on its branch alone: `FileTreePaneContent.test.ts:74`
  tooltipAt(8,0) not null, and a coverage declaration understating its
  own smoke (declared 25→16/46→49, actual 25→19/46→55).
- **#444 history-is-editor-area-view-states** — READY at merge
  `2c6fa013`, merged main clean, no conflicts. NOT gated yet.
- **Landed tonight:** #443 (`3d9fdca6`), #448 (`eec0e5ea`). Census on
  main reports `16 instance, 0 static`, exit 0.

## Next actions, in order

1. Gate #444 alone when #442 and #452 go quiet. Land it.
2. #442's fix round returns → gate → land. Then the six-hunk union in
   `smoke-navigation-history-harness.ts` between #442 and #444 must be
   resolved by whichever lands second; BOTH assertion sets survive.
3. Queue: #445 (Ctrl+Alt+B dock), #446 (Quick Open enumeration), #447
   (panel-drag flake), #450 (Ctrl+P blocked by comparison focus — check
   for one shared cause with #445), #451 (Ffmpeg raw anchor).

## Laws delta this session

- **Every brief's verification list ends with `bun test` in FULL.**
  Bought by #442: builders correctly told not to run merge-gate ran only
  focused tests, so a full-suite red and a gate-only ratchet check
  reached the gate unseen. Conductor's brief-template gap, not a builder
  failure.
- **`## In plain words` is required on every brief AND every report.**
  Enforced by `dispatch.sh` and `round-brief.sh`; stated in AGENTS.md.
- Fresh integration worktrees need a real `bun install` — a symlinked
  `node_modules` fails merge-gate's dependency preflight (correctly).

## Watcher re-arm

    Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)

CRONS REMAIN DISARMED BY USER ORDER. Do not re-arm.

# Overnight briefing — started 2026-07-29 00:28

## RESUME ANCHOR 21 — 2026-07-31 ~02:0x (written at the 86% CHECKPOINT; supersedes anchor 20)

### OPERATIVE STATE

RESUME ANCHOR 28 (2026-08-01 ~14:2x EDT — CHECKPOINT at 84%; supersedes 27. ACTIVE ui-task session, user present)

STATE (all verified on disk at write time):
- LANDED TODAY: #433 (7a33c34b — dashboard smoke isolated from host fleet state via
  INVAR_FLEET_GATE_REGISTRY; my filed diagnosis refuted twice, summary honest) and
  #435 (69886b7e — folderOpen tasks once per root; issues are notice panes; green
  gate 82 OK). Summaries written. Session archives repaired (link by COMMIT grep).
- ANCHOR 28 DELTA 3 (2026-08-01 ~16:0x EDT, 97% gauge): PLAIN WORDS ARE NOW LAW.
  dispatch.sh + round-brief.sh REFUSE a brief without '## In plain words';
  AGENTS.md requires every READY report to OPEN with it; conductor skill and
  ste-expression carry the rule plus the generation-test rationale (saying it
  plainly proves you hold the generator, not a description; plain is ADDED,
  never substituted). Both live builders steered mid-job; #443's report complied.
  MECHANICS FIX: round-brief.sh and dispatch.sh now MOVE the brief instead of
  copying — leftover copies were counted by the round tally, so #442 read rounds
  1,4,6,8,10,12,14 for seven briefs. #442 folder deduped to 7 briefs.
  #443 READY (report in its folder, commit 1e6f6dbe): five of six sites took
  ladder rung 1 (statics and Static() wrappers deleted outright, nothing outside
  read them); only Tooltip needed rung 2. NEXT: gate the combined tree and land
  (#436's terminal-harness step is the only overridable red). #442 still building
  with SIX amendments; ivue skill gained the static-read ladder section.
- ANCHOR 28 DELTA 2 (2026-08-01 ~15:2x EDT, 96% CHECKPOINT): #442 DISPATCHED and
  building — the concluded ui-task batch, 12 items + FOUR amendments, all filed as
  numbered rounds in .invar/tasks/in-progress/442-panel-editor-tree-chrome-polish/:
  base brief-442-1 (splitter crossings one generator; splitter leading space;
  toggle right padding; editor border dashes fg 8037111; reveal-button shift;
  reveal CENTERS the file in the tree viewport + same on file open; PART 2 top
  chrome: history moves to breadcrumb row leftmost with fat glyphs and padded hit
  areas, project row gets search icon + one-cell pad + panel-tone bg, breadcrumbs
  move ABOVE file tabs (Safari model, user-approved), mac Alt+[/] rebind to
  Alt+Left/Right with real escape-sequence handling).
  Amendments: (r4) reveal button shifts left ONLY while the scrollbar shows;
  (r6) toggle count single space; (r8) small digits — superscript badge on the
  toggle, SUBSCRIPT git count in place, 999 cap (user rejected a 4-cell bar,
  '3 it is'), plain digits in ASCII mode; (r10) git count one leading space and
  the git icon column must equal the files icon column in every count state.
  NEXT: read the READY report against ALL FIVE briefs, convert bycatch, merge
  main, gate, land (only #436's terminal-harness step may be overridden).
  UI batch is now CLOSED — the user concluded it; new sightings start a new batch.
  Drive gained --hover (committed 2026-08-01). Model switched to Opus 5 by user.
- #439 LANDED (delta 21:1x): ed401644, over the pre-existing #436 red
  (override written; summary in completed/). Worktree left in place dirty
  (M Drive.ts, harmless merge residue) — branch preserved as always.
  UI batch grew: item 5 = scrollbar (col 34, bg7896217) covers the reveal
  button's right space; user design: shift whole button one cell left.
  Item 6 = reveal-in-tree must CENTER the file in the tree viewport (now:
  barely scrolled in at edge), and opening a file scrolls the tree the
  same centered way. Drive gained --type and --hover (committed).
- (superseded delta) #439 READ: builder REFUTED my list-auto-close and inert-close
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
