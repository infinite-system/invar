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

## RESUME ANCHOR 6 (13:0x 07-29 — pre-compaction; supersedes ANCHOR 5)

- USER IS PRESENT and rapid-firing refinements; his direction IS the
  backlog. Codex/5.6-sol for ALL builders (fable = conductor only).
- LANDED TODAY (15): #268 #238 #264 #259 #266 #263 #235 #274 #275 #282
  #288 #276 #286 #278 #287. Main GREEN. All landings need a READ verdict:
  GATE_LOG with GATE_EXIT=0 (merge-gate now stamps its own sentinel) or
  written GATE_OVERRIDE (enforcing-hook-chain: hook refuses on red +
  commit exists + report/transcript quote = legitimate).
- BUILDING NOW: #289 scroll-sync + preview scrollbars (round-2 addendum
  folded: preview pane gets bars via shared painter, gated drag);
  #273 tasks-pane cockpit (watch-parity animation via imported ramp
  tables, tmux-attach PTY, row action icons, honest fleet-extra scoping,
  show-by-default setting).
- QUEUE ORDER: #290 scrollbar corner+color parity (AFTER #289 — same
  painter seam; vertical owns bottom corner, horizontal ends at its
  edge, grey/white both axes) -> #291 state-proof task links (name is
  identity, state dir is wildcard — ONLY for .invar/tasks paths, no
  general path magic; moved-vs-dead lint split; preview paints dead
  links RED cached per revision; --fix --moved-only auto at land/
  dispatch ONLY on acted-on records, <100ms or drop it; retro-sweep
  once) -> #281 structure round two (no imports; public/private +
  $cache + override marks; getter glyph+color; inheritance line
  removed-or-setting; in-pane depth gear) -> #285 #284 #279(3 members)
  #280 #283(vue rc1->rc2) #272 #277 #265 #267 #269 #270(record-only)
  #271 #255-#258 #260-#261. WAIT FOR USER: #241 #242.
- MECHANICAL SINCE ANCHOR 5: merge-gate stamps GATE_EXIT itself (full
  runs only; aborts stay sentinel-less deliberately). land.sh:
  auto-resolves generated-view conflicts by regeneration; rename-follows
  the landing task's own active/->in-progress files; refuses other
  conflicts (exit 5) and no-MERGE_HEAD; retires worktree+session at
  landing (KEEP_WORKSPACE=1 to keep) — freed inotify (31 idle sessions
  had pinned 62/128 instances and redded pooled gates; family 3 row).
  dispatch.sh: record commits FIRST then worktree cuts FROM the record
  commit (builders born seeing in-progress/); brief snapshot before
  record move; link-lint guard (PATH-prefixed bun — bare bun refused
  clean briefs). round-brief.sh lint-guards briefs too. #288's
  lint-task-links.ts: dead links + bare refs, --fix, both-polarity
  self-test; it corrects the conductor hourly — obey its suggestions.
- NORTH STAR (user): InvarOS — portable fleet discipline, terminal-
  native moat, self-repairing editor, democratized engineer-grade PRs.
  Capsule/populate-a-repo still HELD by user.
- WATCHERS: fleet-watch Monitor + crons :07/:37 (re-arm all three on
  restart; verbatim prompts in conductor SKILL.md).

## RESUME ANCHOR 5 (09:5x — MACHINE SHUTDOWN EXPECTED; supersedes ANCHOR 4)

- User went to work ~10:0x; machine off for a while. NO NEW DISPATCHES
  ordered ("don't make any more tasks in progress").
- LANDED TODAY through #274 (0a5e2474): #268 #238 #264 #259 #266 #263
  #235 #274 — main GREEN, checkout clean at e3e290da.
- IN FLIGHT AT SHUTDOWN: #275 delivered READY (cec0e374, own enforced
  gate green) but conflicts with landed #274 in Bootstrap.ts,
  KeybindingDefaults.ts, PaneContent.interface.ts — round-2 absorb brief
  FILED (brief-275-2); land after it re-reports with the merge commit +
  post-merge smokes. #276 checkpointed honestly (WIP 1d52ca4e, not
  READY; generator links done, click-walk in progress) — resume with a
  round brief pointing at its own Checkpoint section. If either session
  died mid-step, DEAD-WITH-DIRTY procedure applies.
