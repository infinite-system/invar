# Overnight briefing — started 2026-07-29 00:28

## RESUME ANCHOR 3 (06:2x — supersedes ANCHOR 2; 07:0x update below)

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
