# Handoff — resuming the autonomous TUI build

Full authority to build the whole thing to completion (brief Definition of Done + the §5.1 gate).
Files on disk survive context compaction; this file + `project.progress.md` are the durable memory.

## RESUME ANCHOR (2026-07-27 23:35 UTC) — READ FIRST

**USER IS AWAY (walking), and authorised spinning agents.** Three builders live. Land what comes
back green; hold anything needing a feel call.

**MAIN IS RED AND UNPUSHED at `bf57bcf`.** Local main is 2 ahead of `origin/main` (`eb91b52`).
Do NOT push until `#158` resolves. `project.conductor.md` carries an uncommitted lesson.

### Live fleet — all cut from `bf57bcf`, all disjoint

| branch | task | worktree | log |
|---|---|---|---|
| `fix-glide-900-stall` | **#158** why 900ms easing hangs the smoothness instrument | `/tmp/conductor-glide900` | `/tmp/glide900-codex.log` |
| `feat-tasks-capability` | **#156** `.invar/tasks.json` + `.vscode` compat + `runOn: folderOpen` | `/tmp/conductor-tasks` | `/tmp/tasks-codex.log` |
| `design-mcp-bridge` | **#157** design: claude/codex/pi/hermes drive Invar over MCP | `/tmp/conductor-mcpdesign` | `/tmp/mcpdesign-codex.log` |

Monitors: `bkvf45yn5` (glide900), `b3sy8xf6b` (tasks + mcpdesign). Both count commits against the
RECORDED CUT `bf57bcf`, never `origin/main` — main is unpushed so that ref is stale.

### The blocking problem: #158

The user drove 150/200/300/900ms glide easing and chose **900** ("that's perfect"). 900 is committed
and preserved everywhere. It also makes `measure-scroll-smoothness` time out, reproducibly, standalone
and in-gate. Full evidence and FOUR REFUTED HYPOTHESES are in task #158 — read it before theorising,
and do not re-run the refuted four. **Never change the easing value to make the test pass**; that is
the user's feel decision.

### Landed tonight and pushed (all green through eb91b52)

`737e183` #152 glide easing mechanism · `31fef2a` rule 1.9 (`const Class` illegal, 95-file sweep) ·
`2db8f8b` rules 1.8+1.9 widened to `scripts` (the harness had escaped both) · `eb91b52` rule 1.95
(the `Static()` wrapper lives at the `$Class` anchor; exempts in-place `Reactive()`) · `c79115f`
AppleDouble exclusion (`._Foo.ts` from the Parallels mount was being read as source).

Unpushed on top: `bf57bcf` merge of **#155** — the gate's blocking verdicts are now ordering and
counts, the quiet lock is gone from the blocking path, and the millisecond series survives as a
non-blocking trend.

### Owed to the user

- **Collapse the easing constant into the glide-duration setting.** At 900 it equals the cap, so it
  is no longer an independent parameter and must not become a second setting.
- **The harness must READ the effective easing from the app's diagnostic report** instead of keeping
  its own copy — two declarations of one number, hand-synced twice tonight.
- If #158 lands on the from-rest-latency hypothesis, give the user the measured first-row latency at
  150/300/900 so they can price the trade.

## RESUME ANCHOR (2026-07-27 16:25 UTC) — SUPERSEDED by the anchor above

**USER IS AWAKE AND IN THE LOOP.** Their live direction IS the backlog — no experiments, no
autonomous scope choices. The overnight anchor below (02:20) is SUPERSEDED: it declares the user
asleep, a goal hook active, and three builders in flight. All three are finished and merged; **zero
builders are live**. It also names main `185abf9`, which is ~13 landings stale.