- QUEUED, NOT DISPATCHED (user order): #278 (dock-agnostic activity
  surface + per-pane dockSide + optional mirrored right bar — folds
  #262), #269 #270(record-only) #271 #272 #273 #277 #279 #280, #255-#258
  #260-#261 #265 #267. WAIT FOR USER: #241 #242.
- ON RESTART ARM EXACTLY THREE THINGS: fleet-watch Monitor (persistent),
  cron :07 orchestration, cron :37 sweep (verbatim prompts in conductor
  SKILL.md "Live cron prompts"). Crons are session-only and died with
  the machine.
- land.sh since 6d3bad3b auto-resolves generated-view conflicts by
  regeneration; refuses real conflicts (exit 5). Verdict guard: GATE_LOG
  with GATE_EXIT=0 or written GATE_OVERRIDE, always.

## RESUME ANCHOR 4 (08:0x — supersedes ANCHOR 3)

- THE #237/#238 WAVE IS FULLY LANDED, MAIN GREEN: #268 → 5c9965a4,
  #238 → 578b728a (154m, three rounds: build → absorb-main conflict
  resolution → seven-smoke default-ON adaptation + file grammar). All
  landings on READ verdicts (GATE_LOG). Sessions archived (both claude
  session-links needed the by-timestamp repair — recurring defect,
  UNRESOLVED at dispatch for claude engine; fix candidate: a task).
- FLEET NOW: #264 (boot-save settings ERASER, data loss, codex·sol·high)
  and #259 (right-dock double-focus click, codex·sol·high) BUILDING.
  NOTE: a codex pane's bottom line always shows the placeholder composer —
  scrollback is where the work shows; do not misread idle-looking panes.
- QUEUE after a lane frees: #235 (tasks dashboard pane; PTY-widget interim
  per user), #269 (geometry-assuming smokes sweep), #270 (preview one
  revision behind source vs record), #263 #265 #266 #267 #255-#258
  #260-#262. WAIT FOR USER: #241, #242.
- Gate scratch tree /tmp/gate-tree-268-238 reusable (reset+merge).

## RESUME ANCHOR 3 (06:2x — superseded by ANCHOR 4)

- 07:0x: MAIN IS GREEN AGAIN — #268 landed 5c9965a4 (gate
  /tmp/gate-268-only.log GATE_EXIT=0, read). The COMBINED gate with #238
  ran RED first: #238's structure default-ON breaks SIX smokes' geometry
  (the #237-auto-open class, fleet-wide) + 2 enforced file-grammar
  violations in MarkdownStructureSource.ts. #238 is on ROUND 3 with the
  failure logs (/tmp/merge-gate-failures.2898354/) and the
  measure-don't-assume doctrine; its round ends with its OWN full
  merge-gate green. On #238 READY: gate main+#238, land with GATE_LOG.
  Near-miss recorded (family 10): a `;`-separated merge slipped into main
  when `worktree add main` failed (needed --detach) — caught in seconds,
  reset --keep; a destructive step never follows `;`. Gate scratch tree
  lives at /tmp/gate-tree-268-238 (reusable via reset+merge).

- MAIN IS RED at d42f2af0..afc6eecf: I landed #237 over GATE_EXIT=1 (the
  wrapper exit I chained behind was an echo's, not the gate's — family 3
  row added). The red: `smoke-editor-harness` wrap-off rows, displaced by
  #237's auto-open preview narrowing the editor under the smoke's
  full-width assumptions. #268 DISPATCHED (claude/fable, live) to fix the
  smoke under real defaults — expectations derive from the viewport, or
  non-md fixture; never weaken wrap-off, never disable auto-open.
- GUARD LANDED (06d2709e): land.sh REFUSES without a READ verdict —
  GATE_LOG must contain GATE_EXIT=0, or GATE_OVERRIDE='<written reason>';
  exit 6. All four arms probe-tested. dispatch.sh also fixed (afc6eecf):
  brief snapshot before the record move (pre-filed briefs live INSIDE the
  active/ folder; the git mv relocated them before the worktree cp — bit
  twice on #268; two zero-commit half-cut branches parked as
  orphaned/268-halfcut-predispatch{,-2,-3}).
- #238 round 2 FILED + steered (round-brief.sh): merge main into its
  branch, self-resolve the 3-file conflict with #237 (MarkdownWorkspace.ts
  + test + manifest smoke), full smokes green, out-of-scope: #268's red.
- ON #268 READY: gate main+#268, land with GATE_LOG. ON #238 READY (after
  #268 lands): gate main+#238, land. Then dispatch next lanes: #264
  (settings ERASER, data loss), #259 (double-focus click), #235 (tasks
  dashboard, PTY-widget interim per user). #241/#242 WAIT FOR USER.
- Armed at 06:2x: fleet-watch Monitor re-armed (prior one died exit 2),
  crons :07 + :37 verified live.

## RESUME ANCHOR 2 (04:3x — superseded by ANCHOR 3)

- FLEET: #233 and #35 READY round 2; gate 2 running on the combined tree
  (main+#233+#35 incl. 215724d1). On green: land #233 then #35 via land.sh,
  then dispatch #245 (provider seam + database proof, BEFORE #238 — both
  touch structure/) alongside #243 and the markdown wave #236/#237; #235
  after. #244 LANDED (c44c23db): lazy SDK import; extraction count stayed 0
  through a full gate. If completion smoke reds again: capture the failing
  status.json tail from the gate failure log; #35's builder needs it, or it
  routes to #233's tui-harness env.
- ON RESTART ARM EXACTLY THREE THINGS (user simplified 05:2x, "less is
  more"): (1) fleet-watch Monitor (persistent, event-driven); (2) the
  HOURLY ORCHESTRATION cron `7 * * * *`; (3) the hourly RECONCILIATION
  SWEEP cron `37 * * * *` — two clock fires per hour, thirty minutes
  apart. Verbatim prompts + the re-arm list live in conductor SKILL.md
  `## Live cron prompts`. The /loop ScheduleWakeup chain and the 30-min
  sweep cadence are RETIRED — do not re-arm them.
- PROTOCOL (all mechanical, user-directed tonight): (1) dispatch REFUSES
  without fleet-watch's heartbeat (arm: Monitor bash
  scripts/fleet/fleet-watch.sh, persistent — ONE watcher, idempotent);
  (2) SPRAWL sentinel inside fleet-watch: floor 10G, 600MB/cycle,
  2G/5m window, +300 entries/cycle; ANALYZES, never deletes — kill the
  growth source, delete only owned patterns; (3) rounds: round-brief.sh
  files + stamps before any steer — A BRIEF IS A CONTRACT with a
  mechanically checkable end state; (4) gate logs register in
  /tmp/fleet-watch-gates (rm the log before a rerun so the watch timer is
  true); (5) interim SDK reaper pid in /tmp/sdk-reaper.pid — retire it
  after one more clean gate.
- Decisions taken by the user tonight: #245 = OPEN the provider seam
  (phone-book shape, consumer-owned interfaces, #223 folded in as proof).
  Still his: #241, #242. Rescued scratches in .invar/rescue (ShortcutsView
  may be unlanded work).

## RESUME ANCHOR (written at 02:26 before context compaction)

- FLEET: #35 (structure navigator, THE PROOF, fable·medium, ~35m) and #233
  (settings-leak diagnosis, sol·high, ~33m) BUILDING. #243 (sibling rot round
  2) queued next free lane. fleet-watch monitor + /loop wakeup armed; re-arm
  fleet-watch (Monitor: bash scripts/fleet/fleet-watch.sh, persistent) and the
  /loop on resume if missing.
- ON #35 READY: zero-host-edit done-test is the point; gate combined tree,
  land via land.sh (BYCATCH_TRIAGED=1 after converting), then dispatch #238 /
  #235 (user roadmap: structure default+TOC, tasks dashboard) and the
  markdown wave #236/#237. #223 + decisions #241/#242 WAIT FOR USER.
- ON #233 READY: it is the gate blocker (wrap contract red on main; user's
  real settings.json had wordWrap:false written 01:29 — never edit their
  file).