Main is `317e267` (`bun run drive`, #137). **Always ground-truth against git — this anchor lags
too.**

**Live thread (user-directed):** the ivue statics convention. The ivue-repo Fable settled the
**ANCHOR RULE** — a class declaring static members publishes `const $Class = Static($X)` and
everything downstream keeps extending `$Class` bare. `extends X.Class` is FORBIDDEN (an `extends`
clause is an eager snapshot of a mutable slot ⇒ load-order drift). Briefs:
`tmp/anchor-rule-brief.md`, `tmp/ivue-2.2.1-live-go-brief.md`. Our migration brief is rewritten at
`/tmp/TASK-ivue-221-migration.md` (#125) and the gate rules are #130. **An older revision of both
said the opposite about test doubles — if you read "extend X.Class, safe as of 2.2.1" anywhere, it
is stale.**

**In flight:** #149 (`fix-scheduling-bound-contracts` in `/tmp/conductor-schedbounds`) re-gating
after merging main — log `/tmp/gate-schedbounds3.log`. Its first green (`1d72df0`) was stale
because main moved under it; see the "green gate names the commit, not the branch" lesson in
`project.conductor.md`.

**Uncommitted and deliberately held** (a commit launches a gate, and a second gate invalidates the
in-flight timing measurement): `.claude/skills/conductor/SKILL.md` (gate-concurrency re-narrowing +
merge-base/stale-green doctrine) and `project.conductor.md` (this fire's lessons). Commit both once
`/tmp/gate-schedbounds3.log` shows `GATE_EXIT`.

---

## RESUME ANCHOR (2026-07-27 ~02:20) — SUPERSEDED by the anchor above; historical

USER IS ASLEEP; GOAL HOOK ACTIVE: "complete all 26 tasks one by one, off to bed". Their direction
is the queue below. NO experiments. Land only gated work (SKIP_GATE only for markdown with the
justification in the commit message, only while overlay-dialog blocks gates).

Main (LOCAL) @ `185abf9`; remote has everything through `185abf9` (push confirmed via
"Everything up-to-date" during a network window — NETWORK IS FLAPPING, DNS intermittent; a
background task retries pushes; never conclude access problems from DNS errors).

**IN FLIGHT (3 builders, at cap):**
- foldfeel r3 (`/tmp/conductor-foldfeel`, #135): glide fix rounds 1-2 ACCEPTED (bisect found
  `99f0550` ramp regression; ceiling-relative headroom envelope; defaults-first tables; sweep
  120/220/320/480 all climbing). Gate 787893 found blast radius: `scrollbars` +
  `settings-applied` smokes encode the OLD single-flick travel (envelope reserves velocity in
  flick 1). R3 brief `/tmp/TASK-glide-round3.md`: QUANTIFY the single-gesture travel change at 220
  (if >15% STOP and report — reservation fractions may need retuning, feel decision), then fix
  both smokes to honest physics (more notches, never wider timeouts), then census ALL
  wheel-consuming smokes (verification set must match a shared generator's BLAST RADIUS).
- scaleinv (`/tmp/conductor-scaleinv`, #133): RESUMED from WIP `8438514`. Scale-invariance as the
  contract: ratio ≈ 1 on COUNTS (reads-per-frame 2k == 100k), floors demoted to canaries,
  positive control plants an O(document) cost. Brief `/tmp/TASK-scale-invariance.md`.
- overlayfix (`/tmp/conductor-overlayfix`, NEW): overlay-dialog graduated from retry-flake to
  HARD RED blocking every gate — the night's bottleneck, dispatched first. Brief
  `/tmp/TASK-overlay-dialog-red.md`: reproduce by driving (~1/3 red, loop it), fix app or wait
  (never timeout), prefer count verdicts, 20 consecutive greens acceptance.

**LANDING ORDER AFTER THESE:** #125 SOLO (ivue-2.2.0 statics + SCREAMING_SNAKE; read
tmp/static-cached-getters-2.2.0-brief.md — NOTE tmp/ is now gitignored but files persist locally)
→ #99 graphics tier → #111 copyable panels → #115/#116/#119 chrome wave → #130 extend-$Class
invariant → #136 shared scale fixtures → #114 (REDEFINED: terminal-hosted agents + Invar MCP
provider + jsonl-translator switcher; wrapper = power-user tool; see task metadata) → #122 editor
capstone → #102 tables → #131 autocomplete identifiers → then the parked findings queue
(#105 unrun smokes, #108 gear mark [needs a user-facing proposal, prepare but do not change
appearance without them], #90, #94, #86, #75, #31, #35, #46, #104, #109, #124) → #59/#62 LAST.

**METHOD (Rule Zero, top of this file and AGENTS.md):** builders drive PTY first, iterate
drive→change→drive, contract after the symptom dies, suite once; scale parity (2k AND 100k);
defaults first (user settings are a second probe); feel-bisect for "used to work"; bycatch
reported, small-and-obvious fixes allowed under the four conditions; counts over clocks.

**CRONS:** hourly loop `7 * * * *` (e8d7b9dd) + sweep `11,41 * * * *` (a5e026ea) — re-arm from
the conductor skill's verbatim copies if the session restarts.

## PRIOR ANCHOR (2026-07-26 ~13:25)

Main @ `0ec98bd`, pushed, clean. Landed since the 08:55 anchor: the KEYBOARD INVARIANT (#91 Tab
indents / #93 F-keys retired with driven arrival proof / #101 pass-through, `0b7ad0a`), the PLUGIN
TAXONOMY (#103: contributor/provider/hosted-runtime, one authority per boundary contract,
`ApplicationContributor` rename, `80a1559`), and the FILE TREE AS A PLUGIN (#85, `2f28f53` — includes
the sync-flush focus-projection fix; the extraction EXPOSED a latent stale-dock bit that had been
harmless only because the old pane had no keybindingContext; the exposer is not the culprit).

**THE FLEET IS CODEX AGAIN (user, ~09:50: "use codexes from now on instead of claude sub agents" —
23% quota + a free reset; the Anthropic org spend limit is still hard-blocked for subagents).**
Dispatch pattern: brief file in /tmp, `nohup setsid codex exec --dangerously-bypass-approvals-and-sandbox
-C <worktree> "Read <brief> and execute" > /tmp/<name>-codex.log 2>&1 &`, then a Monitor keyed on
COMMIT-COUNT-OR-SILENCE (fires when `rev-list --count` reaches the target with a clean tree, or when
the log goes silent 15-20 min). The ten-minute liveness cron is still DELETED; the hourly loop plus
per-builder monitors replaced it.

**IN FLIGHT:** #100 plugin settings/keybindings contribution (`feat-plugin-manifest`,
`/tmp/conductor-manifest`, brief `/tmp/TASK-plugin-manifest.md`). Acceptance test: the repository
panel's Tab-to-leave gesture returns THROUGH the plugin-binding layer with the keybindings
source-control ratchet ≤ 13. QUEUE after it: #84 quiet lock → #97 folding → #98 inline AI →
#102 markdown tables → #59 prettier LAST. Open findings parked: #105 unrun smokes, #106 residual
~1.7 ms latency, #107 emoji width, #108 gear-mark owners, #75, #86, #90, #94, #99.

**LANDED AFTER THE FLEET DIED (b0ff3ea, conductor-verified):** both PTY bugs, which two builders found
independently and neither lived to verify.
- **Descriptor theft.** `createReadStream` closes the descriptor it holds even with `autoClose: false`,
  from an I/O THREAD. The master had two closers; the loser closed a NUMBER a later allocation already
  owned, so the victim was a different `OpenPty`. That is why `EBADF` appeared for a descriptor valid
  one synchronous statement earlier. Fix: the read stream gets a private `dup()`. Verified with
  `scripts/harness/stress-openpty-descriptors.ts` (opt-in, indexed in `project.tools.md`): **8 failures
  in 400 rounds before, 0 in 400 and 0 in 800 after.** My briefed variadic-ABI hypothesis was WRONG and
  the data refuted it — `F_GETFL` fails as often as `F_SETFL`, and it ignores the argument I blamed.
- **Keystroke latency, PARTIALLY.** `setTimeout(…, 0)` is clamped to a whole millisecond, so every
  keystroke's write waited a timer turn. Draining inline recovers **~1.2 ms**, measured paired against
  unfixed main (6.158→4.763, 5.759→4.594, 5.708→4.633, load steady ~0.5). **This does NOT restore the
  2.970 ms baseline — roughly 1.7 ms remains unexplained and #106 stays OPEN.**

**UNFINISHED, PRESERVED, NEEDS A BUILDER:** `feat-keyboard-invariant` (#91/#93/#101) at
`/tmp/conductor-keyboard`, two commits, 24 KB report at `/tmp/keyboard-invariant-READY.md`. Killed
while amending for a clean three-round verification matrix, so **its verification is INCOMPLETE — do
not land it on the strength of that report.** Note it also modified `scripts/merge-gate.sh`, unreviewed.

**NEW FLAKE, UNDIAGNOSED:** the b0ff3ea gate went ALL-PASS but `smoke: agent-permissions harness`
passed ONLY ON RETRY. Per the tally's own doctrine a retried pass is a flake, not a green. Durable lessons are in the
memory store (auto-loaded) — newest: `feedback-find-mmin-not-newermt`,
`feedback-measure-before-briefing-a-cause`, `feedback-gate-what-humans-cannot-see`,
`feedback-never-search-to-kill`.

**BOTH CRON LOOPS ARE SESSION-ONLY AND DIE ON RESTART.** Re-arm from the verbatim prompts in
`.claude/skills/conductor/SKILL.md` (hourly `7 * * * *`, ten-minute `3,13,23,...`) and VERIFY with
`CronList`. Never trust this file that they are live.

**`project.tools.md`** indexes the optional instruments (scroll smoothness, completion latency,
graphics capabilities, reactive census) with their known results and gotchas. Three builders rebuilt
measurement machinery that already existed; check that file before writing a new measurement script.
It is now referenced from `AGENTS.md` and the conductor skill, not only from here — this file is a
CURSOR and gets rewritten, so anything reachable only from here is lost at the next anchor.

**#96 IS DONE AND LANDED.** Workspace is a pure canvas: `grep -icE "diff|markdown"` returns 0 for
`Workspace.ts` and 0 across `src/modules/app`; 43 mode checks became 2 capability questions. The
plugin boundary check now also scans `src/modules/keybindings` (it held 19 plugin names while the
gate said PASS). Two bugs the extraction found, both by driving: a capability↔claim cycle, then a
claim reading the aggregate it feeds (boot-time stack overflow; unit tests missed it,
`smoke-markdown` caught it). Recorded as impossible-if-true: *a claim may not derive its occupancy
from the aggregate it feeds.*

**THE IMPORTANT OPEN THING — #106, keystroke latency roughly doubled.**
`.perf-history/input-byte-flush.ndjson` holds the evidence and nothing ever read it: p50 2.326 (07-24)
and 3.766 (07-25) against a reviewed baseline of 2.970, then TWELVE consecutive elevated samples on
07-26 at 5.3–6.2. The FAIL line is 5.940, so the new distribution straddles it and the gate's
ambient-noise retry ("a real regression fails twice") has been reading the passes as noise. A gate run
on plain `main` passed by 0.067 ms. A deliberately-quiet re-measure (load 0.49) still gave 4.219, the
lowest of the twelve and still a WARN. **Main already carries this.** Being bisected on
`fix-input-latency-regression`; paired/interleaved sampling against a fixed pre-regression reference,
because the effect (~3 ms) is the same size as what load can add and sequential sampling inverts steps.

**IN FLIGHT (three builders, at cap):**
- `feat-completion-kind-glyphs` (`/tmp/conductor-kindglyphs`) — 2 commits: kind glyphs through the one
  icon-resolution authority, plus *a mark may be shared only by owners that mean the same thing*. Also
  carries the user's 06:00 request to replace the oversized `⬢` extensions glyph (recommended `⧫`
  U+29EB — narrow by classification, solid so no thin detail to lose; `⊞` was already user-rejected and
  `❖`/`⬡` are taken by the css/wasm file icons).
- `feat-keyboard-invariant` (`/tmp/conductor-keyboard`) — #91 + #93 + #101 as one reduction: focused
  surface owns the keystroke, Tab indents, F-keys retired with driven arrival proof, pass-through table.
- `fix-input-latency-regression` (`/tmp/conductor-latency`) — #106 above.

**BRIEFED AND WAITING FOR A SLOT:** `/tmp/TASK-filetree-plugin.md` (#85). Its first question is the
real one: if the tree becomes a plugin, a zero-plugin app has an empty sidebar and no way to open a
file — so either the canvas claim is literal, or the tree splits into host-owned document-opening plus
a plugin-owned view. A reasoned "it is host furniture" is an acceptable answer.

**LANDED TONIGHT (headline):** plugin canvas with the host owning zero git names; the 65-defect harness
wait sweep; content-derived dirty marker (setter deleted); dropdown flyweight + held-key acceleration;
one painter for single-line fields (caret + three tones + word ops); marks/overview ruler; DOS-style
`..` row; glyphs `≡ ⑂ ⬢ ⌕ ⚙`; gate stop-by-identity; boundary check that can actually fail; coverage
declarations with verified counts; `project.coverage-deltas.md` rename.

**WAITING ON THE USER, not on work:**
- kitty images still need the env flag → #99 (persisted setting; no detection can rescue a silent probe)
- scroll FEEL decisions: #86 (85 ms wheel-to-frame constant) and the 45% consecutive-fling deficit —
  both measured, both pre-existing, both product calls.

**QUEUE, ordered:** #96 diff/markdown (in flight) → #103 name the three plugin kinds → #100 plugin
manifest for settings+keybindings → #85 file tree as plugin → #91 Tab belongs to the focused surface →
#93 F-key retirement (NOTE: its proposed `Ctrl+Shift+T` collides with "new tab" in most terminals) →
#101 reserved-chord set + terminal pass-through → #84 quiet lock → #97 folding → #98 inline AI edits
(depends on #91) → #102 markdown tables. #59 prettier LAST — it touches every file.

**KNOWN AND DELIBERATE:** #104 monotonicity is DEFERRED (user decision — monitor manually; trigger is
the next time a bisect is needed). Residual gate flakiness is DIFFUSE (15 smokes, 1-2 retries each),
which means a shared cause — that is #84, not fifteen defects.

## PRIOR ANCHOR (2026-07-26 ~00:40)


Main @ `7238584`, pushed, user's checkout synced. TWELVE landings overnight. The durable lessons are in
the memory store (`~/.claude/projects/-home-parallels-dev-ibr/memory/`, auto-loaded) — most importantly
`feedback-a-wait-must-be-a-condition`, `feedback-instrument-must-fail-loudly`,
`feedback-surface-the-ordering`, `reference-invar-gate-state`, `reference-openpty-blocking-write`.

**BOTH LOOPS ARE SESSION-ONLY AND DIED WITH THE RESTART.** Re-arm from the verbatim prompts in
`.claude/skills/conductor/SKILL.md` (hourly `7 * * * *`, ten-minute `3,13,23,33,43,53 * * * *`) and VERIFY
with `CronList` — never trust this file that they are live. That exact failure happened once already.

**IN FLIGHT:** `refactor-plugin-canvas-git` (#34, USER-DIRECTED) in `/tmp/conductor-ctxmenu`, brief at
`/tmp/TASK-plugin-canvas-git.md`, log `/tmp/plugincanvas-codex.log`. Had 16 files changed and no commit at
00:36. Done-test is mechanical: grep `Workspace` for git → NOTHING, then gate-enforce it. Must NOT regress
0.145 ms activation, the O(depth) ignore-query walk, the N-workspaces≠N-watchers bound, or the paint
barrier. If it needs a membrane concept, it was told to STOP and report rather than invent half of #33.

**TWO THINGS WAITING ON THE USER, both unblocked by anything else:**
1. **Image tier regression (user-reported, UNRESOLVED).** They see half-block instead of kitty/sixel in
   **cmux**. `TerminalCapabilities.detectGraphicsTier` blanket-downgrades to halfblock for ANY detected
   multiplexer even when `kitty_graphics` is true. That rule is OLD (`6503f13`), not an overnight
   regression — do not assume our changes caused it. Proposed fix: TRUST THE PROBE over the env guess,
   since a probe reply arriving THROUGH the multiplexer is evidence passthrough works; keep the halfblock
   floor only when the probe stays silent. Workaround given: `TUI_GRAPHICS_TIER=kitty`. Awaiting their run
   of `bun scripts/report-graphics-capabilities.ts` INSIDE cmux — capabilities are a property of the live
   terminal and CANNOT be observed from another shell.
2. **#68 glyph vocabulary — DECIDED, not pending.** The user reviewed every one-cell candidate per slot
   and approved: `☰` tree (U+2630), `⑂` git (U+2442), `⊞` plugins, `⚲` search (U+26B2), `⚙` settings,
   heading `+ ↗ ↙ ×`. The builder on `feat-icon-vocabulary-a` was briefed with Candidate A, whose
   `▤`/`⎇`/`⌕` are SUPERSEDED — apply the three swaps on top of its commit before landing. Full record
   with codepoints and reasoning: `/tmp/conductor-icons-approved-vocabulary.md` (copy it into the repo
   if it must survive a /tmp wipe).

**GATE:** ~2m11-2m30s (was 5m01s). Pool ~52 jobs/0m38-0m56s, tail ~4 jobs/1m23s. Known wording bug to fix:
the retry tally lists a job that retried AND STILL FAILED under "PASSED ONLY ON RETRY", because the pool
records a retry ATTEMPT rather than a success.

**LANDED OVERNIGHT:** modal occlusion (#70), breadcrumb picker (#66), workspace activation O(depth) (#78,
280 ms → 0.145 ms), overlay wheel scroll (#79), code-aware wrap (#72), icon mechanism (#68 mechanism),
OpenPty non-blocking (#81), content invariance (#76), coverage ratchet + retry tally + widened wait
invariant, two flake fixes, the classification-guard repair, and doc/lesson commits.

**NEXT, in order:** land #34 when it reports; then the image-tier fix once measured; then #80's 18 remaining
bare sleeps and the ranked flakes (mode-coherence and overlay-dialog both failed under load tonight);
then #77; #59 prettier LAST because it touches every file.

## PRIOR ANCHOR (2026-07-25 ~21:00, overnight run)

Main @ 0bfef8d. The user is ASLEEP with a standing goal: land everything, log it, reduce/distill the
lessons, make the testing gate fast, refine continuously. Two loops are armed (hourly :07 orchestration,
10-minute liveness) — VERIFY WITH `CronList`, never from a doc, and re-arm from the verbatim text in
`.claude/skills/conductor/SKILL.md` if either is missing.

LANDED THIS EVENING: #70 nothing-paints-above-a-modal (`6156999` + contract repair `47802a8`);
#66 breadcrumb segment picker with drill-in (`3a1f2d1`, which also closed the last text-input census
entry so that check is an enforced zero); the coverage RATCHET + retry TALLY + a widened harness wait
invariant (`66dbb36`, `4c31bee`, `8f6fe7b`); and two flake fixes — workspace-tabs fixture isolation
(`132e2c3`) and the editor-harness stale wait predicate (`47a6fb2`).

IN FLIGHT: `perf-workspace-activation` (#78) is GATING — builder done, rebased, conflict resolved, its
own smoke 3/3 green. `fix-overlay-wheel-scroll` (#79) has a live builder, 8 files touched including the
`ScrollableTextViewport` generator, no commit yet. `fix-output-condition-waits` is MINE and uncommitted
in `/tmp/conductor-markdown`: `PtyTestDriver.awaitOutputCondition` plus three pixel-preview sleep
conversions, written but NOT yet verified (held while a gate runs).

THE FINDING THAT SHOULD DRIVE THE NEXT SESSION: a census of every gate log on disk showed **121 runs,
97 green, 33 masked retries** — a quarter of runs carried an intermittent that `retry-once-on-timeout`
rescued, so a ~27%-flaky suite read as healthy. "Make the gate faster" is therefore mis-stated:
parallelism was never the bottleneck, TRUSTWORTHINESS was, because each flake costs a five-minute
re-run and hides itself. Ranked remaining flakes: agent-permissions 4 retries, paste 3, move-line
2 retries + 2 HARD FAILS (the fails make it the real priority), completion/tabs/layout 1 each.

Three fragility classes are now named and unwritable by invariant, and they are one defect in three
costumes — A WAIT THAT IS NOT A CONDITION: clock-bound absence windows (#76, content invariance),
predicates the pre-action state already satisfies (#80, one fixed), and bare sleeps standing in for
condition waits (#80, 21 sites censused). #76 is the single highest-value item left: all 21
quiet-serial smokes are in the serial tail ONLY because they call the silence helper and none measures
a duration, so converting absence to content invariance moves the whole tail into the parallel pool and
takes the gate from ~5 minutes toward the pool's ~1. Its brief is written at
`/tmp/TASK-content-invariance.md` and explicitly forbids the frame-ordinal design an established
invariant already rejected.

MY OWN ERRORS TONIGHT, kept on purpose so they are not repeated: a 3x overestimate of the activation
cost (the old walk already skipped leaf directories); an unsound frame-ordering design killed by
reading the invariants file BEFORE writing code; blaming contention for a red that was intrinsic (the
discriminator is a solo re-run, one minute); and a fixture "fix" that silently deleted an assertion's
precondition. Full detail in `project.tasks.md` under Corrections, and in
`~/dev/ibr/Skills/Orchestration Lessons.md`.

## PRIOR ANCHOR (2026-07-25 ~17:45)

Main @ ab5ee84. ~30 landings today, zero regressions on main.

LANDED TODAY (user-directed unless noted): extent/hscroll fixes; layout wave 1 + wave 2 (LayoutModel,
SplitterElement seam, right dock, command bar, file-tree as pane citizen); layout distillation round 2
(right-dock full-height fixed, alignment reduced to center/right with migration, 4 named presets
replacing 32 permutations); osc52 clipboard + chunked paste; GRAMMAR CAMPAIGN COMPLETE (22/22 modules
enforced, 1,662 violations -> 0, ~60 new colocated test files); scroll-feel pack (one fling profile
both axes, progressive gain, one-row floor, reversal halt-and-turn); agent word-boundary wrap +
composer padding; narration pronounceability (babble classes -> spoken stand-ins); panel UX pack
(agent's own heading, click-to-split, 45% default panel, clock+dock corner); panel chrome wave 2
(+ dropdown creating independent instances, per-region close, expand toggle, drag limit raised);
TerminalObserver waves 1+2 (OSC 133 events, bounded+redacted observation, follow modes footer control,
readTerminalScrollback); X.interface.ts convention; harness wait-discipline sweep (100 samples
converted, 388 waits labeled); overlay dialogs (resize clamp, scrollbar, OverlayCloseButton,
Escape-priority fix); LSP autocomplete via provider-neutral contract + popup hardening; agent cancel/
queue/liveness (the 2-hour spinner: backends completed turns on PIPE closure, now on PROCESS EXIT);
codex experimentalApi capability (dynamicTools was failing every codex turn); project-navigator
selection + Right-drill-in; completion paint race (one missing `.value` = main intermittently red);
thumb-breathing (OpenTUI half-cell rounding normalized at the generator); text-input primitive
(TextInputModel adopted by composer/quickopen/palette/find bar); terminal wheel scrolling with shared
momentum + SGR forwarding to alternate-screen children; agent skills (settingSources + slash
resolver); gate evidence+retry policy; GATE CONCURRENCY UNLOCK.

IN FLIGHT: feat-gate-parallel-pool (#40 worker pool + serial quiet tail); fix-harness-retention (#74
bounded byte retention + streaming audit); feat-click-outside-dismiss (gating now, timed).

OPEN QUEUE, in the order the conductor chose: #70 modal cursor + terminal-graphics occlusion;
#68 icon vocabulary (activity bar glyphs + panel control tooltips/hover/softer close); #66 breadcrumb
segment picker with drill-in; #72 code-aware wrap break opportunities; #75 await-after-terminal-action
sweep; #73 type-aware dropped-signal audit; #62 >3-args ports-object sweep; #64 follow-turn liveness
audit; #59 prettier whole-repo reformat LAST (touches every file); then architecture: #31 scoped
invalidation, #33 capsule arc, #34 plugin canvas, #35 structure navigator.

CONCURRENCY: two gates at once is now safe and MEASURED (6m04s/6m07s vs an 8m03s serial baseline).
Ceilings: inotify 128 instances, ~250MB per app, CPU binds at ~12-14 concurrent apps; the product
`gates x pool workers` is what to reason about. Landings stay SERIAL by nature (ff-only + rebase +
re-verify), so use concurrency for parallel speculative VERIFICATION, then a fast serial landing chain.


## PRIOR ANCHOR — 2026-07-24 NIGHT — DETERMINISTIC-GATE ERA; GRAMMAR BIG-BANG RUNNING

**Ground-truth against git first — anchors lag. `origin/main` was `de85916` at this writing.**

**State: the verification stack reached its final architecture today.** PTY harness = the gate
(42/42 ports, swap landed, benchmark 11m55s→~3min); emulator conformance corpus (161 tests) proves
the oracle in bun test; tmux ring RETIRED (full suite behind INVAR_FULL_TMUX=1, weekly audit);
per-gate byte-flush latency step (baseline p50 2.97ms, WARN 1.3× FAIL 2×). The waiting saga closed
FOUR defect classes, each swept suite-wide + contracted in harness.invariants.md: frame-ordinal
waits, bare next-frame waits, sample-without-wait asserts, tight wait budgets (30s defaults;
absence windows caller-specified). Doctrine hardened: quiet-machine SURVIVES the harness era
(absence windows + timeouts are time-coupled); deterministic reds are DEFECTS (never flake-cleared;
solo-green after gate-red is itself the bug report); clearance provenance; Spark calibration
(reports never evidence; one repair round-trip budgeted; conductor attention is the routed
resource). GRAMMAR BIG-BANG: FILE GRAMMAR is law (conventions doc; MANIFEST-ON-TOP superseded);
AST checker + ratchet landed (check-file-grammar.ts, CONVERTED_MODULES enforced, rest reported as
countdown from ~1,529); syntax pilot converted; waves git (Spark, repaired) + markdown (sol) built,
IN THE LANDING CHAIN tonight: timeouts-fix → wave B → wave A → terminal UX pack. TERMINAL UX PACK
BUILT (staged execution + runTerminalCommand w/ permission ladder + agent-facing tool manuals both
engines + themed prompt + live header cwd + animated typing; sanitizer strips ALL control/escape
bytes, inert by construction) — lands tonight, user waiting to try it. STAGED: switchlag+thumb
investigation (/tmp/wt-switchlag TASK.md: file-switch latency matrix incl. large TS + worktree
tabs; switch-frame byte audit; scrollbar thumb-length oscillation = suspected stale-max race).
User bugs fixed today: 5 morning + hscroll comments + narration inline-code + scrollbar gaps.
Ledger: #31 census→scoped-invalidation (post-big-bang), #33 capsule arc (workspace membranes →
message bus → console → clone-install → harness-builder; §9 vision), #34 plugin-canvas (Workspace
stops knowing Git; + separate pane wraps note), #35 structure navigator, #39 investigation.
Fleet: codex-only (sol default; Spark = mechanical small modules w/ instrument-verified delivery).
Full day ledger: ~30 landings, zero regressions on main.

## PRIOR ANCHOR — 2026-07-24 PM — FIX-TRACKS + REVIEW EXTRACTIONS + HARNESS LANDED

**Ground-truth against git first — anchors lag. `origin/main` was `271d4b3` at this writing.**

**State: all five 07-24 morning user bugs FIXED** (identity 2c2e781, scrollbars+rate 811ba62,
comment styling wrap/JSDoc 54862e4 + hscroll third path 0a9e382, plus the ad5d218 smoke-repair
lesson — see "clearance provenance" in /conductor SKILL.md). **Adopted + landed:** transcript
search with clickable ⌕ (5bd08ba). **Review extractions landed** (user-selected #13/#2/#6):
AppStatusProjection ef2d75c, Processes.spawn hermetic seam f7c020e, ReadOnlyTextBuffer fabedb9.
**PTY byte-tracking harness landed 271d4b3** (OpenPty shared seam, TerminalEmulator as oracle,
DEC 2026 marker quiescence, 3 deterministic smoke ports 3.7–17.2× faster than tmux twins, which
stay registered as the independent ring). New skill: `.claude/skills/generator-audit/SKILL.md`
(review-as-reduction procedure + substrate-uniformity rationale). **In flight:** input-latency
bisect (codex investigator, /tmp/wt-bisect, diagnosis-only brief). **Held for later (user):**
review #1 NdjsonSubprocessTransport, #7 per-surface action tables; #9 shelved. Shelf unchanged:
experiment/file-references-v1, experiment/terminal-ansi-v1. Designed, awaiting go: iv-remote
audio side-channel (narration text-forwarding + opus sample tier). Fleet policy: codex-only
dispatches (Anthropic tokens). Prior anchor below kept for history.

## PRIOR ANCHOR — 2026-07-24 AM — POST-BIG-RUN REVIEW PHASE

**Ground-truth against git first — anchors lag. `origin/main` was `95f4879` at this writing.**

**State: the 2026-07-23→24 big run is FULLY LANDED.** In one continuous session: bracketed paste +
Hex dictation (app-wide), narration fixes (Escape-only barge-in, prose-not-markdown, inline-code
speakable), voice picker + speech rate + mouse-editable sectioned settings, the whole agent-pane
rebuild (shared ScrollableTextViewport momentum scroll + selectable/copyable transcript+composer via
TextSelectionModel/WrapText seams, multi-line composer with movable cursor + word motion/deletion,
framed chrome, 19-word IBR thinking indicator, human-readable AgentToolSummary), terminal gutter
padding, Tokyo Night (accurate spec) + truecolor auto-detection, JPEG preview via ImageDecoders +
real-pixel tiers (kitty→sixel→half-block via OpenTUI capability report), interactive permission
prompts (Claude Agent SDK canUseTool y/n/a + session auto-allow) with CODEX PARITY (app-server
approvals), live claude⇄codex engine switch with transcript context port, git log tip-SHA freshness +
read-only branch viewer, AppLoader (overridable entry), namespace-pattern enforcement (hardened gate,
zero stragglers), and ALL FOUR experiments adopted (move-line, git-blame, indent-guides + indentGuide
palette role, bracket-match). Every branch parked (NEVER deleted — see AGENTS.md #6) and tagged
finished/ or orphaned/.

**Current phase (goal-hooked): verify → independent review → refine.** Three independent codex
reviewers (correctness / architecture-seams / perf+docs) run against main; their reports are triaged
(severity: fatal/scoping/flag), best advice implemented through the normal gate door. Known follow-up
candidates: full perf-baselines run (the whole run used SKIP_PERF=1 — perf is UNMEASURED), the
perf-baselines "measurement gap" WARN, themed terminal ANSI-16, bracket-rotation + syntax sub-roles
from the Tokyo spec, kitty-tier over-SSH verification.

**Doctrine reminders for any cold resume:** re-read /conductor SKILL.md (doctrine you merely remember
is doctrine you will violate); one gate at a time, conductor's own heavy work included; load-canary
watchlist = smoke-wrap + smoke-selection (re-run solo before believing a red); branches never deleted;
verify by driving; provenance decides main.

---

> **⚠ EVERYTHING BELOW THIS LINE IS HISTORICAL (superseded 2026-07-24).** Known stale claims in the
> sections below — do not act on them: ivue 2.0 + a vendored `Static.ts` (now ivue 2.1,
> `Static` from `ivue/extras`, vendored copy deleted) · `renderer.start()` (now `auto()`) ·
> gutter-only caret · lowercase coordinate filename · "editor-title decoupling unfinished" (it is
> complete). The CURRENT anchor at the top + git are the only live sources.

## RESUME ANCHOR — 2026-07-23 (SUPERSEDED by the 2026-07-24 anchor above) — OVERNIGHT AUTONOMOUS RUN

**Session shape:** conductor (main loop) directing a background FORK (`a0f12abb2a300d596`) + scoped
workers. **USER IS ASLEEP → full autonomy: make ALL calls yourself, do NOT ask/defer. The fork has
STANDING AUTHORITY to merge on a clean ALL-PASS gate** (guardrails: finished/ tag, main-advance via
origin only, never touch the primary checkout, verify by driving) without per-merge approval. Follow
the `/conductor` skill; read its "Instantiating a fresh conductor" section if resuming cold.
**Ground-truth against git — this anchor lags.** `origin/main` was `05108bd` at this writing.

- **DONE + merged:** all 11 UI tasks · pull-diagnostics (tsgo now surfaces red diagnostics) · diff
  batch (tasks 1+6: +/− prefixes, no tabs in diff) · all conductor docs/tooling. Tags:
  `finished/feat-diff-batch`, `finished/feat-pull-diagnostics`, `finished/feat-two-line-tabs-v2`.
- **REMAINING backlog (fork drives autonomously, in order):**
  1. **Tooltip bundle** — MERGING on clean re-gate (was `b2h3ze016`): hover-diagnostic surfacing
     (hover over a TS error shows the message, not `any`) + its smoke. Merge on green + finished/ tag.
  2. **Last-char off-by-one** — own gated batch (shared `SelectionDragBehavior`, drags N copies N−1;
     affects editor+diff). Ratchet a smoke.
  3. **Activity bar** — CHERRY-PICK `feat-activity-bar` @ `2723f28` onto post-tooltip main (NOT a
     branch merge; stale base). Conflicts RootView+Workspace keep-both. +4-col shift needs +4 on
     smoke-scrollbars/find/hover/diff (subagent already did smoke-editor). Then TOGGLE: `showActivityBar`
     setting + `Ctrl+Shift+B` + palette "View: Toggle Activity Bar".
  4. **Two-line-tabs refinement** — FLIP the logic: line1 = PROJECT name (a worktree shows its PARENT
     project, via git-common-dir parent, not its own folder); line2 = current BRANCH, REACTIVE to
     `git checkout` (watch HEAD), detached → short SHA; + char-cap with `…` on both lines. Edits
     Workspace.ts (sequence after activity-bar — Workspace overlap).
  5. **#5 undo-reads-unchanged** — file-changes: undo-to-original reads as UNCHANGED (dirty-tracking).
  6. **Follow-ups:** macOS-Terminal mouse investigation (below) · invariant↔smoke coverage checker ·
     add the smoke-coverage line to the merge-gate ALL-PASS reminder.
- **DRAG-SELECT "regression" — RESOLVED as NOT a HoverCard bug.** The fork drive-proved the card's
  drag-select works in-harness + is smoked (smoke-hover:159–183 green); do NOT fabricate a fix. The
  user saw it break in **macOS Terminal.app** — almost certainly a MOUSE-PROTOCOL path the SGR harness
  can't exercise (Terminal.app may not honor SGR mode 1006 → X10 fallback, coords capped 223). Fix
  DEFENSIVELY in TerminalSession/TerminalCapabilities; CAN'T drive-verify here (needs macOS) — user
  verifies when awake.
- **Doctrine/tooling shipped this session (durable):** `/conductor` skill (agent-priming, never-destroy-
  recovery-points, fresh-conductor bootstrap, smoke-coverage ratchet, verbatim cron prompts, hourly loop
  may refine the skill) · `AGENTS.md` priming · branch END-STATES active/`finished/`/`orphaned/` (never
  delete) · `.claude/settings.json` deny-lists (git-destructive + rm-rf) in BOTH repos · `check_invariants
  --refs-for '<name>'` (retirement-sweep primitive).
- **EPHEMERAL fleet (re-establish on resume — do NOT assume alive):** crons `e4de2d1a` (loop-check 10min)
  + `43217ab5` (hourly; can now refine SKILL.md); fork `a0f12abb2a300d596`. Demo: `/tmp/tui-demo` (user's
  running, detached worktree) + `/tmp/tui-demo-main` (fresh clone on main, for testing). Primary checkout
  is CLEAN + synced to origin.

---

## RESUME ANCHOR — 2026-07-21 (compaction checkpoint, SUPERSEDED — historical) — FULL-POWER build in flight

- **2 INVARIANTS WORKERS IN FLIGHT (mine, spawned post-checkpoint):** general-purpose agents bootstrapping
  `src/modules/theme/theme.invariants.md` (agent a30a1f3d79bafd368) + `src/modules/commands/commands.invariants.md`
  (agent ade4f0f8fa08ff9fb). They write the invariants.md + code annotations + run check_invariants.mjs;
  they do NOT commit or touch scripts/. **ON RESUME:** look for their UNCOMMITTED output (theme.invariants.md
  / commands.invariants.md + `// invariant:` annotations in those modules); REVIEW for LOAD-BEARING quality
  (reject decorative — each needs a real Impossible-if-true); run `node .claude/skills/invariants/scripts/
  check_invariants.mjs --all --refs` (0 problems); then REMOVE that module from ALLOWLIST_NAMES in
  scripts/check-map-coherence.sh + verify `bash scripts/check-map-coherence.sh` PASS; commit crediting the
  agent. If output is missing/sub-par, redo or re-spawn. Continue-an-agent via SendMessage(to: <agentId>).
- **🔴 HIGH-PRIORITY: render-pump FREEZE resilience** — see project.progress.md top ("HIGH-PRIORITY
  ROBUSTNESS BUG"). An unhandled exception in a frame/input handler stalled the demand-driven loop → froze.
  Wrap onFrame + reactive paint + input handlers in try/catch (log to file, NOT TTY, keep loop alive) +
  gated contract. Do EARLY.
- **HEAD (docs commit follows this)** · tsc + conventions-gate PASS · adoption + freeze + invariants-review
  are the resume queue.
- **THE GOVERNING PRINCIPLE:** the PRODUCT NORTH STAR in `project.requirements.md` (learnable in ~15 min,
  zero prior knowledge, kid-to-grandpa) — the acceptance lens on EVERY UI feature + its 3 proxy gates
  (click/tooltip/palette-shortcuts completeness). Read it FIRST for any UI work.
- **THE PLAN:** `project.progress.md` → "FULL-POWER BLOCK" (priority-ordered) + "PANE SUBSTRATE" (the
  deferred editor→pane refactor) are the live queues.
- **RECENTLY LANDED (this session):** unwired-capability gate + Definition of Done · all 8 dead settings ·
  DiffView P1 mount (2cced35) · TIER-0 merge-gate (behavioral-contracts + smokes + settings-applied all
  hard-blocking; `bash scripts/merge-gate.sh` / `bun run gate`) · focus-on-open scroll fix (9f66bbd, root
  cause = over-tracking $watchEffect) + open-then-scroll contract · Ctrl+F/H find/replace (713623f) ·
  Ctrl+P quick-open (b84e700) · scroll-momentum→Momentum Static (6a67412) · map-coherence gate (c9aff34) ·
  builddoc/naming/npm-scripts (e871b7b) · NORTH STAR encoded (3451999).
- **ADOPTION QUEUE (coordinator holds these worktrees; each = merge→wire→driving-smoke in ONE commit under
  the merge-gate; all sanity-passed by the coordinator, NEW isolated files, zero conflict):**
  - `conductor-ripgrep` → src/modules/search/RipgrepSearch.ts — the Search view (find-in-files).
  - `conductor-activitybar` → src/modules/ui/ActivityBar.ts (+test, 5 pass) — icon strip; onSelectView
    callback + activeView input. I copied it once + removed it (unwired would fail the gate) — RE-ADOPT +
    WIRE (mount far-left, switch sidebar view, Ctrl+Shift+E/F/G + click, active highlight, persist last
    view to a new setting + applied-effect test). sidebarView is currently 'files'|'git' (Workspace.ts:171)
    — extend to map explorer→files / sourceControl→git / search→Search view / settings→toggle Ctrl+,.
  - `conductor-shortcuts` → src/modules/ui/ShortcutsView.ts (+test, 5 pass) — consumes the DEAD
    KeybindingRegistry.effectiveBindings(); wire F1/Ctrl+/ open + Esc + a status-bar "?" button.
  - `conductor-quickopen` / `conductor-findbuffer` / `conductor-mapgate` / `conductor-builddoc` — ALREADY
    ADOPTED (committed); coordinator can remove those worktrees.
- **INTEGRATION PATTERNS proven this session (reuse):** overlay modal = command-palette pattern (absolute
  BoxRenderable zIndex 100, root.add, visible-toggle, content projected in update(), a dedicated onKey
  context + isTypedCharacter). See FindBar (find bar) + QuickOpen (Ctrl+P) in RootView/Bootstrap. The
  clickable-buttons pattern = the tab-arrow "single geometry source for render + hit-test".
- **SANDBOX GOTCHAS (env, not code):** `rg` is a shell-function shim here (no real ripgrep) → QuickOpen has
  a git ls-files fallback; fs.watch throws EMFILE (inotify exhausted) → GitWatcher tests skipIf. Both work
  on the user's real machine. Kill stray tmux sessions if EMFILE bites (`tmux kill-server`).

## MUST RE-READ ON RESUME (in order — highest signal first)
0. `project.conventions.md` — THE operative convention set (deterministic self-handoff: load this
   BEFORE anything; every turn status carries `conventions @ <git hash of the file>`).
1. `project.progress.md` — the live checklist (USER PIPELINE) + the EXACT next action (file/function/change).
2. This file (`project.handoff.md`) — role, API facts, protocols, settled decisions.
3. The contract(s) for whatever you're mid-work on. Editor rework frontier →
   `src/modules/editor/editor.invariants.md`, `src/modules/app/app.invariants.md`,
   `src/modules/ui/ui.invariants.md`. A module merge → that module's `*.invariants.md`.
4. `project.invariants.md` + `project.lattice.md` — the generators everything derives from.
5. `project.implementation-plan.md` — §3 conventions, §4 milestones, §5 the verification gate.
6. `project.decisions.md` — the 10 ivue decisions + the 3 study corrections (vue dep, vendored
   Static/kernel, createX-is-ours).
7. `project.ivue-reference.md` — the flyweight + exact ivue patterns (only if writing ivue code).
8. Source at the current frontier (from `project.progress.md` "Next action"): typically
   `src/modules/ui/RootView.ts` (caret/selection render), `src/modules/editor/{Editor,Cursor,TextDocument,editor.coordinates}.ts`, `src/modules/app/Bootstrap.ts`.

## What this is
A terminal code workspace on Bun + ivue + OpenTUI + Tree-sitter + git, built to
`project.brief.md`, governed by the IBR `/invariants` method.

## Your role
Sole builder + governor. You own the critical editor core and ALL review/integration/verification.
Delegate well-scoped implementation to **codex** (worktrees) + **subagents** to keep context lean;
do the subtle/central work yourself. Review every delegated output against its contract + run
checker + `bun test` before merging. Deprecate sub-par output (don't patch around it).

## Environment / runbook
- Bun `~/.bun/bin/bun` (1.3.14): `export PATH="$HOME/.bun/bin:$PATH"`. Run `bun run <f>`; test `bun test`.
- Typecheck `bunx tsc --noEmit; echo TSC=$?` — **NEVER pipe tsc through tail/tee** (masks the exit code; this trap already bit two audits).
- Invariants checker (in the ibr repo — do NOT copy here):
  `node .claude/skills/invariants/scripts/check_invariants.mjs --all|--refs|--score`
- Deps: `ivue@2.2.1`, `vue@3.6.0-rc.1`, `@opentui/core@0.4.5`, `web-tree-sitter@0.26.11`.
  `Static` comes from `ivue/extras`.
- codex worktrees: `.claude/worktrees/codex-<mod>` (branch `codex/<mod>`, node_modules symlinked). Prompts `scripts/codex/*.prompt.txt`. Drive: `codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -C <worktree> "$(cat prompt)"`.

## Key API / pattern facts (easy to forget after compaction)
### ivue
- `import { Reactive } from 'ivue'`; `ref/shallowRef/computed/watch/watchEffect` from `'vue'`.
- Namespace: `class $X {...}` + `export namespace X`; statics-bearing classes anchor with
  `$Class=Static($X)`, classes without statics use `$Class=$X`, and the selected binding is
  `Class=$Class` or `Class=Reactive($Class)`.
- `$watch/$watchEffect/$stopEffects` are injected on the WRAPPED instance, NOT the raw `$X` type.
  Inside a class method, cast: `(this as { $stopEffects?: () => void }).$stopEffects?.()`.
- Plain getters for cheap derived state (NOT `computed()`); `ref`-getters for state.
- Late dep reads (getter/method bodies, never top-level `new`/`const C = X.Class`).
- Owned deps via overridable `createX()` seams: `field = this.createDep(); protected createDep(){ return new Dep.Class() }` — NOT `field = new Dep.Class()`.
- Stateless capability classes → `$Class=Static($X); Class=$Class`; stateful classes choose
  `Class=$Class` or `Class=Reactive($Class)` according to their reactive lifetime.
### OpenTUI (@opentui/core)
- `createCliRenderer({exitOnCtrlC:false, targetFps})` → renderer. `.root`, `.requestRender()`, `.start()`, `.destroy()`, `.keyInput.on('keypress', KeyEvent{name,ctrl,shift,meta,option,sequence,repeated})`, `.on('resize')`, `.on('frame')/.once('frame')`, `.width/.height`.
- `BoxRenderable, TextRenderable, StyledText, fg, type TextChunk` from `@opentui/core`. Yoga flex layout (`flexGrow/flexDirection/width/height/padding`). Renderable `.height/.width` are NON-reactive layout values (read after a frame; synced to viewport on boot/resize only).
- Caret: currently a gutter `▏` bar (`ui/RootView.ts` `renderEditorStyled`, ~line 185). TODO next: a real caret at `displayColumn(line, cursor.col)` — first check @opentui/core for a native cursor API (grep node_modules/@opentui/core for `cursor`); else a block caret (invert the grapheme cell at the display column).
### Coordinate model (`src/modules/editor/editor.coordinates.ts`) — DONE
- Three non-coinciding coords: grapheme index (cursor "col"), UTF-16 offset (slicing + LSP), display column (rendering; tab + wide-char aware). Fns: `graphemeToU16, u16ToGrapheme, graphemeCount, displayColumn, graphemeWidth, lineWidth, clampCol` (via `Intl.Segmenter`).
- `TextDocument` edit ops take `col = grapheme index` (convert to UTF-16 to slice); `Editor` `curLineLen/moveVertical/moveHorizontal` count graphemes. NEVER slice by raw UTF-16 for cursor ops (splits surrogate pairs).
### Reactive frame effect (`src/modules/app/Bootstrap.ts`) — DONE
- ONE `app.$watchEffect` touches load-bearing signals (`document.revision`, `cursor.line/col`, `viewport.scrollTop`, `workspace.focus`, `tree.selectedIndex`, `commands.open/query/selectedIndex`, `theme.paletteName`) → `paint()` = `view.update()` + `publish()` + `requestRender()`. Handlers MUTATE ONLY. `setSize` on boot/resize (OUTSIDE the effect — no feedback loop). `$stopEffects` on dispose. Contract: `app.invariants.md` "Rendering is one coarse frame effect".
### status.json side-channel (`system/StatusChannel`)
- `StatusChannel.Class.update(patch)/flush()/settle(frame)` → atomic write to `artifacts/status.json`. Fields: activeWorkspace/workspaces, activeBuffer, bufferRevision, dirty, cursor{line,col}, openBuffers, focus, treeRows/treeSelected, overlay/paletteQuery/paletteMatches, ready, lifecycleTier, width/height, git* (branch/head/staged/unstaged/untracked counts/refreshing/error), settle frame counter. tmux harness asserts STATE from here; pane-capture for visual only.
### codex review-and-commit protocol
- codex workers write files UNTRACKED in `.claude/worktrees/codex-<mod>/` and do NOT self-commit/self-add. **Integration is the main loop's job**: review code vs the contract, run tsc + `bun test` + checker in the worktree, fix issues (or send a precise follow-up), then copy into main (`cp -r .claude/worktrees/codex-<m>/src/modules/<m>/. src/modules/<m>/ && rm -f src/modules/<m>/.gitkeep`), verify on main, commit crediting codex. **codex often SKIPS tests + the contract** — add them (or delegate to a subagent, then review).

## Settled decisions (do NOT re-litigate)
- Reactive frame effect: WIRE IT (done). Coordinate model: grapheme-based via Intl.Segmenter (done).
- Editor rework order: reactive frame → coordinate → **caret** → selection + copy/cut/paste (`Clipboard` capability: wl-copy/xclip/pbcopy + OSC 52) → multi-workspace → search → piece-table undo.
- `Static()` only for stateless capability classes; stateful stay plain instance.
- Contracts-first governance; module contracts bootstrapped per milestone; docs named `project.<role>.md` / `<module>.<role>.ts`; PascalCase class files.
- Verification: tmux + status.json for state; tsc + tests green at EVERY commit.

## The blackline large-project acceptance test (REQUIRED for the gate — see project.verification-results.md)
- ISOLATED WORKTREE ONLY, never touch live blackline-app:
  `git -C /home/parallels/dev/blackline/blackline-app worktree add /home/parallels/dev/blackline/bl-tui-test HEAD`, point the editor there, edit/revert, then
  `git -C /home/parallels/dev/blackline/blackline-app worktree remove --force /home/parallels/dev/blackline/bl-tui-test` and confirm blackline-app is untouched.
- 5 checks: files-load-at-scale, keyboard editing (write to disk in the worktree then revert), mouse (record unsupported affordances explicitly), shortcut pane/page nav (keyboard-only, no dead-ends), folder expand/collapse (lazy). Drive under tmux, assert from status.json.

## Rules
- Never block on a question — pick the best contract-consistent default, record it in `project.decisions.md`, keep going. Surface only a TRUE hard blocker (missing credential / ambiguous product call with no safe default).
- Commit frequently. Keep `project.progress.md` + this file current every few turns. codex not trusted with deletions; commit before delegating.

## Deferred: buffer-tab de-fieldset (part 4) — decouple find-source identity from the display title
The buffer-tab restyle shipped 3 parts (breadcrumb, powerline separator, first-tab gap/color). Part 4
— removing the redundant filename BORDER LEGEND on the editor pane (blank `editorArea.title`) — is
DEFERRED because it deterministically breaks `scripts/smoke-markdown.sh`: with the title blanked
(`''` or `' '`) the markdown find pane reports `source=''` and a source paste no-op (`revision 1 -> 1`);
restoring the filename title makes it ALL-PASS (bisected — not a flake).
ROOT CAUSE (the bug under the bug): the find/paste pane's SOURCE IDENTITY is derived from
`editorArea.title`, a DISPLAY string — identity must never key off a display value (expression ≠
essence). PROPER FIX (not "put the title back"): DECOUPLE — give the pane a stable source identifier
(the document PATH) independent of the visible title, so the border legend can be blanked/restyled
freely. Likely bundled with the status-bar terminal-toggle button (same RootView/editor-pane region).
See memory reference-editorarea-title-markdown-coupling.