- TOOLING TONIGHT: land.sh (step 5 one command, timing into meta.json),
  fleet-watch, tasks:live/active/done/all/watch (30fps, breathing gradient
  dot, shimmer 'building', per-builder line deltas, rolling odometer numbers,
  fade pops, flyweight mtime-gated reads). UNVERIFIED: watch showed
  'tonight +3,000' once — possibly a tween artifact vs real growth; check
  fleetDeltaTotals math against per-task rows on resume.
- POLICY: sol high always; fable/opus medium (high only explicit); dispatch
  transmits flags; briefs REQUIRE '## Invariants in scope' + '## Bycatch
  expected' (guard enforces); reports born in task folders; archive at land.
- Landed tonight: #59 #211 #174 #202 #114 #46 #122 #218 #216 #219 #221 #222
  #220(capstone) #230(ui lattice) #239 #215. Read project.tasks.md for lens
  commands; bun run tasks gives counts+drift.

Written for your return. Latest entries at the top of the log section. #223
(database plugin) is parked for you, per your instruction.

## Standing state at the moment you left

- Landed today: #59, #211, #174, #202, #114 (Wave B), #46, #122, #218.
- Building: #219 (PaneContent retrofit — the hard capstone step), #222
  (provider-seam analysis, documents only), #216 (drive on-ramp — instrument,
  dispatched first under your pyramid rule: it is the floor of every
  builder's inner loop).
- Parked for you: #223 (database plugin proves the provider seam).
- Commands: `bun run tasks:live` / `tasks:active` / `tasks:done`.

## The plan I am following

Bottom-up by fundamentality:

1. Instruments and verification integrity (#216, then #215, #221, #182, #90,
   #105, #183, #190 as lanes free up) — everything above them inherits their
   truth.
2. The capstone chain (#219 → #220) as its builders deliver.
3. Flake-evidence and performance tasks after the instruments they depend on.
4. #35 only after #220 (it is the proof, and proof runs last).
5. #223 waits for you.

Gate discipline unchanged: combined trees, serial landings, bycatch converted
before merge, session archived at land.

## Log (latest first)

- 05:4x — FOUR LANDINGS ON ONE CLEAN GREEN (75 OK, zero retries). #245
  b2bd2e57: ONE host provider registry (census-proven), SQLite + fake +
  consumer proof, both old rendezvous deleted — your seam decision built.
  #236 06580a9f: the markdown stylesheet — padding, quote bars, held code
  frames, CJK-safe wrapping, all through one census-proven seam. #254
  93bd4c2c: the workers guard joined the gate preflight (violation
  reproduced first). #253 ad6abff4: every ui citation verified (244
  fields, table in the report), checker now REFUSES short paths repo-wide.
  All four sessions archived. Bycatch filed: #255 (wrapped label breaks
  row locator), #256 (emoji spacer glyph), #257 (last-row border cell),
  #258 (list-joiner third re-roll). NOW BUILDING: #237 (preview left +
  auto-open) and #238 (structure default-on right + markdown TOC) — your
  reading-is-the-new-writing wave, both on the fresh seams. Loop economy
  simplified per your "less is more": fleet-watch events + :07
  orchestration + :37 sweep, nothing else. Landed tonight: 25.

- 04:5x — THE PROOF IS ON MAIN. Gate 3 GREEN (75 OK; one git-watch
  retry-flake noted). #233 landed 3a1172c0 (145m): the wrap red was the
  instrument, your settings file exonerated by hash. #35 landed 986ae1c2
  (147m): the structure navigator, zero host edits, the modularity campaign
  proven end to end. Gates 1-2's completion/behavioral "interaction" reds
  were MY artifact: a hand-rolled scratch tree with an EMPTY node_modules —
  Bun auto-install masked it for 57 steps while unlinked provider binaries
  broke the two real-LSP arms; #251 filed (the gate must refuse an unlinked
  tree), #252 filed (pre-satisfied waits the round-2 control exposed).
  Interim SDK reaper retired: #244's app-owned cleanup held at ZERO
  extractions across three full gates. NEW WAVE BUILDING: #245 (provider
  seam + database proof, codex), #243 (contract rot round two, codex),
  #236 (markdown stylesheet, fable). #238 queues behind #245; #237/#235
  next lanes. Sessions archived for #244 and #35 (raw JSONL beside pane
  transcripts). Landed tonight now 19.

- 03:1x — THE SPRAWL SENTINEL IS MECHANICAL (your directive, encoded).
  fleet-watch gained the SPRAWL arm (floor <10G, fill >600MB/cycle + sustained >2G/5min-window — calibrated
  against the leak's measured 1.3G/cycle — entry surge >300/cycle, 5m
  throttle, top growers named in the event) plus a per-cycle heartbeat;
  dispatch.sh now REFUSES to launch a builder while the heartbeat is stale
  (>3m; SENTINEL_ACK=1 is the deliberate exception). Idempotent by
  construction — one watcher, watch set derived from disk, re-arming never
  duplicates. Your second constraint encoded everywhere: the sentinel
  ANALYZES and never deletes; kill the growth source; delete only owned
  patterns. Self-test: five sprawl arms + both dispatch polarities green.
  Encoded for cold start in conductor SKILL.md, project.conductor.md §10,
  AGENTS.md scratch section. Also this hour: you ordered #244 FIRST — gate
  aborted, #244 dispatched (codex) and steered with the measured diagnosis:
  the extraction is IMPORT-TIME (SdkStreamBackend.ts:31 static import loads
  at every boot; the spawned process exits instantly — nothing ever used it).
  On its READY: land #244, then ONE combined gate (its fix makes the gate
  safe by construction), then land #233 and #35, then #243 + roadmap.

- 02:5x — THE DISK INCIDENT + BOTH PROOFS READY. #233 READY: your settings
  file was NEVER leaked into (sha unchanged; the 01:29 write was your own
  interactive app boot rewriting the snapshot) — the contract red was tmux
  geometry (`window-size latest` gave 256x54 for a 120x40 request) plus a
  settle race; harness-only fix, wrap contract now green at scrollTop=569.
  #35 READY AND THE PROOF PASSED: the structure navigator landed with a
  ZERO-LINE diff over ui/app/workspace — the capstone's claim survives its
  first citizen. During their batch gate the root disk hit 100% (13MB free):
  every app boot extracts a fresh ~200MB claude-agent-sdk binary into hidden
  /tmp dirs, never reaped — ~13G by 02:40. You were briefly up, saw the app
  spawn it at boot, and decided the fix: LAZY — nothing spawns until the
  agent pane is actually used (#244, dispatches first after landing).
  Recovered ~40G total (SDK dirs + caches + 24 retired /tmp worktrees, their
  scratches swept into .invar/rescue — ShortcutsView.ts may be unlanded
  work). Filed #244-#250 (leak, provider-seam decision for you, four
  distill/hygiene bycatch). Poisoned gate aborted by the abort test; clean
  gate rerunning with an interim extraction reaper armed. (c669256f): ui.lattice.md, all 61 records woven,
  77->217 resolved links, five generators + three recurring shapes + eight
  compositions. Its bycatch ran the full new taxonomy: six findings ->
  #239 (citation repairs, DISPATCHED into the freed lane), #240 (Momentum
  record placement), #241/#242 (Engine: user decision tasks for you: split
  ui.invariants along the lattice families? promote the shared paint-and-hit
  rule to a project record?). tasks:watch shipped (spinners on motion, READY
  still, ticking durations); #235 names the CLI lenses as its primitive per
  your instruction. Building: #35 (proof), #233 (leak), #239 (repairs).

- 02:1x — THE CAPSTONE LANDED (#220 -> 219f160a, 53m). The modularity umbrella
  is complete: git, filetree, markdown, LSP, terminal, text primitives, and
  the editor itself — uninstallable, reversible, honest censuses. Its report
  found the FOURTH VERSE: a rule living only in the fact that nobody had ever
  run the code (#219's release path passed its tests and was wrong; the
  reinstall arm caught it). Gate red classified PRE-EXISTING -> #233 (your
  real settings.json was written at 01:29 by something, wordWrap:false leaks
  into the wrap contract; isolated-arm evidence in the task; I did NOT touch
  your settings file). Landed over it under the narrow rule. NOW RUNNING:
  #35 (THE PROOF — structure navigator, zero host edits allowed), #230 (ui
  lattice), #233 (settings leak, sol high). YOUR ROADMAP FILED: #235 (tasks
  dashboard pane with cycling overview), #236 (markdown terminal stylesheet),
  #237 (preview left + auto-open), #238 (structure default-on right + md
  TOC) — all sequenced after #35 per your ordering. Also: #234 (navigation
  getters + hop ratchet) filed; land.sh learned claude sessions; dispatch's
  read_field silent-death fixed (4th member of that class tonight).

- 01:5x — USER CAUGHT A REAL ONE from a tmux footer: claude builders ran at
  MEDIUM effort all night while task files said high — the assignment was
  enforced at dispatch but never transmitted (no --model/--effort flags).
  Fixed: dispatch now passes verified aliases (opus-5->opus, fable-5->fable;
  the -5 forms are invalid CLI aliases) and --effort / model_reasoning_effort.
  Codex was already high via your config. My tasks:live lens had displayed
  the declared field as runtime fact — family 3, mine. #220 allowed to finish
  at medium (its four predecessors delivered the whole capstone chain at
  medium and passed everything — worth knowing when calibrating effort).

- 01:4x — #215 LANDED via land.sh's first live run (7968d49f, 17m recorded in
  meta.json). Claude sends now confirm from the composer FRAME — structure
  printed words cannot impersonate; both polarities proven; dispatch waits
  15s for the cwd-derived session file. Bycatch → #231 (three agent-tmux
  launch/list defects, incl. `list` broken under the production prefix all
  along — nothing calls it, which is its own finding). Lenses got colour,
  icons, durations + `bun run tasks:all`. #220 still building the capstone
  final — and it is already committing scratch tooling into its task folder
  (drive-220-smoke-set.sh): the durable-workspace doctrine's first sighting.

- 01:3x — Your late-night refinements, all mechanical now: (1) every brief
  MUST carry `## Invariants in scope` + `## Bycatch expected` — dispatch.sh
  refuses to launch without them (both guard arms proven); (2) bycatch
  taxonomy grew to seven categories (runtime, invariant violations, comment
  drift, distillation possibilities, generator drift, plain nonsense,
  contract-layer gaps); (3) #230 filed for ui.lattice.md (after #220);
  (4) #221 landed (2bd6790): the uncited record was subsumed, folded with a
  pointer, lattice 67->77; (5) durations everywhere — tasks:live shows
  running time, tasks:done shows dispatch-to-landing, and land.sh (modernized
  from the old generation, guards kept) records landedAt + durationMinutes +
  mergeCommit into meta.json mechanically and kills the State-line sed class.

- 01:1x-01:2x — batch gate CLEAN GREEN, zero retries. #216 landed (03b61df:
  degraded enumeration, on-ramp in system temp) and #219 landed (43b6002: the
  editor is a PaneContent citizen via native-surface; the paint-then-selection
  order rule became a tested invariant; fingerprints unchanged at all scales).
  #219's boundaries filed as #228 (keyboard routing) and #229 (scale-parity
  selection smoke). New wave dispatched at cap: #220 (capstone final —
  manifest + uninstall symmetry, claude), #215 (send-confirm false negative,
  codex), #221 (uncited view-state invariant, codex). All three session links
  resolved. Capstone status: after #220 lands, #35 becomes the proof task.

- 01:1x — #222 landed docs-only (a666159). Its analysis corrected the brief
  twice (Momentum impure, Processes unneeded) and shrank #223's conversion to
  3 files. Bycatch filed: #224 (Momentum ambient clock), #225 (rotted system
  contract), #226 (Clock.freeze deletion + first getter conversion), #227
  (dispatch cuts worktree after record commit — the rename wrinkle from this
  landing). The task-folder-as-durable-workspace pattern is now doctrine in
  manage-tasks. Recovery note: concluding the conflicted merge without
  SKIP_GATE fired a hook gate beside a live builder; killed by pid via cwd; my
  own pgrep then self-matched (family 2) before I read the enumeration.
- 00:52 — #216 READY and clean: Quick Open now publishes `degraded` instead of
  a false `complete` on an empty fallback; the drive scratch workspace moved
  out of the ignored path; both positive controls demonstrated red. The
  builder caught that codex's own environment ships ripgrep and reproduced by
  PATH surgery. One-sighting (#122's Ctrl+P key drop) probed 3x, no repro,
  parked. HELD for the batch gate — #219 is mid-verification and a gate now
  would contend with it.

- 00:28 — #216 dispatched (codex). Session link resolved late (codex creates
  its rollout lazily; the in-dispatch check fires too early — known wrinkle,
  folded into #215's scope). Briefing file created.

---

## RESUME ANCHOR 7 — 2026-07-29 ~15:5x (post-#289 landing batch; context 57%)

USER PRESENT earlier (lunch return unknown). Codex/5.6-sol default; fable = conductor only. Context window now 400k (user reduced it; track via ibr scripts/context-usage.sh — anchor BEFORE 85%).

LANDED TODAY (21): anchor-6's 15, then #273 cockpit (6ad6acc6, 41m), #291 state-proof links (41aa3654, 55m), #279 drive settle (bfa860d8, 13m), #281 structure round-2 (35151464, 79m), #265 status-keys-absent (eb4879b0, 18m), #289 scroll-sync+preview-bars (7c65b3e8, 163m). Main GREEN at 805e0d77.

BUILDING NOW: #290 scrollbar corner+color parity (painter seam; #284 queued BEHIND it, same seam — coordinate note in brief); #285 preview last-row hit-test (markdown seam; must reproduce against current main first; removes #276's extra-scroll workaround as the tell).

QUEUE: #284 (after #290) -> #280 (comment drift; now holds Workspace.ts + PaneContent folds) -> #283 vue rc2 (deps; prefer solo lane) -> #272 (record system; holds 316-bare-refs fold) -> #277, #267, #269, #270 (record-only), #271 (session-link UNRESOLVED recurring — EVERY landing today needed by-hand rollout repair), #255-#258, #260-#262, #266?no—landed, #292 (NEW: drive action status waits for painted target; bycatch of #278 via #279; possibly-related note re #281's gear red was RESOLVED as glyph collision — treat #292 standalone). WAIT FOR USER: #241, #242; capsule HELD.

MECHANICAL SINCE ANCHOR 6:
- land.sh/dispatch.sh now run #291's lint --fix --moved-only on acted-on records (14ms).
- steer.sh (72a8a63e): ALL builder messages via scripts/fleet/steer.sh — send-keys left messages unsubmitted in the codex composer twice (#289 lost a steer; #281 idle 25m). Verified delivery: spinner or composer-cleared, 5 Enter retries, loud exit 4.
- tasks-status.ts delta fix (4c43c25a): merge-base recomputed per tick; MERGE_HEAD present -> committed-only diff (user caught #289 reading +5,037 vs true +1,331).
- 4 stale worktrees retired (203/204/207/208); 200-pool + 205-flake-population left — NO completed record (numerals collide with different active tasks); user dispositions.
- inotify was 59/128 after cleanup.

VERDICT PRECEDENTS THIS SESSION: enforcing-hook-chain accepted with transcript quote + existing commit (truncated tool output OK if OK-cascade quoted); builder self-run merge-gate with last-sentinels GATE_EXIT=0 accepted; SKIP_GATE commits by builders REQUIRE conductor gate or hook re-run (bit twice: #289 round-2, #281 round-1). Gate-while-builders-live exceptions taken deliberately, written each time; red under load needs solo + main control before blame (editor-harness red -> #281's glyph collision; activitybar red -> ordinal-locator harness defect, fixed by-label in #289 round-4).

WATCHERS: fleet-watch Monitor bhf49rr8i (re-armed after exit-2 when simultaneous landings removed its watch targets — transient, script healthy); cron 86218567 :07/:37 '/loop keep going till all tasks are done'; loop = dynamic mode, no ScheduleWakeup (cron is pacer).

SESSION-LINK REPAIR RECIPE (until #271): grep -l "<commit-or-slug>" ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl -> write path into tmp/transcripts/session-link-<task>.txt -> archive-session.sh <task>.

---

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
