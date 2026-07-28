# Orchestration Lessons — running multi-agent autonomous work with IBR + skills

What a full night of building the Invar TUI editor taught us about our skills and, more
importantly, about **managing** work like this — one main session conducting a background
fork, which in turn drove three codex workers, all under IBR + the `/invariants` governance
loop. Written 2026-07-21, from real events in this run. The point is to convert the friction
we hit into either practice or tooling.

---

## ⚑ RULE ZERO — THE AGENT'S INNER LOOP IS DRIVING, NOT TESTING

**Full doctrine in `.claude/skills/conductor/SKILL.md` Rule Zero. Restated at the top here because
a cold start reads this file too — and because we DID work this way at the start, moved fast, and
drifted away from it without noticing (user correction, 2026-07-27).**

- INNER loop = the builder drives the real app in its own PTY: drive -> change -> drive. Seconds.
  No gate, no conductor. Exit condition is *the symptom is gone when I drive it*.
- OUTER loop = the conductor's merge gate, as final sieve. Rare, terminal.
- **Iteration does not need the gate. Only LANDING does.**
- Brief order, always: reproduce by DRIVING -> iterate by driving (ONE instrument, never the
  suite, never 3x) -> write the contract only AFTER the symptom is gone -> one verification pass
  at the END.
- **Assertions PREVENT REGRESSION; they do not DISCOVER FIXES.** With the test in the inner loop a
  builder optimizes for making an assertion pass rather than making it right — and for felt
  qualities the assertion is a lossy proxy, so a green suite and an unhappy user coexist happily.
- The CONDUCTOR causes the violation, by demanding suite runs inside the builder's loop. Do not.
- The gate must be TIMELESS: count-based, no clock — cannot be slow, cannot flake, cannot be
  excused. Cheaper AND stricter at once.
- FEEL-BISECT: when something "used to feel right", bisect history BY DRIVING and compare
  per-frame fingerprints as SHAPES, not thresholds. `3,3,3,3` glides; `5,1,5,1` stumbles at the
  same mean.

**DRIVING MEANS THE PTY HARNESS** (`scripts/harness/PtyTestDriver.ts` + frame probe). **tmux is
LEGACY and demoted**: ~44 `*_full_tmux_smoke` registrations remain as an opt-in audit tier the gate
SKIPS unless `INVAR_FULL_TMUX=1`, and per #105 an unrun smoke is not coverage — it is a file that
LOOKS like a contract. Never write a new tmux smoke; extend a PTY-harness one.
**Entries BELOW this banner are an append-only changelog and many predate the port** — where a
dated entry says "tmux harness" as the driving mechanism, read "PTY harness". The history is kept
verbatim because rewriting a changelog destroys the evidence; this note is the correction.

## Part 1 — What the skills got right (validated in the wild)

- **IBR reduction was the highest-value early artifact.** Collapsing the brief's 37
  "architectural invariants" to ~8 named generators was not decoration — it changed the code
  that got written. *"Cost tracks the actively observed set"* is directly why the file tree
  lazy-expands, the editor slices only the visible window, and undo is a bounded stack. The
  compass earned its keep before a line of app code existed.
- **Impossibility-prediction paid off concretely.** The reality invariant *"A text position
  has several encodings"* predicted the exact bug — backspace splitting a surrogate pair into
  a lone half — **before any code was read**. A contract's highest-value output is the
  impossibility it forbids; this is the canonical proof of it.
- **Independent adversarial review caught what the author could not.** The builder (me, in the
  main session) wrote revision-stamping refs and never noticed nothing observed them —
  "decorative reactivity." The fork's independent pass found it. The author of a bug is its
  worst reviewer; the panel is not ceremony.
- **Reviewer disagreement is a signal, not noise.** Two audits disagreeing on whether the code
  typechecked surfaced a real trap (below). When honest reviewers diverge, at least one
  reduction is incomplete — chase it.
- **Governing already-written, un-governed code is a strong test of the loop**, not a weaker
  one than clean-room. It is exactly the mission ("keep AI-developed code from going
  brittle"), and it converted real M1–M3 code into contracted, annotated, checked code.

## Part 2 — Antipatterns and traps discovered

- **Decorative reactivity** — bumping a `ref` that no effect reads. The substrate (revision
  stamps) existed; the consumer (a frame effect) didn't, so async producers had no repaint
  path. *The `provisional/established` binary doesn't capture this "substrate present, consumer
  pending" state* — a genuine gap in the invariants vocabulary.
- **Outcome-vs-mechanism** — an invariant satisfied in *result* while its prescribed
  *mechanism* is bypassed. "Data flows one way" held in outcome (render never mutated state)
  while its mechanism (reactive invalidation → repaint) was absent. Only checking the mechanism
  catches the real gap. Verdicts must inspect mechanism, not just observable behavior.
- **Exit-code masking** — `tsc | tail` (or `| tee`) reports success while `tsc` actually
  failed, because the pipe's exit code is `tail`'s. This is why two audits disagreed on
  "does it compile." **Rule: never pipe a verification command through tail/tee; use
  `cmd; echo EXIT=$?`.** Now in the tui-editor PROGRESS runbook.
- **Annotation-ahead-of-contract** — sprinkling `// invariant: X (contract.md)` comments that
  name records/files not yet written produces exactly the orphan annotations the checker
  exists to flag. Don't annotate before the contract exists.
- **The observation instrument can be the bug (and manufacture a phantom).** The selection
  highlight looked mis-positioned (~4× scale + offset) and was blamed on OpenTUI's
  `setLocalSelection`; a codex worker was sent deep into the Zig renderer source chasing it.
  Root cause: the **FrameProbe itself** read the render buffer with the wrong stride (cells are
  4 RGBA lanes) — the *observation tool* was lying, the selection had rendered correctly all
  along. The "4× scale" symptom was literally the 4-lane misread. Lesson: when a verifier
  reports a bug, first sanity-check the verifier against a KNOWN-GOOD control (does it report
  the background/a fixed shape correctly?) before trusting its verdict on the thing under test.
  A wrong instrument doesn't just miss bugs — it invents them and sends you debugging the wrong
  layer. This is "a test is only as true as the channel it reads is authoritative for" applied
  to the channel itself.
- **Pane-scraping for state** — the one time state was asserted by scraping the rendered TUI
  pane instead of the deterministic side-channel, it produced a false "the arrow keys are
  broken" scare (half-repainted frames read mid-update). The recorded discipline "verdicts come
  from the side channel, never the pane" was violated by its own author and immediately bit.
  Generalizes: **agent/system verdicts come from artifacts (git, status files, test output),
  never from parsing rendered prose or screens.**

## Part 3 — What we were MISSING to manage this well (the real lesson)

These are the gaps that cost time tonight. Each is a candidate for a practice or a skill.

1. **Commit-ownership was undefined → a real deadlock.** The three codex workers wrote their
   complete modules and went quiet; every file sat *untracked* in the worktrees. The
   orchestrator waited for "codex to commit" as its merge trigger — a signal that would never
   come, because committing delegated output is the *orchestrator's* job, not the worker's.
   Hours of apparent "still building" were actually "done and stranded."
   **Fix / practice:** before delegating, define explicitly — *who commits the work, and what
   is the completion signal?* A worker that finishes without committing is invisible to a
   commit-watching parent. Prefer an explicit done-marker artifact over "watch for a commit."

2. **No liveness/heartbeat on delegated workers.** We could not distinguish "still building"
   from "finished-but-stranded" from "crashed." PIDs rotate every turn, so process-watching
   lies. The only reliable read was file mtimes ("no writes in 56 min → done or hung").
   **Fix:** delegated workers should emit a heartbeat/status artifact (a `worker-status.json`
   with phase + last-progress timestamp + done-flag) that the orchestrator polls — the same
   side-channel discipline the TUI uses for its own tmux harness, turned on the *agents*.

3. **Two writers on one checkout collide.** The fork swept the main session's file renames into
   its own commit; both sessions spent tokens confused about "who is this rogue builder
   committing to master" — when they were the *same* session running a `/goal`.
   **Fix:** worktree-per-writer is mandatory for concurrent agents. One checkout, one writer.
   (Codex workers were correctly isolated in worktrees; the main-session/fork overlap was not.)
   **Fan-out variant (recurred 2026-07-21, whole-repo de-abbreviation pass):** the fork
   parallelized a mechanical rename across 7 module-scoped sub-forks sharing ONE working tree;
   the git-module fork strayed cross-module into `editor/` and raced the dedicated editor fork.
   The orchestrator aborted the whole swarm to stop the race (safe — it verified the tree was
   green and committed rather than resetting), but the abort then propagated as a confusing
   "safe to reset the working tree" signal up the mesh. Two lessons: (a) a whole-repo mechanical
   pass fanned across sub-agents on a shared tree needs **strictly disjoint file sets per agent
   with a hard no-cross-module rule**, or a single serialized owner — sharing the tree without
   partition guarantees is the collision by construction; (b) an internal safety-abort's
   "reset?" signal must not read as an external stop — see limit 9.

4. **Agent-topology blindness.** The fork filed "incident reports" about a rogue committer that
   was itself (its sibling running the user's goal). Agents don't know their own authorship or
   the shape of the fleet they're in, so they burn cycles diagnosing phantoms.
   **Fix:** give each agent a one-paragraph "who you are, who your children are, who commits,
   who else writes here" topology note at spawn. Cheap; prevents whole diagnostic loops.

5. **Compaction resilience is not automatic.** A long autonomous agent *will* compact, and the
   summary cannot be trusted to preserve the work frontier.
   **Fix (now practice):** every long agent maintains a **committed** `HANDOFF.md` with a
   `MUST RE-READ ON RESUME` ordered doc list, updated every few turns — reconstruct from disk,
   not from the dropped summary. A parent can't see a child's context %; detection is
   behavioral (re-reads, re-litigation) or self-reported (ask the child to stamp a COMPACTION
   line each turn). There is no external gauge of the number.
   **Correction learned this run — a parent CAN force-compact a child, with curated focus.**
   Send the subagent a message whose content *begins with* `/compact` (no leading whitespace):
   `/compact <focus instructions>`. The recipient's harness executes it as the slash command,
   compacting with your instructions as the summary focus. (Earlier this run I wrongly believed
   a parent had no compaction control and could only *instruct* the child to compact itself —
   but a background agent CANNOT self-invoke `/compact`; the `/compact`-as-message from the
   parent is the actual lever.) So the proactive-compaction play is: parent watches for the
   child getting long → have it reach a green committed checkpoint + refresh HANDOFF → then
   parent sends `/compact <focus>` to compact it cleanly on a curated boundary, instead of
   waiting for the harness's automatic compaction at the ceiling (`trigger:"auto"`, which fires
   at ~95%+ regardless). Auto-compaction is survivable *if* the handoff is fresh; the manual
   `/compact` lets you choose the boundary and the focus.

6. **Shared decisions ledger.** Re-litigation risk is real across turns and across agents.
   `project.decisions.md` worked for the fork; delegated workers need read access to it so a
   settled call isn't re-opened by someone who never saw it.

7. **The conductor role is itself an un-codified skill.** Shepherding — re-waking parked
   agents, spotting and breaking deadlocks, being the external memory backup, relaying
   decisions with sensible defaults, watching for context-loss — emerged ad hoc tonight and
   did real work (it broke the codex deadlock). It deserves to be a named skill, not improvised
   each time.

## Part 3b — Delegation = cold-start-clone orientation + task delta (the strongest formulation)

The best delegation strategy found this run: **onboarding a delegate is the same operation as
onboarding a resumed/compacted self.** Both bring an agent up to parity with the orchestrator's
load-bearing understanding, then act. Reuse the same packet for both. Concretely, a delegation
prompt is:

  (shared cold-start orientation) + (only the contracts the task touches) + (role-framed task)
  − (the conductor identity)

- **Shared orientation (fixed, reusable):** the exact MUST-RE-READ foundation a resumed self
  reads — ivue reference + namespace pattern, the naming/module conventions, the verify
  discipline (assert from the side channel, never pane-scrape; never pipe the typecheck), the
  coordinate/frame-effect facts, and the delegation/commit protocol. This is why a delegate
  drifts less: it starts where the orchestrator stands, not below it.
- **Scope contracts only (tiered):** the target module's `*.invariants.md` + the relevant
  project records — NOT all contracts. Cloning *everything* multiplies a large context N times
  and defeats the reason you delegate (keeping the loop lean). The MUST-RE-READ list already
  separates "always" from "for what you're working on"; reuse that split.
- **Role-framed task, conductor identity stripped:** clone the *understanding*, not the *role*.
  A delegate must NOT inherit "I am the conductor who spawns codex and re-plans the build" — or
  it will spawn its own sub-agents and re-litigate the plan. Frame it as: "you are a scoped
  worker; read these; do this one thing; return it for review."

The failure this prevents is the bare-bones-prompt drift of Part 3; the failure it *avoids
introducing* is token blowup and role-confusion. The artifact already exists — the HANDOFF's
MUST-RE-READ packet IS the reusable orientation; delegation just points a fresh agent at it.

## Part 4 — Concrete artifacts to build next

- **An `orchestration` / `delegate` skill** codifying: the commit-ownership contract, the
  worker heartbeat artifact, mandatory worktree isolation, the shared decisions ledger, an
  explicit completion-signal definition, the re-wake loop, and the topology note. Most of
  Part 3 becomes a checklist here.
- **Compaction-resilience as standard practice** in every long-running agent prompt: committed
  HANDOFF + MUST-RE-READ + per-turn COMPACTION status line.
- **`/invariants` vocabulary additions** (feed the skill's own upgrade log): the
  outcome-vs-mechanism verdict nuance; a greenfield "consumer-pending" status distinct from
  provisional; the exit-code-masking warning baked into Verification/verify guidance;
  "verdicts from artifacts, never rendered output" as an explicit review rule.
- **`ivue` note:** name "decorative reactivity" (a bumped ref no effect observes) as an
  antipattern; record that the namespace + `Reactive()` conventions held up cleanly in
  autonomous, un-reviewed code.

---

## Part 5 — The deeper reframe: the invariants are the artifact, the app is an expression

Surfaced 2026-07-21, mid-build. The realization that reframes the whole experiment:
**the invariants are the truth/meta layer; the application is only one expression of them —
the implementation, not the truth.** This is IBR's "Expression is Not Essence" axiom, but the
build turned it from a claim into observed evidence:

- **One generator, many expressions.** "Cost tracks the actively observed set" generated the
  file-tree lazy-expand, the editor viewport, AND the git commit-log virtualization — three
  unrelated-looking implementations, one invariant. Building each was *derivation from* the
  invariant, not invention. The generative principle running forward.
- **The truth judged the code, never the reverse.** The surrogate-pair corruption and the
  FrameProbe stride bug were both caught because the *invariant* ("a text position has several
  encodings"; "a test is only as true as its channel is authoritative for") was the fixed point
  that identified the *code* as the thing that had drifted. Expression is corrigible against
  essence; essence is not corrigible against expression.
- **Regenerability asymmetry (the proof).** The fork compacted — lost all conversational memory —
  and continued seamlessly, because the load-bearing truth lived in `project.invariants.md` +
  the module contracts on disk. The implementation is regenerable from the invariants; the
  invariants are NOT regenerable from a lost session. The app is provably downstream.

The rigor caveat (the Wielder Principle): the app is an expression of the invariants **only to
the depth they've been honestly reduced.** Provisional records and "decorative-reactivity"-style
hollow generators still carry hidden truth the contract hasn't extracted — there, the code is
still load-bearing. So the gauntlet and verification passes are not QA; they are *continuing the
reduction* — finding where the expression still holds truth the contract doesn't yet.

Consequence for practice: **the invariants contract is the artifact worth keeping.** The
tui-editor could be discarded or rewritten in another framework; `project.invariants.md` would
regenerate it. That is the point of governing code with invariants — not tidiness, but giving a
codebase a truth layer above its implementation layer, with the implementation provably
downstream. This is *why* the /invariants skill exists; the build is its existence proof.

**The one-line takeaway:** the *reasoning* skills (IBR reduction, invariant impossibility-
prediction, adversarial review) worked and proved their value immediately. What we lacked was
the *operational* layer for running many autonomous agents at once — commit ownership,
liveness, isolation, topology, compaction resilience, and a codified conductor role. Tonight
those gaps cost the most time (the codex deadlock, the "who's the clone" confusion, the
compaction worry). Build the orchestration layer next; the thinking layer is already sound.

---

## Part 6 — Conductor run 2026-07-23 (Invar UI batch + tsgo swap + scroll-viewport module)

Six new operational lessons, every one from real friction this run.

1. **A green gate on an UNCOMMITTED tree is not durable — a commit is the only "safe" signal.**
   The 0/7 scrollbar work was `git add`-ed and passed the FULL merge-gate ALL-PASS *three times*,
   but was never `git commit`-ed. `git worktree remove --force` then silently discarded it; main
   never had it, and hours of validated work vanished. The gate validates the *working tree*, which
   is ephemeral. **Rule: commit before (or immediately after staging for) the first gate; treat the
   COMMIT — never a green gate on a dirty tree — as the "work is safe" checkpoint.** This is the
   commit-ownership lesson (Part-3 #1) turned on the orchestrator's OWN delegated-back work.

2. **Tracked-background vs `nohup` decides both agent visibility AND auto-rewake.** A background
   agent that launches its gate with `nohup … &` (untracked) then ends its turn "with no live
   children" drops out of `/tasks`, goes dormant, and does NOT auto-resume — invisible to the user
   and stalled. The same gate launched with the Bash tool's `run_in_background: true` (a TRACKED
   child) keeps the agent live, visible, and auto-re-invoked the moment the child completes.
   **Rule: delegated agents background long work via tracked children, never nohup** — it is both
   the "why did my fork vanish from /tasks" fix and the auto-rewake mechanism.

3. **Count ROOT gates, not name-matches — transient smoke children cause false self-blocking.**
   `pgrep -f 'merge-gate.sh'` returns the root gate PLUS its transient smoke subprocesses; the fork
   repeatedly read "3 gates running," self-blocked under its own cap-1 rule, and stalled when only
   0–1 real gates existed. **Rule: a "free slot?" check counts only ROOT `bash scripts/merge-gate.sh`
   procs (ppid=1 / the real parent), never any process whose cmdline merely matches the name.**
   Miscounting the fleet's own transients is a recurring self-inflicted deadlock (cf. Part-3 #4).

4. **Stale-base branches: `git merge` is 3-way-safe, but you must gate the COMBINED tree.** A branch
   built on an older main shows an alarming 2-dot diff (looks like it will revert newer merges), but
   `git merge` resolves via the merge-base and preserves both sides for disjoint files — the merge
   is safe. The trap is *gating the stale base*: a green gate on old code validates something that
   isn't what lands. **Rule: bring current main INTO the branch (`git merge main`) BEFORE the final
   gate, then verify `git diff --name-only main..HEAD` shows ONLY the task's own files.** Never gate
   or merge a stale-base branch without first pulling main in.

5. **Swapping a backing service: enumerate PUSH vs PULL capabilities — a complete render can still
   show nothing.** tsgo (native-preview) is pull-model and never sends `publishDiagnostics`; the
   task-4 diagnostics RENDER was complete, gated, and correct, yet produced zero squigglies under the
   default server because the DATA never arrived. **Rule: when swapping a service (tsserver→tsgo),
   enumerate which capabilities are push vs pull and verify the DATA reaches the client — not just
   that the render works given data.** A feature gated against an injected fixture can be invisible in
   production; the fix is a capability (LSP pull-diagnostics), not a render change.

6. **The conductor's OWN discipline degrades over a long session — the same traps it warns about.**
   This run the conductor (main session) hit exactly the Part-3 failures it documents: never-
   committing (real data loss, #1 above), miscounting the fleet (#3), and nearly merging a stale
   base (#4). Judgment erodes precisely when the stakes (irreversible merges) are highest and the
   session is longest. **Lesson: the conductor needs the same mechanical checklist it imposes on
   workers — a per-merge ritual run every single time, not from memory: `committed? · merged current
   main in? · gate ALL-PASS on the combined tree? · diff shows only my files? · pushed? · demo
   bumped?`** The orchestration skill (Part-4) should ship this as a literal checklist, because prose
   discipline is the first thing to slip under length.
- **`update-ref` on a CHECKED-OUT branch desyncs its worktree (2026-07-23).** To fast-forward
  local `main` to a merged commit I ran `git update-ref refs/heads/main <new>` — but `main` was
  checked out in the primary `/home/parallels/dev/tui-editor` worktree. update-ref moves only the
  branch pointer; the working tree + index stayed on the old commit, producing a phantom "staged
  revert of the last merge" in `git status` and serving the user STALE on-disk code (the just-merged
  task 4 was absent from disk). No real work was lost — the unstaged diff was clean — and
  `git reset --hard <new>` repaired it. **Rule: never `update-ref` a branch that `git worktree list`
  shows checked out anywhere (the primary counts). Advance a checked-out branch with
  `git pull --ff-only` / `git merge --ff-only` in that worktree so the files move with the pointer.**
  The conductor owns syncing the primary's local main; workers push merges to ORIGIN and never touch
  the primary checkout.
- **Branch/worktree PRESERVATION guardrail (2026-07-23, user-requested).** Never delete a branch,
  force-remove a worktree, or force-overwrite work without explicit per-branch user authorization —
  destructive git ops are irreversible and already cost a lost task this session (`worktree remove
  --force` on uncommitted work). The user saw branches being deleted before/around commit and asked
  to guard-rail it. **"Done" = MARK finished (`git tag finished/<branch> <merge-hash>` + a
  `project.delegation-log.md` line), never delete.** Deletion happens only in an explicit
  user-authorized sweep. Codified in the /conductor skill's "Never destroy recovery points" section;
  relayed to the fork as a standing rule.
- **Branch END-STATES (2026-07-23, user-requested completion of the preservation rule).** Every branch
  ends ACTIVE (untagged; a live worktree/agent drives it), FINISHED (merged → `finished/<branch>` tag),
  or ORPHANED (abandoned/superseded/dead-end → `git tag -a orphaned/<branch> -m '<reason>'` if it has
  unique commits worth preserving; a delegation-log line alone if empty/DOA). Both terminal states are
  MARKED, never deleted; pruning happens only in an explicit user-authorized sweep. Makes branch status
  legible at a glance and keeps every recovery point.
- **Agents kill their OWN gate's tmux while "cleaning up" (2026-07-23).** The fork, deciding that
  process-counting was "unreliable" (its own smoke processes self-match its `pgrep`), moved to
  "kill ALL smoke tmux sessions" — while its own gate was mid-run driving smokes in tmux. That
  produces spurious failures whose signature is *app did not open / vanished mid-drive* (here:
  smoke-shortcut-help "quit-drive session did not open a document"). **Rule: never kill
  tmux/processes to resolve a liveness or counting confusion.** The gate owns its smoke-tmux
  lifecycle and cleans up itself; the authoritative liveness signal is gate-LOG step activity, not
  process/tmux counts. And never kill unknown/stale sessions (the 2-day-old `diff-manual*` here) —
  they may be adjacent to the user's env. Reinforces "process topology lies; the log is truth."
- **Migration verification must cover EVERY behavior the module provides (2026-07-23).** The
  ScrollableTextViewport migration was drive-verified for scroll/momentum but NOT drag-select; a user
  later reported "drag-select broke." It turned out NOT broken (see next lesson), but no smoke drove the
  hover-card drag — so a real regression WOULD have shipped silently. Rule: migrating to a shared module,
  ratchet a driven smoke for EACH behavior it provides (selection, momentum, alt-scroll, scrollbars), not
  just the one you're focused on. An instance of the smoke-coverage ratchet.
- **The tmux/SGR harness has a BLIND SPOT at terminal-specific paths (2026-07-23).** A user-reported
  "drag-select broke" did NOT reproduce in-harness — it's a macOS Terminal.app MOUSE-PROTOCOL path
  (Terminal.app may not honor SGR mode 1006 → X10 fallback, coords clamped at 223) the SGR-encoding
  harness can't emit. Two rules: (a) do NOT fabricate a code fix for a bug that won't reproduce — that
  ships a no-op (the fork correctly refused, and drive-proved the logic works + smoke-ratcheted it);
  (b) when a real user "break" won't reproduce in-harness, suspect a terminal-CAPABILITY path (mouse mode,
  glyph tier, escape support) the harness's own terminal can't exercise — diagnose defensively from the
  code path, flag that final verification needs the user's real terminal. The harness proves LOGIC, not
  every terminal's protocol quirks.
- **External snapshots LAG an agent's real state — hold "stalled/uncommitted" diagnoses loosely (2026-07-23).**
  A loop-check saw the fork's transcript mtime stale (~22 min), wt-tabs "uncommitted", and an old failed gate,
  and diagnosed "dormant with uncommitted work." Wrong: the fork had committed two-line-tabs (061d583+e098c2c)
  and kicked a FRESH gate in the window between the snapshot and its self-report. Two blind spots: (a) the
  worktree-writes `find` EXCLUDES `.git/`, so it MISSES COMMITS — the single most important progress signal —
  making a just-committed agent look idle; (b) transcript mtime lags an in-flight tool call. Fix: include
  branch-commit detection (`git -C <wt> rev-list --count origin/main..HEAD`) in the liveness read, not just
  non-.git file mtimes; and treat suspected dormancy as a prompt to make the agent SELF-REPORT (a cheap nudge)
  rather than asserting stall from the snapshot — the agent's self-report is authoritative. The nudge does no
  harm when wrong (the agent just clarifies), but the DIAGNOSIS must be held loosely.
- **Mitigation for the tracked-gate re-invoke misfire: arm a MONITOR on the gate log (2026-07-23).** The fork's
  tracked-background-gate completion repeatedly failed to re-invoke it, leaving it dormant on green/red gates
  until a loop-check nudge (merges lagged one cycle). The fork fixed it itself by arming a Monitor on the gate
  log file — completion then reliably wakes the agent. Standing rule: for a long gate whose result must be
  acted on, arm a Monitor on the named gate log rather than trusting the tracked-bg re-invoke; the 10-min
  loop-check remains the floor under it.

- **One fixed-session-name smoke silently serialized the WHOLE fleet.** We'd capped at 2–3 builders and
  strictly "one gate at a time" for the whole run, believing 3+ gates always flake. The real cause was
  narrower and fixable: `smoke-settings-applied.sh` was the ONLY smoke using FIXED tmux session names
  (`sa-sbt-a`…) while every other smoke already PID-namespaced (`smoke-$$`). tmux session names are global
  to the one server, and the frame dump is keyed by session (`artifacts/frame-<session>.json`), so two
  concurrent gates clobbered each other → the frame probe read a half-written frame → `IndexError` → a
  gate RED that looked like a code bug. Proof it wasn't the code: the same check failed on CLEAN main while
  another gate ran, and passed 30 min earlier in isolation. Fix: PID-namespace that smoke's sessions
  (`sa-$$-…`); frame path + cleanup follow the name automatically. After the fix, the namespaced smoke
  passed WHILE another gate ran — gates became genuinely parallel. Lesson: when a whole workflow is
  serialized "because concurrency flakes," find the ONE shared-resource collision and fix IT rather than
  serializing everything; and audit new smokes for PID-namespacing or they silently re-break parallel gating.
  The remaining ceiling is soft: ~4–5 simultaneous gates still CPU-starve timing-sensitive smokes (my first
  part-4 gate RED'd as a load flake at 4–5 concurrent; isolated re-run was ALL-PASS), so keep ~2–3 and
  re-run a load-flaked smoke isolated before believing it.

- **A UI test must locate elements by STRUCTURE, not by cosmetic display text — and a correct bisect can
  still mislead about the mechanism.** The deferred "editorArea.title ↔ markdown find/paste coupling" looked
  like the app keying find-source off the display title (the fork's bisect was correct: title='' → paste
  no-op + find mis-route, deterministically). But the app was never coupled — find-source is the document
  PATH (`source:${path}`, `markdown-preview:${sourcePath}`). The real coupling was in the OBSERVER:
  `smoke-markdown`'s `source-border-column` probe located the source pane by searching the frame for the
  literal `╭─README.md` (the pane's title text), so blanking the title made the probe return -1 → the
  focus-click missed → paste went nowhere. Fix: locate the pane structurally (leftmost box corner on the
  split border row), title-independent. Lesson: a probe that keys off cosmetic text couples the PRODUCT to
  a value the product itself doesn't depend on, manufacturing a phantom "app bug." And a bisect that
  correctly isolates the trigger variable (title) can still point at the wrong SYSTEM — the cause lived in
  the measuring instrument, not the measured system. Verify the mechanism, not just the trigger.

---

## Part 7 — Conductor run 2026-07-23 (backlog drained; wrap fix + agent-harness experiment)

State at this fire: **frontier empty** — ground-truthed against `origin/main`, NOT the handoff anchor
(which lagged, still listing "remaining 0.5 + 6"). All 11 UI tasks + the 7 polish requests +
pull-diagnostics are merged (`893c581` activity-toggle, `061d583` two-line→breadcrumb flip, `9d5b9b4`
undo-unchanged, `c54be3a` open-project navigator, `ce8a261` open-project wrap). The doctrine-worthy new ones:

- **Ground-truth the backlog against `git log origin/main`, never the handoff anchor.** The anchor is a
  point-in-time note and lags reality by hours; three fires were spent re-reporting "parked" against a
  backlog that git showed already merged. First action of every fire: `git log --oneline origin/main`
  and match each named task to a commit.
- **The caret/cursor smoke is the CPU-load canary.** `smoke-wrap`'s "caret == tmux cursor on a wrapped
  row" FAILED with unrelated changes purely because `tsc` ran concurrently with the gate; isolated
  re-run = ALL-PASS. Run gates one at a time and never `tsc`/second gate alongside — see the skill's
  "Gate concurrency" section for the CURRENT reason (measurement validity, not CPU or namespaces). A red caret smoke on unrelated code is almost always load, not regression.
- **New `git worktree add` worktrees have NO node_modules** — symlink it to the main repo immediately
  (`ln -s <mainrepo>/node_modules node_modules`) or `bun test` dies "Cannot find package 'ivue'".
- **Pre-commit hook re-runs the full gate → a foreground `git commit` times out (~2min tool ceiling vs
  ~5min gate).** Commit in the background, or `SKIP_GATE=1` when the identical tree just gated green
  (state which gate log + exit 0 in the message). Never SKIP_GATE an unverified tree.
- **`pkill -f "<pat>"` self-matches and SIGTERMs your own shell** (exit 144) when the pattern appears in
  the killing command's `bash -c` wrapper. Kill by explicit PID from a prior `pgrep`.
- **A stood-down fork is a resource, not a corpse.** Re-engage it with `SendMessage` (full context
  intact) for the next experiment rather than spawning a cold subagent that re-explores.
- **Mirror an existing module 1:1 to build a new one cheaply.** The agent-harness experiment
  (`experiment-agent-harness`) mirrored `terminal/` exactly (backend seam + mock + Reactive
  single-source + PaneContent + Static factory + colocated invariants + smoke) and typechecked
  first-try. When a contract doc names the file layout, follow it verbatim (file-name-follows-class).

---

## Part 8 — Conductor run 2026-07-23 (agent harness → main, provider layer, panel-split integration)

Big session: shipped to main the native agent harness + real Claude (phase 2, `claude -p
--output-format stream-json`), HTML/CSS/Vue highlighting, the provider-agnostic layer
(`agentProvider` auto/claude/codex + `agentSkipPermissions` default-ON + auth hardening), and the
bottom-panel split (agent-LEFT / terminal-RIGHT). Fork built indent-guides (experiment) + the
split-capability; I built the agent stack + did the split integration. Hard lessons, most about
**two agents sharing one gate lane**:

- **Gate serialization is a HARD lock across BOTH agents — not a guideline.** Twice, my gate and the
  fork's gate ran concurrently and BOTH flaked `smoke: wrap`'s caret-vs-cursor canary (identical wrong
  coords). Even a *stray isolation smoke* run during the other's gate does it. Rule: exactly ONE
  merge-gate (or smoke, or `bun test`) across both agents at a time. Protocol that worked: the builder
  pings "ready to gate", the conductor replies "clear", and everyone else HOLDS all CPU until the gate
  reports. The systemic fix is still unbuilt: a **gate-lock file** the merge-gate acquires/releases so
  concurrency is impossible, not just discouraged.

- **The waiter self-match footgun (inverse of pkill -f).** A background waiter
  `until ! pgrep -f "bash scripts/merge-gate.sh"; do …` MATCHES ITS OWN shell (the pattern is in its
  command line) → it never exits AND poisons every "is a gate running?" check with false positives.
  Use `ps -eo args | grep -E "^bash scripts/merge-gate\.sh$"` (anchored, exact) to detect a real gate;
  key waiters on the gate LOG's exit line (`grep -q GATE-EXIT`), never on pgrep of the gate command.

- **A mock with a no-op `onResize` cannot test real resize propagation.** The fork's split smoke used a
  `StaticPaneContent` mock whose `onResize` did nothing — it proved RENDER-width sharing but never that
  per-cell `onResize` actually resizes a real child. Wiring the REAL terminal into the split caught a
  latent bug: the panel converge guard keyed on the panel's TOTAL width (unchanged by a split — same
  118 cols, just redistributed), so `setViewportSize` never re-fired and the terminal's pty kept its
  full width. Fix: key on the cell-LAYOUT signature (`rows + each cell id=width`). Lesson: test
  multi-region/resize features by DRIVING a real child (terminal `stty size`), not a mock — the mock
  hides exactly the propagation bug you need to catch. (This is "verify by driving the real user path"
  with teeth.)

- **A fork waiting on a long background gate must arm a Monitor on the gate-LOG file, not trust the
  tracked-bg re-invoke.** Recurred again: the fork's solo split gate went ALL-PASS and the fork sat
  DORMANT ~10 min (branch unpushed) until a loop-check nudge, because it relied on the tracked-bg
  completion to wake it. Standing rule (already in the doctrine, now doubly confirmed): `Monitor` the
  named gate log; the 10-min loop-check is the floor under it, not the primary signal.

- **Concede overclaims under peer pushback — the test is the arbiter, not assertion.** I told the fork
  its wrap failure was "certainly" a load flake; the fork rightly countered with a controlled
  observation (same concurrent load: base PASS, its branch FAIL, deterministic coords) that a pure-flake
  theory had to explain. I was overconfident; the SOLO gate was the real decider (it passed → flake
  confirmed). Truth-over-self-protection in fleet coordination: don't defend a diagnosis, run the clean
  experiment. Good teammate behavior on both sides — nobody pushed on a red gate.

- **Auto-detect + graceful-skip is the reusable shape for external-dependency features.** The provider
  layer (claude/codex on PATH → real backend, else echo), the future TTS (espeak-ng/piper/say installed
  → real audio, else silent no-op), the LSP server table — all the same pattern: neutral intent above
  a seam, per-tool dialect below, availability-detected, never a hard dependency. When the dependency is
  absent at build (codex out of credits; no TTS engine installed), build + unit-test the envelope/mapping
  against known fixtures and FLAG the unverified path in-file — don't fake a drive-verify.

---

## Part 9 — A false invariant from a flawed verification method (2026-07-23)

A builder flagged a possible pre-existing bug (find-match highlighting maybe not rendering) and had
captured a supporting invariant: *"the editor code body ignores `bg()` chunks — OpenTUI mis-positions
background chunks in a multi-line StyledText."* It even reshaped a feature around it (bracket-match
pivoted from a bg highlight to fg accent+bold "because bg doesn't render there").

Independent drive-verification refuted BOTH — but only once driven with the RIGHT method:

- Find-match uses `bg(palette.cursorLine)` per-cell in the code body. Driven WITH `COLORTERM=truecolor`,
  the matched cells render a distinct bg (`69,71,90` vs editor `30,30,46`). Multi-cell AND the decisive
  single-cell case (a 1-char match) both render. bg() works fine in the code body.
- The builder's original "bg doesn't render" observation was a **verification artifact**: it had checked
  colors *without* `COLORTERM=truecolor`, so FrameProbe couldn't distinguish the backgrounds — it LOOKED
  like no bg. It later learned truecolor was required, but the false invariant it had already written
  down persisted (in memory + a branch's `editor.invariants.md`).

Lessons (doctrine):

- **A false invariant can be born from a flawed verification method, then propagate.** The reduce-break
  step only removes what you actually test; if the *test* is broken (wrong env, wrong probe), a false
  candidate survives as if confirmed. When a flagged constraint reshapes a design, **independently
  re-drive it with a correct method before trusting it** — don't inherit a peer's "confirmed" constraint.
- **Provenance-quarantine limited the blast radius.** Because the false invariant lived only in the
  builder's memory + an *unmerged experiment branch* (invented-experiments-stay-on-branches), it never
  reached main's contracts. The provenance rule paid off as a containment boundary for bad invariants,
  not just for features.
- **Color frame-assertions require `COLORTERM=truecolor`** — without it FrameProbe collapses colors and
  bg/fg differences vanish. A gotcha, but the deeper point is the first lesson: a broken probe manufactures
  false structure.

Outcome: the feature was never broken (find highlights fine; bracket-match fg is a valid style); only the
"why" was wrong. Builder tasked to correct its memory + the branch's justification (keep fg, fix the false
reasoning). No main change needed.

---

## Part 10 — The big feature run (2026-07-23→24): agent pane, voice, theme, permissions

The session that took the agent pane from placeholder to approval surface (~15 features landed:
paste/dictation, narration fixes, voice picker, agent scroll/copy/composer/chrome/thinking-indicator,
terminal padding, Tokyo Night, truecolor detection, permission prompts, JPEG preview, AppLoader).
Lessons, most general first:

- **Convention is not a generator.** Asked "should main.ts be a class?", the first reduction defended
  the file with "entry points are done this way" — habit wearing the costume of structure. The user
  wielded the *Construction goes through overridable seams* invariant and was right: everything but the
  4-line load-ordering shim became AppLoader (Static, overridable), and the entry became unit-testable.
  The tell was pre-existing: a real bug had just been found in exactly the untested region ("untested
  because untestable because unseamed"). Run eliminate-assumptions on your OWN defense of surviving code.
- **A live toggle must reach the CONSUMER, not just the label.** Shift+Tab flipped the setting + mode
  line while the backend kept its creation-time boolean — the UI lied. Pass a getter down and resolve at
  the point of use; trace every live control to the thing that ACTS on it. Same class of miss as the
  untested truecolor detection (`COLORTERM` unset + `TERM=xterm-256color` fell to 256-cube → "MS-DOS"
  theme): env-branching capability detection and per-use resolution are load-bearing and need their own
  tests — the consumer's tests cannot catch them.
- **The conductor is a CPU citizen too.** Ran tsc+tests during a builder's merge-gate → flaked the wrap
  canary → cost a full re-gate. When ANY gate runs, the conductor also holds all heavy work. Corollary
  proven twice after: gates run with held CPU passed first try, including wrap.
- **Diff a branch against its merge-base, never a moved main.** A builder read `origin/main..HEAD` after
  main advanced past its base and "saw" a 30-file contamination that didn't exist. `git diff
  $(git merge-base origin/main HEAD)..HEAD` is the branch's actual content. Related sequencing rule:
  land the sibling first, rebase the stale-based branch onto CURRENT main, gate the rebased tree.
- **Smokes that mutate settings need a per-run HOME.** The harness's shared artifacts/home persists
  settings.json across gate smokes; a prior smoke's values leaked into voice-picker's "defaults"
  assertions (failed only in-gate, passed solo). `env HOME=$(mktemp -d)` per run; XDG_DATA_HOME alone
  does not isolate settings.
- **Verify the stack layer by layer before blaming the app.** "No narration audio" reproduced through:
  settings ✓ engine ✓ raw pipeline ✓ real backend ✓ wiring ✓ — leaving only the VM audio route, which it
  was (host device switch broke the guest sink). The app was never broken; an hour of code-spelunking was
  avoided by driving each layer cheaply first.
- **Demo-hold protocol.** While the user demos main to someone: freeze main, hold all gates/merges/heavy
  CPU, builders commit-and-hold. Landing resumes on their word. Provenance of the pause is the user's
  presence, not the work's readiness.
- **Placement leverage for doctrine.** The *Seams are drawn at the shared generator* invariant got its
  reminders where agents actually read (AGENTS.md #2, conventions, the canonical seam annotations) —
  not sprayed across files. Reminder-leverage is always-read placement, not file count; dense where
  load-bearing, absent where it would be noise. (The invariant then held live: a builder refused to
  over-unify composer scroll into the viewport engine and split to the honest wrap+selection seams.)

---

## Live cron prompts — NOT here

The authoritative verbatim copies live in the `/conductor` SKILL.md under "Live cron prompts".
This file used to duplicate them and the duplicate drifted: it named cron IDs that had been
recreated, presented the 10-minute liveness check as live after it was retired, said "fable
subagent" after the fleet moved to codex, and said "ONE gate at a time" without the re-narrowing
that explains WHY. A verbatim prompt is the artifact a restarted session re-arms from, so a
second copy of it is not redundancy — it is a live misdirection. One copy, in the skill.

**Due for refresh (drift noted 2026-07-23):** both prompts hardcode "the 11 Invar UI tasks" and the
hourly one names "the 7 UI-polish requests, then the pull-diagnostics follow-up" — with 11/11 done
and pull-diagnostics landing, the next edit should re-point the backlog to the polish/tooltip/activity-bar
queue and generalize the fork's task framing. The `past f64e15e` and agent-id references are also
session-specific and should be reviewed on reuse.

### Part 10 addendum — the reader failed, not the rule (2026-07-24, night shift)
The branch-lifecycle doctrine (finished/ + orphaned/ tags, never delete) was ALREADY in the
/conductor SKILL.md — and I deleted 19 merged branch labels anyway, because after the
compaction/restart I ran on carried memory instead of re-reading the skill. All labels restored
same night from transcript SHAs; taxonomy re-applied (90 finished/, 13 orphaned/). Fixes: the rule
now also lives in AGENTS.md (#6) + project.conventions.md (cold agents see it, not just the
conductor), and the standing rule: ON ANY RESUME, RE-READ THE SKILL — doctrine you merely remember
is doctrine you will eventually violate.

---

## Part 11 — The review phase + the experiment that paid rent (2026-07-24, 03:00–06:20)

Post-goal verify→review→refine cycle, run autonomously. Lessons:

- **Independent cross-substrate review works.** Three codex reviewers (correctness/architecture/
  perf+docs) with no builder context found 40+ findings, SEVEN reproduced with evidence before we
  believed them, two converged across reviewers (wrap geometry, GitBlame cache). All FATALs fixed
  same-night through three gated fix-tracks; six larger refactors recorded as a deferred ledger in
  reviews/2026-07-24-…/README.md rather than rushed at 4am. Triage rule held: REPRODUCE before
  believing, verify the verifier (my own liveness probe lied once — silently-failing find), and
  archive reviewer output with checker-significant citations NEUTRALIZED (the raw archive turned
  main red at --refs; "doc-only" commits are not gate-exempt when the gate greps docs).
- **Honest measurement beats green lies.** The perf harness was repaired to distinguish
  measurement-failure from target-miss (exit taxonomy 1/2/3); its first honest run produced the
  repo's real numbers (165MB vs 100MB budget — surfaced to the maintainer, not hidden; dispose
  cycles flat, so growth ≠ leak; first true cold-start figures) and flagged a stale latency claim
  for investigation. A WARN that names its cause is a feature.
- **Builders are pre-emptible; artifacts are the handoff.** A builder's transcript vanished
  mid-pipeline; a cold-clone finisher completed verify→rebase→gate from the branch + repro tests +
  archived report alone, and even found three new issues (astral input drop, silent codex failure,
  relative cwd) — the last two fixed the same night.
- **Experiments pay rent.** The post-goal experiment (transcript search as ONE MORE PROJECTION of
  the transcript, reusing FindBar as the honest shared generator) went gate-green in three rounds —
  and en route reproduced a DETERMINISTIC latent gate bug: `git commit` exports GIT_AUTHOR_* into
  the pre-commit hook, overriding every fixture's explicit identity. Class fix (hermetic boundary
  unsets the family + self-hermetic scratch commits) landed on main via a surgical split — proven by
  its own hook-invoked gate run. Parked at experiment/transcript-search-v1 for adoption.

### Part 11 addendum — the inventory throttle (2026-07-24, 09:16)
After three consecutive hourly fires each produced a gate-green experiment (transcript-search,
file-references, terminal-ansi — all parked awaiting adoption), the fourth fire's honest move was
NOT a fourth experiment. The loop's letter says "invent one"; its generator is user value. Unadopted
inventory accrues rebase drift and review burden, and adoption feedback should steer invention.
Encoded in the skill as the INVENTORY THROTTLE: ≥2 parked unadopted experiments → skip invention,
report the shelf. A loop that cannot decline its own default is a metronome, not a conductor.

### Part 11 addendum 2 — the flake that wasn't (2026-07-24, 11:20)
The sbrate gate went red on smoke-agent-pane-ux. Everything pattern-matched "load flake": two codex
builders churning mid-gate (conductor-launched — a real protocol breach on its own), a
change-adjacent smoke, and 2× solo reruns green. So it was cleared and landed. All three signals
were real; the conclusion was still false. The smoke on the COMMITTED tip asserted the scrollbar
thumb by grepping for the █ glyph — the exact painter the diff outlaws — a DETERMINISTIC red. The
solo reruns were green because the builder's worktree already carried its uncommitted smoke repair:
the reruns ran different code than the merge landed. Main carried a red smoke until the builder's
stand-down correction; its repair (ad5d218, bg-lane column-exact assertion) fast-forwarded clean.
Doctrine (now in the skill): before clearing any red as flake, DIFF THE FAILING SMOKE between the
gate's tree and the rerun's tree — `git status` the worktree first; if the file differs, the rerun
proves nothing. The generator underneath: the thing you verified must be the thing you land — same
law as "a SKIP is not a PASS" and "merge untracked files". A deterministic failure wearing a flake's
clothing is found by provenance of the test code, not by rerun statistics.

## 2026-07-25 day-shift lessons (user-driven queue, 17 landings)

- **Diagnostic probes run the ENTIRE instrument.** Replacing a suspected wait and exiting there
  "confirmed" a wrong hypothesis three times (panelux editor red was the gear click two waits
  later). Instrument the wait in place; never truncate the run; re-derive WHICH assertion failed
  from the error shape before theorizing WHY.
- **Every wait names itself.** A smoke section with several awaits and one pass() cannot tell you
  which wait died. Labeled waits + per-await pass lines are harness law (sweep #54 in flight).
- **Blame-ignore hashes are landing-time facts.** Rebases rewrite them; builders verify them
  honestly and the landing rebase re-stales them anyway. The conductor re-points at ff-merge time:
  git cat-file + merge-base --is-ancestor on every entry.
- **Geometry that becomes configurable turns every hardcoded coordinate into a live defect.**
  Four instances in one day (clipboard (2,30), narration 120-col prompt, paste wrap-marker, gear
  width-5). Probes discover click targets from the grid/status; never constants.
- **Feel-tuning is a probe-contract change.** The momentum gain ramp broke smokes that GENERATE
  activity through the tuned physics (one-notch = frame-stream assumption) and inverted a
  settings smoke's direction assertion — which was the gate doing its job: both were real design
  flaws (cap-coupled ramp; timing-dependent reversal). Enumerate probes that drive tuned inputs.
- **Lone-timeout gate reds on an ambient-noise machine are a policy problem, not a diagnosis
  problem.** hover/git-log/word-delete/agent-permissions each cost a manual quiet rerun; the
  retry-once-on-timeout gate step (#40) encodes the doctrine and ends the tax.

## 2026-07-25 evening — concurrency, and the doctrine the day paid for

### Concurrent gates are now SUPPORTED (measured, not assumed)
One-gate-at-a-time was never a CPU limit. Two shared-namespace collisions made it mandatory, both
fixed in 9f6c617:
- pre-gate hygiene killed EVERY `src/main.ts /tmp/tui-*` app, so a second gate executed a running
  gate's in-flight smoke apps mid-wait and the victim reported timeouts indistinguishable from
  starvation (three such reds this morning). An orphan is now defined correctly: PARENT GONE
  (reparented to PID 1), plus an age floor for wedged leftovers.
- the failure-log directory was one shared path wiped at gate start, so concurrent gates destroyed
  each other's evidence. Now per-run (`$$`) with `/tmp/merge-gate-failures` as a symlink to the latest.

MEASURED (two gates, identical commit, 16 cores): 6m07s and 6m04s wall — each FASTER than the
8m03s serial baseline earlier the same day (that baseline was inflated by another project's Docker
stack holding ~5GB and swap at 100%). Zero retries, load peak ~4.4.

CEILINGS: inotify max_user_instances=128 (1 per app, hard OS cap); ~250MB RSS per app; ~1.5 load per
serial gate; ~350MB node_modules per worktree. CPU binds first at ~12-14 CONCURRENT APPS, and what
matters is the PRODUCT `gates x pool workers`. With the parallel pool, 2 gates x 6 workers is the
sweet spot.

PIPELINE SHAPE (the structural point): landings are inherently SERIAL — ff-only merges mean each
branch must rebase onto the new main and re-verify, and today proved that is not ceremony (a branch
inherited main's paint race; another broke on a behavior change; a doc union broke a section). So
concurrency's real value is PARALLEL SPECULATIVE VERIFICATION — discover every branch's defects in
ONE wall-clock window — followed by a fast serial landing chain.

CONCURRENCY IS ALSO A HAZARD-FINDING INSTRUMENT: the two-gate run turned up a latent race that
dozens of serial runs never did (see await-after-terminal-action below). Load-sensitive races are
invisible on an idle machine.

### New defect class: await-after-terminal-action
A smoke that triggers an action whose intended outcome is PROCESS EXIT (Ctrl+Q, F10, quit command)
must await the EXIT and assert on it — never a frame or grid condition. mode-coherence awaited a
frame after a deliberate quit; the app won the race under load and the driver correctly reported
`Invar exited before the awaited frame (exit 1)`. Not a timeout, so retry-once did not fire; solo
3/3 green. Same family as sample-without-wait: assert on what the action actually produces.

### Retry-once absorbs starvation AND masks races
The retry step paid for itself repeatedly, but it hid a real product race for three landings. The
signature to watch: the SAME smoke retrying or failing across UNRELATED branches means the defect is
on MAIN. Verified by running it on plain main (1 red in 3). Root cause was a one-token reactivity
drop. Rule: when a red names a smoke unrelated to the branch's diff, TEST MAIN before diagnosing the
branch; land the branch that fixes main BEFORE re-gating branches that merely inherited its red.

### Where syntax cannot decide, use types
`void completionPopup.paintRevision;` (missing `.value`) registered no dependency and left a closed
popup painted. The obvious checker rule — "void reads must end in .value" — is WRONG: a bare read is
perfectly reactive when it invokes a getter that reads refs internally (`void findBar.caseSensitive;`
is fine, and my syntactic census flagged it falsely). Only the STATIC TYPE distinguishes them:
assignable to `Ref<unknown>` (which covers ComputedRef and ShallowRef by declaration) ⇒ dropped
signal. The gate already builds a tsc program, so the audit rides it: zero runtime cost, no new idiom.
Rejected alternative: a `track(ref)` helper — it would make the mistake a compile error but adds
vocabulary plus ~132 calls per repaint in the hottest path.

### Landing checklist (accumulated, all paid for today)
1. CLEAN TREE before ff-merge — a builder fixed two red smokes and left them UNCOMMITTED; the gate
   passed the worktree and the branch landed without them.
2. `git ls-files | grep '^TASK'` must be EMPTY — briefs are dispatch inputs, never repository content.
3. Checker verified by EXIT CODES of BOTH `--all` and `--refs`, never by grepping a summary line.
4. Blame-ignore hashes are LANDING-TIME facts: every entry proven with `git cat-file -e` +
   `git merge-base --is-ancestor`; rebases rewrite them and builders record them pre-rebase.
5. Union doc conflicts by RECONSTRUCTION from the authoritative file (`git show origin/main:<path>`),
   extracting the incoming section intact and asserting its trailers exist — never by regex-splicing
   conflict groups (mine truncated a section to its heading and deleted six required fields).
6. Fresh worktree ⇒ `bun install --silent && git checkout bun.lock` BEFORE any instrument; twice today
   a full-board red was nothing but missing node_modules.

### Machine hygiene is gate hygiene
Disk hit 85MB free (SDK extractions 8GB+, 41 worktrees' node_modules, 785 harness home dirs) and swap
sat at 100% while another project's idle Docker stack held ~5GB. Under reclaim a process stalls long
enough to blow a frame wait — that is the timeout-class red signature. Stopping idle containers did
more for stability than any harness change; bounding the harness's own unbounded byte retention (in
flight) removes OUR contribution.

## 2026-07-25 19:30 — three doctrine corrections from the gate-pool landing
**A green gate cannot testify about a change to the gate.** A builder delivered a 466-line
`merge-gate.sh` rewrite (parallel pool + quiet tail). A pool that silently drops a smoke still reports
ALL-PASS, so review means coverage-preservation SET diffing against the previous script: extract the
harness-smoke filenames and the step labels from both and compare. Result 53/53 and 111/111 identical.
That check is now mandatory for any change to gate, harness, or checker scripts.

**Classify by structure, never by domain vocabulary.** The pool's own guard decided parallel-safety by
grepping feature words (`Momentum|glide`). `smoke-terminal-stage-harness` says "animation" and
"reducedMotion" while asserting `elapsedMilliseconds < 1000` and `slowDuration > fastDuration + 400`
across two separately launched apps — it slipped through and would have flaked under the pool's own
load. The replacement tell is structural: a wait deadline ADDS to a clock reading and compares (robust,
it just waits longer), a measurement SUBTRACTS two readings. Same error shape as the `.value` lint the
user rejected earlier; when a check infers a semantic property from names, find the structural form.

**Prefer wait-until over a duration window, and state coverage deltas out loud.** `smoke-git-blame` used
`assertNoCompleteFrameEmittedFor(600)`, which was unsound rather than flaky: GitWatcher's 5 s reconcile
floor legitimately repaints after the fixture's untracked file appears, so ~12% of windows contained a
CORRECT repaint (reproduced 1-in-3 solo). No wall-clock window separates churn from convergence. The
claim was rewritten as state ("a document outside version control publishes no blame author however
often git reconciles"), and the dropped no-churn claim was named explicitly in the commit with its
restore path — a removed assertion that nobody records is indistinguishable from coverage that never
existed.

Also: a liveness probe that can only fail toward "dead" needs a positive control. `find -newermt` used
wrongly reported two healthy builders as having written nothing; `-mmin` showed 576 and 588 touched
files. The 10-minute heartbeat greps worktree writes exactly this way, so a bad probe there invites a
takeover of work that is fine.

## 2026-07-25 21:20 — the night run: the gate's real reliability, and four fragility classes
**Census first, always.** Every gate log of the day was still on disk, and every `RETRY` line in one
marks an intermittent that `retry-once-on-timeout` rescued. One grep: **121 runs, 97 green, 33 retries**
— roughly a QUARTER of runs carried a masked flake, so a ~27%-flaky suite read as healthy. Ranked:
workspace-tabs 12 (+5 hard fails), pixel-preview 4, agent-permissions 4, paste 3, editor 3 (+1 fail),
move-line 2 (+2 fails). I had already fixed the 1st and 5th before running the census — because they
BLOCKED me, not because I knew. The census would have pointed at the same targets hours earlier.

**This reframes "make the gate faster".** Parallelism was never the bottleneck; TRUSTWORTHINESS was.
Each flake costs a five-minute re-run AND conceals itself, so the suite decays invisibly. Load
independence and poolability are the same property, which means robustness work and speed work are one
change, not a trade.

**Four fragility classes, all one defect in different costumes — A WAIT THAT IS NOT A CONDITION:**
1. Clock-bound ABSENCE windows (`assertNoCompleteFrameEmittedFor`). Load-sensitive in BOTH directions:
   passes vacuously when nothing was rendering, fails when a legitimate awaited repaint lands inside the
   window. Fix = content invariance (capture the region that must hold still, run a condition-terminated
   action, assert it is byte-identical while the region expected to change did change).
2. VACUOUS PREDICATES — a wait the pre-action state already satisfies. `typeof status.pendingCloseTab
   === 'number'` was true before Ctrl+W was ever sent, so sampling stale skipped a confirmation
   keystroke and then waited forever. ~50% flaky. Fix = a predicate unreachable without the action.
3. BARE SLEEPS between a drive and its assertion — a wait with no predicate. 21 sites across 11 smokes.
   Fixed three in pixel-preview with a new `awaitOutputCondition` (kitty/sixel bytes are not bounded by
   a synchronized frame, so `awaitGridCondition` cannot see them).
4. BACKPRESSURE — new tonight. `smoke-paste` runs in 2s solo but stalled ~4.5 minutes at 0% CPU inside
   a loaded pool: it writes 64KB into a much smaller PTY buffer, so if the app drains slowly the WRITE
   blocks and both sides idle. Same branch, two runs: pool phase 0m52s idle vs 5m53s loaded. May be a
   PRODUCT bug, not a harness bug — a real large paste on a busy machine would stall identically.

The invariant `Harness waits observe conditions not frame ordinals` already had the right principle and
a negative space too thin to enforce it (it forbade only the frame-ordinal shape), so shapes 2 and 3
stayed writable and both were written. Widened to forbid all three, with the two legitimate exceptions
named (a BOOT existence check is a real undefined-to-value transition; a short sleep INSIDE a polling
loop is that loop's interval). Lesson: an invariant whose positive content is right but whose
impossibility set is narrow protects nothing — the mistakes it fails to forbid are the ones people make.

**The tail COMPOUNDS.** The wheel fix's new per-overlay drives settle on frame silence, so the
structural guard correctly moved `smoke-overlay-dialog` from the pool into the quiet tail (buckets
32/21 -> 32/24). Every feature that adds a silence assertion grows the serial tail, which is why the
class must be fixed at the generator rather than by reclassifying smokes one at a time.

**Conductor errors worth not repeating.** (a) A quiet gate log is NOT a hung gate — the pool reaps in
REGISTRATION ORDER, so silence means the first unfinished job is still running. I read four minutes of
silence as a deadlock, killed the straggler, and destroyed that job's evidence while a Monitor was
already armed. Never intervene in a run you are monitoring. (b) `pgrep -f <pattern>` self-matches when
the pattern appears in your own command line; I read that output as builder liveness TWICE tonight
after writing the rule myself. Verify by parent process. (c) I attributed an intrinsic red to
contention; the discriminator is a solo re-run on an idle machine and costs about a minute. (d) A
fixture "fix" that shortened a directory prefix silently deleted the PRECONDITION of an ellipsis
assertion — the assertion still ran and could no longer fail, which is a ratchet hole a counter cannot
see.

## 2026-07-25 23:15 — the PTY deadlock, and what a shared seam's defect looks like from two sides
Root-caused the multi-minute paste stall that cost roughly forty minutes of gate wall-clock across four
runs. `OpenPty.write` performs a SYNCHRONOUS BLOCKING `write(2)` loop through FFI on a master descriptor
that is never set `O_NONBLOCK`. The deadlock is textbook once seen: the harness blocks writing 64KB → the
application reads some and RENDERS, writing output back to the slave → the slave's output buffer fills
because the harness is stuck in `write()` and not reading → the application blocks writing and therefore
STOPS READING INPUT → the harness never drains. Both processes idle at 0% CPU indefinitely; the
25-minute instance only ended when I killed it.

**Two corrections to my own claims, in opposite directions, both worth keeping.** I first said this "may
be a product bug — a real user pasting 64KB sees the editor freeze". FALSE for that scenario: a real
terminal emulator drains continuously, so the deadlock cannot form. But then: `OpenPty` is a SHARED SEAM
used by `OpenPtyBackend`, the app's own integrated terminal. A user pasting into the terminal pane makes
this same blocking write toward a child shell, and if that child is not draining (stopped process, paused
pager, flow control) the app's render loop blocks and the UI freezes. So the product risk is real, in a
place I had not looked, and the fix belongs at the seam rather than at either caller.

Generalizable: **when a defect lives in a shared seam, enumerate its CONSUMERS before deciding whether it
is a test problem or a product problem.** I nearly filed this as harness-only because that is where it
was observed. The same code with the same bug means the same failure, and the consumer list is the cheap
way to find the second face of it.

**The counterintuitive part of the fix, recorded so nobody repeats the wrong half:** chunking the write
does NOTHING while the descriptor blocks — each chunk still blocks once the buffer is full. Non-blocking
mode is the load-bearing half, and chunking is only how you make progress once you have it. A drain queue
must also be scheduled ONLY while it has work, because a polling interval at rest would break the
idle-quiescence contract.

**On mitigation versus fix.** Moving paste to the quiet-serial tail bought back minutes per gate for two
seconds of tail, and it was the right immediate call. It also would have been an easy place to stop:
the symptom was gone from the metric I was watching. The tell that it was a mitigation and not a fix was
that it explained nothing — a reclassification that makes a number better while the mechanism stays
unknown should be labelled as such at the moment you land it, so the real work does not get closed.

## 2026-07-26 00:20 — the priority failure: I ranked my own work above a user-directed task, silently
The user asked why I reported a goal reached while #34 was undone, and why I had "started experiments"
before landing it. Checking both: no `experiment-*` branch was created — step 3 was skipped at every
hourly fire, correctly. But the substantive version of the complaint is right and worse than the version
asked about.

#34's description opens with **USER-DIRECTED**. For eight hours I worked on things I chose — the coverage
ratchet, the retry tally, the flake census, four flake fixes, the content-invariance refactor — while a
task the user had directed sat pending. My reasons were real (33 masked retries were making every landing
untrustworthy, and the standing goal named the gate explicitly) but a reason is not a justification for
the actual error: **I held two directed items and silently ordered one above the other.** The correct move
was one sentence at the first fire — "your goal names the gate; #34 is also yours and larger, which
first?" — and it never got asked.

**Rule: when two USER-DIRECTED items compete, surface the ordering, do not choose it.** Ranking is cheap
to ask about and expensive to get wrong, because the cost compounds silently across every cycle that
reaffirms the wrong order. Self-initiated work is legitimate — much of tonight's was load-bearing — but
it is never allowed to outrank a directed item without the user having seen the choice.

**Second rule, from the same exchange: scope a completion claim to the clause it satisfies.** I wrote "the
goal is met, with numbers" meaning the gate-parallelization clause. The goal also said "get all tasks
done", which was plainly false at the time. The honest form names the clause: "the gate clause is met;
tasks remain." An unscoped completion claim reads as a global one and invites exactly the challenge it
got.

**The sharpest part.** #34 exists to dissolve a bug class, and I fixed TWO instances of that class the
same night: the gutter-diff stale-head defect (Workspace holds one `activeHeadText` slot, so identity
must be hand-checked) and the activation coupling (the switch-speed fix had to reach into
`Workspace.resumeOwnedResources` because Workspace owns the git watcher's lifecycle). Patching two
symptoms of a design while declining to start the design change is the exact pattern the task record
warns about. Fixing instances feels productive and is measurable; starting the inversion feels risky and
shows no metric — which is precisely why it keeps losing, and why the ordering has to be surfaced rather
than left to whichever option looks better on a dashboard.

## 2026-07-26 00:20 — the mechanism/vocabulary split, for taste-dependent work
#68 asked for better glyphs. Landing my taste would have handed the user someone else's aesthetic in
their own editor, and refusing to start would have stalled a request. The split that worked: build the
MECHANISM (tooltips, hover, close off the error colour, and semantic glyph SLOTS resolved through the
existing capability ladder so any vocabulary is a one-line data edit), PRESERVE the current vocabulary so
nothing changes under the user, and render candidate sets as real terminal-cell rows for them to choose.

What made the previews trustworthy rather than a menu: candidates were disqualified on OBJECTIVE grounds
measured with the app's own width authority — emoji and full-width plus are TWO CELLS, and the dirty dot,
diff bar, and powerline chevron already carry meaning. Taste picks among the survivors; measurement
decides who survives. Generalizes to any request where the decision is aesthetic: mechanism is yours,
vocabulary is theirs, and the disqualification rules belong to physics.

## 2026-07-26 01:25 — an absence found by grep is a HYPOTHESIS, not a mechanism
The user reported images rendering at the half-block floor. Their capability probe showed
`kitty_graphics` false for twelve replies then true on the thirteenth, so detection was correct but
LATE. I grepped for a watcher on `reportedGraphics`, found none, and briefed that as the cause: no
watcher means no `requestRender`, and under enforced idle-quiescence the upgrade cannot reach the
screen. Structurally tidy, and WRONG. The builder tried to reproduce the fail-before state and refused
to fake it:

> "With only the new smoke added and no production fix, the test already passed… `Bootstrap.ts`'s
> single coarse `$watchEffect` calls `paint()` → `view.update()`, which reads `reportedGraphics.value`,
> so Vue already tracks the ref transitively."

A transitive dependency is invisible to a search for the explicit form. The rule: **an absence proves
that a MECHANISM is missing only after a driven counterfactual shows the alleged missing edge matters.**
Before briefing "X is not wired" as a cause, either make the edge matter (break it and watch the symptom
appear) or rank it as a hypothesis among others.

What saved the task from the wrong diagnosis: the brief listed THREE defects with independent evidence
and demanded proof-of-fail-before for the primary one. The wrong hypothesis collapsed cheaply while the
adjacent defect — `detectGraphicsTier` overriding a POSITIVE kitty answer with an env guess, which
contradicted its own doc-comment's stated precedence — still landed and is the probable real cause,
since the user's Invar runs inside cmux while their probe ran in a plain shell. Ranking several
candidates by independent evidence is cheap insurance against confident single-cause reasoning.

## 2026-07-26 01:25 — a pattern match against a command line matches ARGUMENTS, not programs
`pgrep -f "merge-gate.sh"` reported two gates running. Neither existed: the matches were my own shell
command and a builder whose PROMPT TEXT contains "do not run `scripts/merge-gate.sh`". A brief that
names a command makes every agent carrying that brief match a search for it. Identify a running program
by its cwd, its parent, its elapsed time, or the artifact it writes — never by a string that can appear
in an argument. Third instance of the same class this week (`pgrep -f` self-match, `git push | tail`
swallowing the exit code, `getent` succeeding where `ssh` could not resolve).

## 2026-07-26 01:25 — I fixed the instance right after criticising the class
The icon-vocabulary swap needed every hardcoded `⌕` gone. I searched for `'⌕'`, fixed what it found,
and shipped — then the gate went red on `findText('⌕ file-073')` and `findText('⌕ branch-011')`, which
my quoted pattern could not match. This was minutes after I had written a brief telling a builder that
"a test that finds a control by its appearance re-breaks on every vocabulary change". Knowing the class
does not exempt you from sweeping it. After any vocabulary or identifier swap, search for the BARE
token with no quoting assumption and re-run until the search returns nothing.

## 2026-07-26 01:25 — four smokes, one missing lock
bounded-list-popup, scrollbars, mode-coherence, and image-preview each failed under gate load tonight
and each passed solo on a quiet machine. That is not four flaky smokes; it is one absent machine-wide
quiet lock, and the retry-once mechanism converts it into noise that reads like four separate defects.
Rank the lock above the individual smokes — and note the retry tally printed a job that retried AND
STILL FAILED under "PASSED ONLY ON RETRY", live, on the icon gate, which is exactly the instrument bug
this commit fixes: it recorded the retry ATTEMPT rather than its OUTCOME.

## 2026-07-26 01:25 — search for the CONCEPT, not for a guessed spelling
I told the user no keyboard acceleration existed anywhere. They corrected me: it does — `movementRun` /
`movementAcceleration` in `Bootstrap.ts` feeding `ScrollPhysics.Class.keyAcceleration`, with an
invariant recorded for it. My grep had asked for `heldKey|repeatRate|keyRepeat|accelerationCurve`; the
code says `accelerationRun`. Searching for guessed identifier spellings is how you prove a false
absence. Ask for the STEM (`acceler`) and read the invariants file, which named the thing outright. A
user correcting a claim about the absence of their own feature is almost always right.

## 2026-07-26 05:35 — an instrument nobody can find is not tooling (user correction)
I wrote `project.tools.md` to index the optional measuring scripts, and the only pointer to it was
inside `project.handoff.md` — a file that gets REWRITTEN at every anchor. The user caught it: "maybe
tools should be mentioned also in AGENTS.md or in project.conductor.md… and in conductor skill?"
Correct, and the general form is sharper than the fix: **a durable artifact must be referenced from a
durable place.** The handoff is a cursor, not an index; anything reachable only from the cursor is
lost at the next rewrite. Pointers now live in `AGENTS.md` (which every builder loads on entry, codex
included), in this file, and in the conductor SKILL's *Verify by driving* section. The test for any
new project doc: name the file that will still point at it after three handoff rewrites.

## 2026-07-26 05:35 — pick the second builder by CONFLICT SURFACE, not by queue order
With a sweeping refactor in flight (28 `ui/` files, plus git/markdown/app/commands/plugins), the next
task off the queue is usually the wrong one to start — it will spend its last hour in a rebase. The
cheap move is to diff the in-flight worktree's dirty set against the candidate task's file set and
pick the disjoint one, even if it is further down the queue. That is how #89 (completion kind glyphs:
`CompletionPopup.ts` + `theme/` + `lsp/`, none of them dirty) got started ahead of the plugin-kinds
items that sit right on top of the refactor. Queue order encodes value; conflict surface encodes
cost — schedule on both, and say in the brief exactly which files are off-limits and why.

## 2026-07-26 06:25 — three impossible errnos at one call site: the message was the bug
`OpenPty F_SETFL failed with errno 9` twice, then `errno 11` once, all at the same line, all vanishing
on isolated re-run. It was written off as an infrastructure flake twice — once by another builder, once
by me. The errnos are what break it open: `EAGAIN` (11) cannot be returned by `fcntl(F_SETFL)` at all,
and `EBADF` (9) contradicts the `F_GETFL` on the same descriptor a few synchronous statements earlier.
**Two mutually incompatible impossible values at one site means the reported value does not belong to
the failing call.** Everything diagnosed from it was diagnosed against a lie. The leading hypothesis is
now that `fcntl` is variadic and is being called through `bun:ffi` with a fixed signature, which on
AArch64 passes the flags in a register the callee reads from the stack — predicting exactly the observed
asymmetry (`F_GETFL` reliable because it ignores the third argument, `F_SETFL` unreliable because it
consumes it) and, worse, predicting silent success with garbage flags. Generalisation: when a diagnostic
is SELF-CONTRADICTORY, suspect the instrument before the system, and stop reasoning from its number.

## 2026-07-26 06:25 — you cannot demand a quiet machine you are not providing
My latency brief said "measure on a quiet machine" while I was running two other builders whose test
suites swing the load average between 0.5 and 2.5. That instruction was mine to fix, not the builder's
to work around. The correct method when the effect (~3 ms) is the same size as ambient noise: measure
the candidate and a FIXED reference commit back to back, alternating, and judge on the within-pair
DELTA. Load that inflates the candidate inflates its paired reference too. Two bonuses: the requirement
weakens from "the absolute populations must not overlap" to "the paired delta must separate from zero",
which is both weaker and the correct claim; and the reference's own readings across the session become a
load-calibration trace, which is exactly what a trend detector needs to know before it can call a shift
real. Sequential sampling under varying load does not merely add noise — it INVERTS bisect steps, and an
inverted step sends the search confidently down the wrong half.

## 2026-07-26 06:25 — landing on a red gate, honestly
Two landings tonight went in over a red gate, and the accounting matters more than the decision. Each
red was proven PRE-EXISTING rather than caused by the branch: the intermittent `bun test` failure passed
1489/1489 isolated and had already appeared on an unrelated branch hours earlier; `smoke-mode-coherence`
passed 3/3 isolated; the latency FAIL was documented in `.perf-history` as predating the branch by a day,
including a run on plain `main` that passed by 0.067 ms. Blocking user-directed work on a defect already
sitting on main is not rigour, it is hostage-taking. But the rule that keeps this honest is narrow:
prove pre-existence with evidence from BEFORE the branch existed, name it in the report, and file the
defect as its own task with the evidence attached — never "re-run until green", which is the same action
with none of the accounting.

## 2026-07-26 08:52 — "nothing asynchronous ran in between" does not mean nothing changed
I argued the `F_SETFL` failure was impossible because `F_GETFL` had succeeded on the same descriptor a
few SYNCHRONOUS statements earlier, and JavaScript is single-threaded, so nothing could have closed it.
Every step of that was true and the conclusion was still wrong. The closer was Bun's read stream,
running on an I/O THREAD: `createReadStream` closes the descriptor it holds even with
`autoClose: false`. The master had two closers; the loser closed a NUMBER that a later allocation
already owned, so the victim was a DIFFERENT `OpenPty` than the one being disposed. My own reasoning is
what made me treat the evidence as noise twice.

Two durable pieces. **Single-threaded-therefore-safe is only valid for state no other thread can
touch, and a file descriptor is shared process-wide** — the moment the resource is an OS handle, the JS
event loop stops being the whole story. And the diagnostic tell was sitting in the data all along:
`F_GETFL` failed as often as `F_SETFL`, and `F_GETFL` ignores the third argument, which refutes the
argument-passing hypothesis I briefed with some confidence. **When a rival hypothesis is cheap to
separate, find the observation that separates them BEFORE writing the brief**, not after.

The brief still worked, because it demanded a probe before belief and named the rivals to reconstruct.
That is the difference between briefing a confident cause and briefing an experiment — the second one
survives being wrong.

## 2026-07-26 08:52 — a probe that constructs one instance at a time cannot see a theft
The reason this defect resisted three encounters: the victim is never the object under test. A probe
that creates one `OpenPty`, exercises it, and closes it finds nothing, because the corruption requires
a close to overlap a LATER allocation. The experiment has to hold a window of instances alive and
dispose the oldest while constructing a new one. `liveCount > 1` is not a tuning parameter, it is the
whole hypothesis. Generalisation: for any lifetime or ownership defect, the probe must contain at least
two participants, or it is measuring a different question than the one being asked.

Landed as an opt-in instrument rather than a gate test, deliberately: detection is ~2% per round, so a
short gate test could only fail toward "pass". 8 failures in 400 rounds unfixed, 0 in 400 and 0 in 800
fixed.

## 2026-07-26 11:30 — the failure that looked like a mystery was the feature working
The keyboard landing's two gate reds looked like an unexplained focus regression — one smoke sent raw
Escape and I could not connect the failure to the diff, so I backed the merge out and refused to land.
Right call, wrong theory: the failing site was three hundred lines later, sending a raw `\t` BYTE that
my `sendKeys('Tab')` grep could not see. Both failures were smokes pressing Tab while the EDITOR held
focus — where Tab now indents, which is exactly what the user asked for. The smokes were asserting the
old world. Two lessons. When sweeping a retired input, grep for the BYTE and the raw string forms, not
just the API spelling — the same class as the quoted-glyph miss (`'⌕'` vs bare), third instance this
week. And the builder's own design contained the discriminator my analysis missed: it deliberately KEPT
Tab-to-leave in the files context, so "Tab from the tree passes, Tab from the editor breaks" was the
signature of the change working, not of a mystery.

## 2026-07-26 11:30 — fleet flip number three; the rule is the flip, not the fleet
Builders are codex again (user: 23% left plus a free reset; the Anthropic org limit is hard-blocked and
a fresh Agent spawn dies the same way). This is the third quota-driven flip in three days. The durable
rule is not "use codex" or "use opus": it is that WHICH fleet is a quota fact the user owns — act on
their latest statement, expect it to flip again, and when several builders die simultaneously with the
same API error, treat it as a quota event and preserve worktrees as WIP commits before anything else.

## 2026-07-26 13:20 — the extraction did not create the bug; it removed the accident hiding it
The filetree landing's deterministic red (gutter-diff, 4/4) diagnosed to a STALE FOCUS BIT that
existed on pre-filetree main: a sidebar click moves workspace focus editor→primaryPane→editor
synchronously, and the default QUEUED Vue watcher coalesced the round trip to its starting value —
so it never ran and never blurred the dock. Harmless for months, because the old tree pane had no
keybindingContext and the stale dock could not resolve any key. The extraction added
keybindingContext:'files' (correctly), and the latent bit started swallowing Enter as tree.activate,
reopening a file so the smoke typed into the WRONG DOCUMENT. Three durable pieces. (1) Focus transfer
is input ownership: a watcher that projects focus must flush SYNC, because coalescing away an
intermediate transition changes who owns the next keystroke. (2) Both of my ranked suspects (decoration
pipeline, focus routing) were wrong — the builder measured instead of trusting the brief's guesses,
which is exactly what the brief told it to do. Rank candidates, never just one, and expect all of them
to lose to measurement. (3) A change that EXPOSES a latent defect will bisect to the innocent commit;
the fix belongs at the latent defect, not at the exposer.

## 2026-07-26 13:20 — codex round-trips are cheap; use them for the fix loop, not just the build
Today's filetree arc was build → merge-adopt → regression-fix, three codex dispatches into the SAME
worktree, each with a monitor keyed on commit-count-or-silence. The commit-count monitor is the right
wake condition for codex (no task notifications): it fires exactly when the work is committed, and the
silence arm catches a dead run without polling. The conductor's own role stayed review + gate + land.

## 2026-07-26 15:15 — the lock's first catch was falsifying its own favorite explanation
The quiet lock landed (582420f) and its first gate immediately did something more valuable than
preventing a flake: agent-permissions passed-only-on-retry AGAIN — inside the serialized tail, under
quiet-exclusive, with the pool finished. Before the lock, every retried pass could be (and was) blamed
on load. Under the lock, a TAIL smoke's retry cannot be: nothing else was running. The retry
mechanism's own label ("first attempt was starvation-class") is now demonstrably wrong for this smoke,
and what looked like one diffuse population has split into two: load flakes (pool residents — moved to
the tail or tolerated) and genuine intermittents that load was CAMOUFLAGING. The lock is as much a
classifier as a scheduler: it removes the excuse, and whatever still flakes under it is a real defect
with nowhere to hide. Filed as #109 with today's three preserved attempt-1 logs.

## 2026-07-26 18:25 — the user's veto is a gate the harness cannot replace
The scroll-feel branch passed its own verification 3x and the follow-on/cadence numbers hit every
acceptance bar — and its landing gate still went red on four OTHER smokes (one deterministic), and
the user's live testing surfaced a huge-file regression neither the branch nor the gate had a fixture
for. Two lessons. (1) A pacing change is a GLOBAL change: altering when frames are produced perturbs
every smoke that waits on frame-coupled state, so a render-loop edit needs the full gate BEFORE the
conductor celebrates numbers from the branch's own three smokes. (2) The performance fixture set must
span the SIZE AXIS: every scroll instrument ran on small fixtures, so O(document-length) per-frame
costs were invisible to every contract while being the dominant felt cost on real repos. The user's
26k-line package-lock.json found in one minute what eight green gates missed. Fixture axes are part
of coverage: when a metric can scale with an input dimension, the contract needs a point at the far
end of that dimension.


## MIGRATED 2026-07-26 21:40 — the ibr `Skills/Orchestration Lessons.md` entries that lived only there

USER CORRECTION: doctrine belongs in `project.conductor.md`, in the repo the work happens in — NOT in
`ibr/Skills/Orchestration Lessons.md`. Both files were titled "Orchestration Lessons" and had been
diverging for days, each holding lessons the other lacked, which is the same defect as two copies of a
cron prompt: a record nobody can trust because a reader cannot tell which copy is current.

**This file is now the single home.** The ibr file is superseded; do not append to it, regardless of
what the hourly loop prompt says (that prompt still names the ibr path and is wrong — the target is
this file). Everything below was ported VERBATIM, with original dates, after checking each entry
had no counterpart here.

Two items in the ibr file were deliberately NOT ported because they are obsolete — solved, not
forgotten: the "we need a gate lock/queue" wish (built: the machine-wide quiet lock, #84) and the
"we need a fleet heartbeat" wish (built: the pull heartbeat polling file-write progress). The
worktree-`node_modules`-symlink stumble is likewise retired — worktrees now run
`bun install --frozen-lockfile`.

---
## 2026-07-25 19:20 — a record of a loop is not the loop
The user asked whether both crons were still in place. The conductor skill recorded two verbatim cron
prompts — an hourly orchestration loop and a 10-minute liveness check — with a note that a previous
session restart had killed the in-memory crons and that these copies restored them. `CronList` returned
exactly one job. The 10-minute heartbeat had died in a restart and only the hourly was re-armed, so for
an unknown span the floor under builder liveness was gone while the doc asserted it was there.

The failure was silent BY CONSTRUCTION: a heartbeat that stops firing produces no output, and its
absence is indistinguishable from a quiet, healthy fleet. Contrast a gate, which fails loudly. Any
orchestration invariant whose violation is silence needs a runtime probe, not a prose record — so the
loop's step 0 is now `CronList` before any other work, re-arming from the verbatim text in the same fire.
And the arrival of one loop's fires says nothing about another's; they die independently.

Second-order lesson: the recorded 10-minute prompt was also carrying a rule the fleet had already
measured its way out of (one gate at a time). A stale verbatim prompt is worse than a missing one — a
restore re-imposes a retired constraint with full authority. When doctrine changes, the recorded prompts
are part of that change set, not a later chore.

## 2026-07-25 19:25 — reviewing a change to the verification apparatus itself
A builder delivered a 466-line rewrite of `merge-gate.sh` (parallel smoke pool + serial quiet tail). A
green gate is NOT evidence for this class of change, because a gate that silently drops a smoke still
reports ALL-PASS. The apparatus cannot testify about itself.

What review actually requires here is coverage-preservation diffing against the pre-change script:
extract the set of harness smoke filenames and the set of step labels from both versions and compare as
SETS. Result: 53 smokes and 111 labels, identical, nothing dropped — a claim no amount of reading the
diff would have established with the same confidence.

Then the substantive defect, which the gate could never have surfaced. The builder's own guard,
`validate_smoke_classification`, decides whether a smoke is timing-sensitive by grepping DOMAIN
VOCABULARY (`Momentum|glide|awaitFrameSilence|assertNoCompleteFrameEmittedFor`). That is the same shape
the user rejected earlier in the day for the `.value` lint: a syntactic pattern standing in for a
semantic property. Here the failure direction is the harmful one — a false negative classifies a
timing-sensitive smoke as parallel-safe, and the resulting coverage loss reports green.

Empirically: `smoke-terminal-stage-harness.ts` asserts `elapsedMilliseconds < 1000` (reduced-motion
takes the instant path) and `slowDuration > fastDuration + 400` across two SEPARATELY LAUNCHED app runs.
Both are measurements of the machine; both sat in the parallel bucket, because the file says
"animation" and "reducedMotion" rather than "momentum". The guard's vocabulary missed its own target.

THE STRUCTURAL DISCRIMINATOR that replaces the vocabulary guess: a deadline loop ADDS to
`performance.now()` and compares (load-robust — under load it merely waits longer); a measurement
SUBTRACTS two readings. So `performance\.now\(\)\s*-` is the tell, and it is domain-independent.
Verified against the two smokes that use clocks innocently (`agent-cancel`, `paste`): both only add and
compare, and both are correctly parallel-safe.

## 2026-07-25 19:30 — the tail was made of the wrong thing entirely
Auditing WHY each of the 20 quiet-serial smokes was in the tail: every single one qualifies solely
because it calls `assertNoCompleteFrameEmittedFor`/`awaitFrameSilence`. ZERO of them derive a duration.
The classification was inverted with respect to the property that actually matters — the tail held 20
absence assertions and excluded the one genuine measurement.

Absence assertions do not need a quiet machine; they need a LIVENESS CONTROL. "No frame for N ms" is a
claim about the program, and it becomes load-sensitive only because a slow machine satisfies it
accidentally. Pair the window with a proof that a frame CAN arrive immediately after it (stimulus, then
require a frame within M ms) and the assertion stops caring about load.

The operational consequence is the vertical cut: do NOT edit 20 smokes. All 20 flow through ONE helper,
so strengthening that helper to require its own paired liveness proof converts the entire class at the
generator. The tail then collapses to what genuinely measures the machine — one smoke, the byte-arrival
latency step, and the soft perf baselines, on the order of 30 seconds. That is the only thing a
machine-wide quiet lock has to serialize, which turns "gates take turns for five minutes" into "gates
take turns for thirty seconds".

Refinement to the lock's scope: it must be acquirable by BUILDER verification runs too, not only by
gates. A builder running `bun test` or a smoke loads the machine identically. The scope is machine-wide
heavy work; keying it to gates would leave the hole open.

## 2026-07-25 19:35 — three cheap operational rules earned in one stretch
A LANDED WORKTREE IS A FREE BUILD SLOT. Disk hit 93% (9.5G free) and each fresh worktree costs ~350MB of
`node_modules`. Sixteen `conductor-*` worktrees whose branches were already ancestors of main were
sitting there with dependencies installed. Recycling two (`git checkout -B <new-branch> origin/main`)
cost nothing and preserved the never-delete-a-branch rule, since only the checkout moves. Detect them
with `git merge-base --is-ancestor <worktree HEAD> origin/main`. Note the trap: in a linked worktree
`.git` is a FILE, so a `[ -d "$w/.git" ]` guard silently skips every candidate — use `-e`.

NEVER EDIT A RUNNING BASH SCRIPT. Bash reads a script incrementally as it executes, so editing
`merge-gate.sh` mid-run can change execution or corrupt it. Fixes to a gate script wait for GATE_EXIT,
however obvious they are.

A BUILDER'S FIRST TEN MINUTES ARE INVISIBLE TO A WORKTREE-WRITE HEARTBEAT. Two codex builders launched
at 19:14 landed their first worktree write at 19:24 — ten minutes of reading the repo, during which
their only liveness signal was their own log (1.0MB and 680KB of growth by minute six). A pull
heartbeat keyed only on file writes would have declared them stalled and taken over work that was
progressing fine. Early liveness lives in the agent's log; worktree writes are a mid-phase signal, and
the heartbeat must accept either.

But the FIRST version of this lesson cited invalid evidence, which is worth recording as its own trap:
the "zero worktree writes" reading came from `find -newermt '-15 minutes'`, which did not select what I
assumed. `find -mmin -20` on the same worktrees a few minutes later reported 576 and 588 touched files,
and one builder had already committed. Use `-mmin`. The heartbeat cron greps worktree writes exactly
this way, so a bad probe there does not report "probe broken" — it reports a healthy fleet as stalled
and invites a takeover of work that is fine. A liveness probe that can only fail toward "dead" needs its
own positive control: before trusting a zero, confirm the probe sees a file you know was just written.

## 2026-07-25 20:20 — the lattice reviewed my design before I wrote the code
I proposed converting absence assertions to frame ORDERING: record the frame count, apply a stimulus,
require the next observed frame to be the stimulus frame. I stated it to the user with more confidence
than it deserved. Then, reading the file I was about to change, I found an ESTABLISHED invariant —
*Harness waits observe conditions not frame ordinals* — whose Rejected-alternatives section names the
exact failure: repaint coalescing changes frame ordinals under load, and an action whose target is
already rendered may emit NO frame. Its scope adds that frame counts may diagnose output volume but
never identify the state a waiter expects.

The design was dead on arrival and the record killed it for free. THAT is what an invariant lattice is
for: it is a design review that already happened, written by whoever last understood the area. The
operational rule: before changing a subsystem, read its invariants file — not for compliance, but
because the Rejected-alternatives sections are a list of the plausible ideas that have already been
tried and found wanting. Skipping that step means re-deriving other people's dead ends.

The sound reduction was one level deeper: **absence-of-churn is invariance-of-content**. The claim
behind "no frame for 600 ms" was never about frames — it was "the same thing stays on screen", which is
assertable by comparing rendered content across a condition-terminated action, with no clock and no
ordinals, immune to both load and coalescing. Two concerns had been conflated in ~20 places: "is the app
wasting frames at rest" (belongs in ONE idle-quiescence contract that legitimately counts frames) and
"does the UI stay stable across this action" (content invariance, per smoke). Twenty smokes each rolled
a 600 ms window because they wanted the second and a clock was the only tool at hand.

## 2026-07-25 20:30 — a retry that hides a flake is worse than a red
`smoke-workspace-tabs` was 1-in-3 to 2-in-3 flaky for an ENTIRE DAY and every gate that touched it
reported green, because retry-once-on-timeout kept rescuing it. The retry mechanism is worth keeping —
genuine starvation exists — but it silently converts an intermittent failure into an invisible one, and
the failure only became visible when it lost twice in a row and blocked an unrelated branch.

The pool path already tallied its retries; the SERIAL `step()` path did not, so a quiet-tail or serial
retry left no trace but one line buried mid-log. Fixed: serial retries feed the same tally, and the
tally now states its interpretation instead of printing bare numbers — a retried pass is a FLAKE, not a
green. Deliberately NOT made fatal: blocking on a retried pass would punish real starvation and would
push the next person to delete the retry rather than fix the flake. Loud and countable beats fatal.

Generalized: any mechanism that makes a failure survivable must also make it COUNTABLE. Recovery
without accounting is indistinguishable from correctness.

## 2026-07-25 20:30 — a fixture rooted in a shared directory imports the whole machine
The mechanism behind that flake: the project picker prefills the parent of the current root and
fuzzy-scores that parent's entries. Both fixture roots were created directly in `tmpdir()`, so the
parent WAS `/tmp` — which a day of worktrees, gate logs, and failure directories had grown to 3,752
entries. The wait for the typed path to appear therefore scaled with how full the machine's temp
directory happened to be: ~1-in-3 in the morning, ~2-in-3 by evening. The fixture leaked an
environmental dependency; the application was never at fault. Fix: both roots are siblings inside their
own mkdtemp parent, so the scan sees exactly two entries on any machine.

Rule: a fixture must own its parent directory, not share one with the machine. This is the same class as
the earlier HOME-isolation rule (a smoke that mutates settings needs a per-run HOME) — one level up, and
it explains why "works on my machine, flaky in CI" is usually neither the code nor the machine but a
fixture that reads shared state.

Three wrong hypotheses were eliminated by CHEAP EVIDENCE rather than argument, which is the part worth
copying: (1) "the click-outside landing caused it" — bisected, 3 runs each side, 1-of-3 failing BEFORE
it, so pre-existing; (2) "leftover temp roots poison later runs" — checked the cleanup, one of each on
disk; (3) "my own selectionMovedByUser change" — read the setters, match updates assign selectedIndex
directly and never through the flag-setting path. Each check cost under a minute. Arguing any of them
would have cost longer and settled nothing.

## 2026-07-25 20:30 — a coverage ratchet cannot see a deleted PRECONDITION
My first fix shortened the fixture directory prefix (`tui-workspace-second-` became `second-`) and went
0-for-5. Every failure was a later assertion requiring the workspace tab name to be CAPPED WITH AN
ELLIPSIS — which only happens for a name that long. The assertion still existed and still ran; its
PRECONDITION had silently vanished, so it was no longer testing anything it could fail on.

This is a hole in the coverage ratchet landed hours earlier: it counts assertion and wait CALLS, so it
sees deletion but is blind to an assertion made vacuous by a fixture change. Recorded against the
ratchet's follow-up work as a distinct class from the two already known (vague records, padding) and
from semantic weakening: here nothing about the assertion changed at all. The only defence that
generalizes is a fixture comment stating WHY a magic value is load-bearing — now written at that call
site — plus the discipline of reading which assertion broke rather than assuming a new bug.

Operational note earned the hard way in the same minute: a commit message passed to `git commit -m`
inside double quotes will have its backticks executed by the shell. Use `-F <file>`. The failure mode is
loud and confusing (`fatal: /tmp is outside repository`, assembler errors) and wastes a cycle.

## 2026-07-25 20:45 — the conductor must not compete with its own fleet
Tonight's gate reds came in two flavours and telling them apart is the whole skill.

`smoke-workspace-tabs` failed 1-of-2 SOLO on a machine at load 0.28. That is intrinsic — an
environmental dependency in the fixture (see the /tmp entry-count lesson above), fixed at the fixture.

`smoke-editor-harness` then timed out twice in a gate while a builder's log was growing continuously at
5.9 MB — i.e. while that builder was running its own `bun test` and smokes. That is contention, and it
is MY scheduling error, not a defect.

The rule I had been applying was "launch a gate when the builders look quiet", and it is wrong twice
over. A builder that is quiet at launch reaches its verification phase minutes later, inside the gate's
5-minute window; and "looks quiet" is judged from log growth, which is exactly what a reading-phase
builder produces. The correct rule is **the conductor's gate and a live builder's verification are the
same resource, so they take turns**: hold gating while any builder is alive, and drain the gate queue
back-to-back once the fleet reports. Serial gates on a quiet machine are FASTER end-to-end than
overlapped gates that flake and need re-runs — a re-run costs 5 minutes, a wait usually costs less.

This also sharpens the machine-wide quiet lock design already recorded for the gate: the lock must be
acquirable by BUILDER verification runs, not only by gates. A lock that only gates respect leaves the
biggest source of contention outside it.

Corollary for diagnosis: before attributing a timeout-class red to a defect, ask what else was running.
The cheap discriminator is a solo re-run on an idle machine — it separates intrinsic from contention in
about a minute, and today it gave opposite answers for two smokes that failed the same way.

## 2026-07-25 20:40 — a negative result worth keeping: don't parallelize the cheap checks
Idea: the gate's static checks (conventions/tsc, file grammar, both invariant checkers, coverage
ratchet, unit tests) run serially BEFORE the smoke pool, and none of them launches an app or measures
timing, so they looked like free parallelism.

Measured first: file grammar 0s, invariant checker 0s, coverage ratchet 1s. The cheap checks are already
free — the static phase is dominated entirely by `tsc` and `bun test`. Parallelizing the three fast ones
would add a background-job/reap harness to the most safety-critical script in the repo and save roughly
nothing. Dropped.

Two rules confirmed by the non-result. First, MEASURE BEFORE OPTIMIZING even when the structure looks
obviously improvable — the shape of the win was real, the magnitude was zero. Second, the variant I
almost built instead (overlap the static phase with the smoke POOL) would have been actively harmful:
it adds CPU pressure to the phase that had just proven it times out under contention, trading ~90s of
wall clock for more flaky reds. Reducing wall-clock by increasing flake rate is a loss, because a re-run
costs more than the saving.

What remains genuinely available, in order of value: (1) #76 content-invariance, which moves 21 smokes
from the serial tail into the pool — that is minutes, not seconds; (2) only AFTER those smokes are
load-robust, consider overlapping `tsc`/`bun test` with the pool, since the contention risk is what
makes it unsafe today.

## 2026-07-25 20:45 — contention is a TEST, not an excuse (refining tonight's own rule)
An hour after writing "hold gating while any builder is alive", I took an exception to it deliberately,
and the exception is the more useful rule.

The doctrine's purpose is to stop MISATTRIBUTING contention reds and to stop wasting re-runs. Once the
two intrinsic flakes were found and fixed, a red under contention became INFORMATIVE rather than
confusing — so I gated the flake fixes with a builder still alive, on purpose, and said why. A rule
whose exception condition is unstated gets violated silently; a rule that names it survives contact.

Refined form: **hold gating while a builder is alive, UNLESS a contention red would still be
diagnostic — and state the reason when you take the exception.** Never gate blind while builders verify.

The deeper reframe, which I had backwards all day: a quiet machine is a CRUTCH that hides fragility. If
a smoke cannot survive a loaded machine, it is not robust — it merely has not been asked yet. So load is
the discriminator, not the enemy:
- a smoke that fails ONLY under load has a clock-bound or existence-bound assertion (fix the assertion);
- a smoke that fails on an idle machine has a real race or a real defect (fix the code or the fixture);
- a smoke that survives both is actually load-independent, which is the property that lets it move into
  the parallel pool and make the gate fast.

This closes the loop with the earlier two-gate dividend: running the suite under deliberate load found a
latent race that dozens of serial runs had missed. Protecting fragile smokes with quiet conditions
preserves the fragility and hides the coverage loss. The goal is not a calm gate — it is a gate whose
green means something under any conditions, which is also the only kind that can be parallelized.

## 2026-07-25 20:50 — the flake census: 121 gate runs, 33 masked retries
Every gate log of the day is still on disk, and every `RETRY` line in one marks an intermittent that
`retry-once-on-timeout` rescued. Counting them turns "flakes are annoying" into a ranked, evidence-backed
queue — and the number is worse than anyone would have guessed from watching greens go by:

  121 gate runs, 97 ending green, **33 retries** — so roughly a QUARTER of all runs contained a masked
  flake, invisible because the retry succeeded.

Ranked (retries, then outright failures):
  workspace tabs 12 (+5 fails) · pixel-preview 4 · agent-permissions 4 · paste 3 · editor 3 (+1 fail)
  · move-line 2 (+2 fails) · completion 2 · tabs 1 · layout 1 · agent-engine-switch 1

Two observations worth carrying.

First, I fixed the right things by accident. The two smokes repaired tonight are ranked 1st and 5th, and
I found them because they BLOCKED me, not because I knew they were the worst. A census costs one `grep`
over logs that already exist and would have pointed at the same targets hours earlier. Do it FIRST when
flakiness is suspected, not after.

Second, this is the strongest possible argument for the retry TALLY landed tonight: the data was always
there, but nothing aggregated it, so a 27%-flake suite read as a healthy one. Recovery without accounting
is indistinguishable from correctness — and the accounting is nearly free.

Remaining ranked queue after tonight's two fixes: pixel-preview (4 — bare sleeps of 250/750 ms before
byte-count assertions, plan recorded), agent-permissions (4 — unexamined), paste (3 — has both bare
sleeps and existence-only predicates), move-line (2 retries AND 2 hard fails — the fails make it the real
priority despite the lower retry count).

## 2026-07-25 21:03 — I killed a running smoke on a partial reading and destroyed the evidence
The perf branch's gate went quiet for four minutes in the pool phase. I checked: one job left running
(`smoke-paste-harness`), its app alive 267s at **0s CPU**, load 0.40 with six workers configured. I
concluded the branch's new next-painted-frame barrier had deadlocked — a promise resolved only by a paint,
awaited in a DEMAND-DRIVEN renderer that does not paint at rest, is a promise that can never settle — and
I killed the smoke and its app.

The gate had not hung. It completed the pool phase (`parallel-safe phase 5m53s`) and moved into the quiet
tail. Paste was a STRAGGLER, not a deadlock, and my kill turned a stall into a FAIL, making that job's
result unusable as evidence. I had a Monitor armed on GATE_EXIT and should have let it fire.

Two rules, and the second is the one I keep re-learning:
- **A quiet gate log is not a hung gate.** The pool reaps jobs IN REGISTRATION ORDER, so output stops at
  the first unfinished job even when later jobs have completed. Silence means "job N is still running",
  never "nothing is running". Check for live jobs before concluding anything, and remember that the phase
  ends on the LAST job, not the noisiest one.
- **Do not intervene in a run you are already monitoring.** The monitor exists so the run can finish
  cleanly; acting early replaces real evidence with evidence about my own interference. Diagnose from a
  finished run, or from a deliberate re-run — never from a run you disturbed.

What SURVIVED my interference is the real finding: paste was stalled at 0% CPU for ~4.5 minutes BEFORE I
touched it, and it alone stretched a pool phase whose baseline is ~54s into 5m53s. So there is a genuine
multi-minute stall on this branch. The deadlock hypothesis is not dead either — it is merely not
infinite: a 0-CPU wait of minutes is consistent with an await that only unblocks via some much later
event (a 5s reconcile tick, a long internal timeout). The provenance test is the same cheap one that
worked twice tonight: time the smoke on origin/main and on the branch, three runs each, and compare.

## 2026-07-25 21:50 — 25 minutes at 1 second of CPU, and when aborting a run is correct
The paste backpressure stall got worse the more the machine was loaded, and the final measurement is
severe enough to change what the finding IS: **smoke and app both alive 1519 seconds having used 1
second of CPU**, while a builder worked. Earlier in the evening the same stall was ~4.5 minutes. Alone,
that smoke takes 2 SECONDS. Across four gate runs tonight it consumed roughly forty minutes of
wall-clock — more than every other flake combined.

At 25 minutes with no CPU this stops being a flake and becomes a hang, and it stops being primarily a
harness problem. The smoke writes 64KB into a PTY whose buffer is far smaller; if the application does
not drain it, the write blocks and both sides idle. An application that stops reading its PTY for 25
minutes under load means a REAL USER pasting a large payload on a busy machine sees the editor freeze,
not lag. The test may have found a product defect and been blamed for it. Investigate the app side
first: is the PTY read on a path that rendering or another await can starve?

**Refining tonight's own rule about not intervening.** Earlier I killed a straggler because I mistook
pool silence for a deadlock — that was a misdiagnosis, it destroyed the job's evidence, and a Monitor
was already armed. Later I killed this run deliberately and that was right. The two look identical from
outside, so the distinguishing test has to be explicit:

  **Does letting the run continue produce information I do not already have?**

- Killing to DIAGNOSE: almost always wrong. The run's evidence is the diagnosis; ending it early
  substitutes evidence about your own interference.
- Killing to SEQUENCE: legitimate. Here the outcome was already known (paste stalls under contention,
  measured three times), the fix existed on another branch, and the correct next action was to gate THAT
  branch first so the stall stops recurring. Continuing would have burned another twenty minutes to
  re-confirm a known fact.

Say which one you are doing, and if it is the first, do not do it.

**Sequencing insight worth keeping:** when a gate run is being dominated by a defect whose fix is
already committed elsewhere, gate the FIX first. It is self-applying — the guard-fix branch carries the
paste reclassification, so its own gate does not stall on paste, and every gate after it inherits the
improvement. Ordering the queue by "which branch makes the queue faster" beats ordering it by age.

## A silent builder holding no CPU may be blocked on YOUR serialization primitive

A builder went 26 minutes without writing a line to its log while its process stayed alive. By the
liveness heuristics that would read as a hang — the same shape as the paste stall above. It wasn't.
A sibling builder held the machine-wide quiet lock for its exclusive scroll measurement, and the
silent builder's verification harness was queued behind it, doing nothing by design.

The lock is correct and I would not remove it: it exists so timing-sensitive measurements never
overlap another gate's load, and it is what turned a population of "load flakes" into proven
defects. But it has a consequence I had not priced in:

  **A machine-wide exclusive lock converts parallel builders into partially serial ones, and the
  serialization is invisible in every per-builder signal.**

Log age, commit count, dirty-file count, and process liveness all look identical for "wedged" and
"politely waiting its turn." The distinguishing evidence is not in the builder at all — it is in
who holds the lock. So liveness diagnosis needs one more question, asked BEFORE anything else:

  **Is something else holding the resource this builder needs?**

Concretely, the check that resolved it in one command was listing processes for
`quiet-lock.sh quiet-exclusive` and finding a sibling worktree's path in the holder's argv. The
journal the lock already writes (`/tmp/invar-quiet-lock.journal`) is the better instrument and I
should have consulted it first — I built it and then diagnosed around it.

**The throughput consequence, stated honestly.** Three concurrent builders do not give three times
the verification throughput when each one's verification needs the exclusive lock. Past roughly
two builders whose work ends in timing-sensitive measurement, the added builder buys queue depth,
not speed. The fan-out is still worth it when the builders' *authoring* phases overlap and only
their *verification* phases contend — which is the usual case, since authoring is the long part.
But the conductor should schedule with the lock in mind: stagger dispatch so verification phases
do not collide, and do not read a lock-blocked builder's silence as a reason to intervene.

**Generalization.** Any shared exclusive resource the fleet contends for — a lock, a port, a
fixture directory, a display, a single GPU — produces this same blind spot: a per-worker health
check cannot distinguish blocked-on-peer from broken. Every such resource needs a holder-visible
instrument (a journal, a lockfile naming its owner), and the liveness routine must read it before
concluding anything about the worker.

## A liveness check that matches process ARGV will match your own briefs

Checking whether a gate was running, I ran `pgrep -af "merge-gate.sh"` and got three hits, so I
reported the gate as RUNNING. No gate was running. The hits were: two codex processes whose brief
text contains the sentence "Do NOT run scripts/merge-gate.sh", and the pgrep command itself.

This is the same defect that once made a `pkill -f` dangerous — builders matched their own brief
text — except this time it produced a false POSITIVE on a status check rather than a wrong kill.
Both come from one mistake:

  **A process's argv is not a statement about what it does. For an agent, argv contains the
  INSTRUCTIONS, including instructions about what NOT to do.**

Any fleet where work is dispatched as a long prompt string has this property permanently: every
tool name, script path, and forbidden action mentioned in a brief is searchable text in the process
table. So argv matching is unreliable in exactly the environment that most needs process
introspection.

What to match instead, in order of preference:
1. **The artifact, not the process** — a log file with a written exit sentinel, a pidfile, a commit
   count. State that outlives the process beats state inferred from it.
2. **An anchored, structural pattern** — the interpreter plus script position (`bash .*/merge-gate\.sh$`)
   rather than a bare filename that could appear anywhere in a command line.
3. **cwd-resolved pids** — resolve `/proc/<pid>/cwd` to the worktree, which brief text cannot forge.

The generalization is a rule about instruments: **an instrument whose input channel also carries
descriptions of the thing being measured cannot distinguish the thing from its description.** Same
family as a smoke asserting a glyph an invariant forbids, and the harness reading a stale log line
as a live one. When the signal and the talk-about-the-signal share a channel, separate the channels
— don't sharpen the pattern.

Cheap self-check before trusting any process query: **would this pattern match the text of my own
command, or the brief of a worker that was told not to do it?** If yes, the query is unsound
regardless of what it returned this time.

## Smoke authoring

- **Chained smoke steps carry state forward — compute cursor math from the ACTUAL carried state.**
  (2026-07-23) The Open-Project wrap smoke's step 3 assumed the selection started at index 0, but step 2
  had left it at index 20; 40 more Downs with wrap landed on `(20+40)%41 = 19`, not 40. The fix was to
  assert the intermediate state (`quickOpenSelected == 20` after step 2) and count Downs from there.
  Rule: after every step that moves a cursor/selection, assert where it landed before the next step
  depends on it. A smoke that "passes" only because two off-by errors cancel is a trap.

- **Assert what the user sees (frame capture), not just side-channel fields.** The strongest smoke lines
  drive the real chord/click path and `grep` the rendered cells for the exact expected text (e.g. the
  echoed reply). Side-channel probe fields (`panelActiveContent`, `terminalVisible`) are for state you
  can't read off the frame; the visible round-trip is the proof.

- **modifyOtherKeys is the reliable way to send modified chords in smokes.** `Ctrl+Shift+A` =
  `printf '\033[27;6;97~'` — sent via the PTY driver's key/text write (historically
  `tmux send-keys -l`). The `;6` = Ctrl+Shift, the final number = the
  base-key codepoint (97 = 'a'). Precedent: `smoke-navigation-history.sh` (Alt+[ = `\033[27;3;91~`).

## Building new modules

- **Mirror an existing module 1:1 — it's the cheapest path to a correct new one.** (2026-07-23) The
  native agent-harness module mirrored `terminal/` exactly: backend **seam** (interface) + **mock**
  double + **reactive single-source** (`Reactive($Class)`, `get x() { return ref(v) }` = memoized
  reactive field) + **PaneContent** citizen + **Static factory** + colocated **`*.invariants.md`** +
  **unit test** + **driving smoke**. Reading four template files (`TerminalBackend`, `MockBackend`,
  `TerminalPaneContent`, `TerminalFactory`) gave the entire grammar; the 8-file new module typechecked
  first-try. When a contract doc (`project.agent-harness.md`) already names the file layout, follow it
  verbatim — the file names are load-bearing (conventions gate: file-name-follows-class).

- **A content-agnostic host means a new pane is near-zero host wiring.** `PanelHost` already switches an
  arbitrary set of `PaneContent`s by id; registering a second one (the agent pane beside the terminal)
  needed only a lazy `ensureAgent()` + a `toggleAgent` closure + one action-map entry + one keybinding.
  No host changes. That's the seam paying off — the same reason the vision calls the seams "the plugin
  API."

## 2026-07-26 21:40 — a union merge without the BASE cannot tell "we added" from "they deleted"

I resolved a merge conflict in `KeybindingDefaults.test.ts` as a union, and verified it — I thought
rigorously — by extracting the test-name set from OURS and from THEIRS and checking the resolved
file equalled their union with no omissions, no extras, no duplicates. It passed all three checks.
The gate then went red: `bun test` and the keyboard-invariant smoke both failed on
`Received: null`.

The check was structurally incapable of finding the defect. A two-way comparison has exactly one
reading for "in ours, absent in theirs" — *we added it*. But there is a second reading, and it was
the true one: *they deleted it*. Main's inline-rewrite landing had MOVED those chords out of the
canonical binding layer into the plugin contributor and deleted the now-meaningless canonical-layer
test. My union resurrected it, pointed at a layer that no longer carries those bindings.

  **A union is only defined against the BASE. Ours-vs-theirs is not a merge, it is a guess with a
  set operation painted on it.**

The correct classification needs three sets: for each element, `base` decides whether an asymmetry
is an addition (absent in base, present in one side) or a deletion (present in base, absent in one
side). A union is right for additions and WRONG for deletions — resurrecting deleted code is the
signature failure, and it is silent at the text level because the file is syntactically fine.

The corrected procedure, which found the real answer in one pass:
```
base   = names(merge-base)
ours   = names(HEAD-before-merge)
theirs = names(origin/main)
deleted_by_them = base - theirs      # do NOT resurrect
added_by_us     = ours - base        # DO keep
```
That immediately printed the two tests main had deleted and the one test we had genuinely added.

**Second finding, from doing the check properly.** Of the two tests main deleted, only ONE had its
assertion rehomed (chord resolution → `InlineRewriteContributor.test.ts`). The other — encoded
bytes → parsed event through both OpenTUI parsers — was dropped with no replacement anywhere in the
tree. That is parser-level, independent of where bindings are registered, and it guards the #93
property that a chord must actually ARRIVE rather than merely resolve. So the right resolution was
asymmetric: delete the superseded one, KEEP the dropped one. Restoring it costs nothing (it still
passes) and recovers coverage the landing lost.

Generalizes past merges: **whenever a landing MOVES a capability, check each of its assertions for
a new home individually.** "The tests moved with the code" is a claim about the whole set that is
usually true of most of it and quietly false of one or two — and the coverage ratchet reads a
declared deletion as accounted-for, so it cannot distinguish rehomed from dropped either.

## 2026-07-26 21:50 — a completion predicate keyed on EXISTENCE is satisfied before the work starts

I armed a monitor whose done-condition was `[ -f /tmp/skill-dropdown-READY.md ] && clean tree &&
commits >= 1`. It fired, and I started reading the report — which described a DIFFERENT task
(#117), from a different worktree, written three hours and forty minutes earlier. The builder was
still alive at that moment, mid post-commit verification. The report path was reused across tasks,
so the file existed before the builder began, and the predicate was true on the monitor's first
tick.

  **A completion check that tests for the PRESENCE of an artifact, rather than for a FRESH one,
  cannot distinguish "finished" from "never started."**

This is the monitor-shaped version of the rule this repo already enforces for gates and smokes: an
instrument that can only resolve one way is not an instrument. There the failure is a check that
can only PASS; here it is a check that can only say DONE. Same defect, different surface — and this
one is worse in one respect, because it makes the conductor act on a stale artifact as if it were
this run's evidence.

Three fixes, in order of preference:
1. **Compare against a timestamp taken at dispatch** — `stat -c %Y <artifact>` must exceed the
   dispatch epoch. Freshness, not existence.
2. **Give each run a unique artifact path** (`<task>-READY-<run>.md`). Reuse across tasks is what
   created the collision in the first place; the same reuse earlier tonight also put a codex into
   the wrong worktree because `/tmp/conductor-skilldrop` already existed.
3. **Key on state that cannot pre-exist at all**: process absence resolved through
   `/proc/<pid>/cwd`, plus a commit count measured against `origin/main`. A process that is gone
   and a commit that exists cannot both be left over from a previous run in the same worktree.

The corrected monitor uses (3) as the trigger and reports (1) as a FIELD — `ready_fresh=yes/no` —
so a stale report announces itself instead of masquerading as this run's output.

**Wider rule for the conductor: reused scratch paths are shared mutable state across tasks.**
`/tmp/<name>-READY.md`, `/tmp/conductor-<name>`, `/tmp/<name>-codex.log` are all name-collision
surfaces, and every collision this session produced a wrong conclusion rather than an error — a
codex on the wrong base, and a monitor reporting done on someone else's report. Namespace them per
run, or verify freshness before believing them.

## 2026-07-26 22:30 — the differential is cheap; run it before believing the load story

The fold branch's gate went red on `behavioral-contracts` and `audio-narration`, with THREE steps
in the retry tally and a 484s wall. Every surface feature said "loaded machine": the quiet-lock
journal showed a 5m40s exclusive tail, the branch's own round-2 verification had been 3/3 green,
and one of those green runs had itself spent 120s waiting on the lock. I ranked load first.

Load was wrong. Re-running the contract SOLO on an idle machine failed again (exit 1), and a fresh
probe worktree at clean `origin/main` ran the SAME contract ALL-PASS (exit 0). Two commands,
maybe eight minutes, and the question was settled: the branch introduced it.

  **A plausible load story and a real defect present identically. The only thing that separates
  them is running the same command in two places.**

The trap is that the load story is always AVAILABLE — this fleet always has contention, so there
is always evidence for it. Evidence that is always present has no discriminating power, and
treating it as an explanation is how a real red gets landed over as "just the machine."

Cheapest discriminator, in order, and it is cheap enough that there is no excuse to skip it:
1. **Re-run solo, idle.** Kills the load story outright if it still fails.
2. **Probe the base.** A detached worktree at `origin/main` plus `bun install --frozen-lockfile`,
   then the identical command. Green there and red here localizes to the branch with no reasoning
   at all.
3. Only then reason about mechanism.

Corollary worth keeping: **prior green runs of the same branch are weak evidence.** Round 2 passed
this contract 3/3 — and still shipped the defect, because the failing combination only appears in
the merged tree or in a matrix position those runs did not hit. "It passed for the builder" is not
a substitute for passing here, now, on this tree.

Second-order note on the diagnosis itself: my first mechanism hypothesis (the fold-dense fixture's
first line not containing the probe text) was refuted in one grep — the marker expands to
`line 000000 content packages`, and the probe is a substring of it. Refuting your own favourite
before briefing it is what keeps a builder from spending an hour on your wrong idea; the brief now
names it as tested-and-refuted so the next reader does not re-derive it.

## 2026-07-27 00:30 — `A && B; echo $?` reports B's status only if A succeeded, and silence looks like a run

Three times in one session I read an exit code that belonged to a different command than the one I
thought I was measuring:

1. `git merge … | tail -3; echo "merge_exit=$?"` printed **tail's** status — `0` while the merge had
   actually conflicted. The printed message saved it, not the code.
2. `bash scripts/behavioral-contracts.sh …; grep …` in a background task — the task's reported exit
   was **grep's**.
3. `cd … && git merge-base --is-ancestor origin/main HEAD && … bash scripts/merge-gate.sh > log`.
   Main had moved after the branch forked, so the ancestor check failed, the `&&` chain
   short-circuited, **the gate never ran**, and `GATE_EXIT=1` was the ancestor check's status. The
   log contained nothing but that line.

Case 3 is the dangerous one, because the failure is INDISTINGUISHABLE FROM A GATE FAILURE at the
level I was reading. Same exit code, same sentinel, same place. Only the log's emptiness
distinguished "the gate ran and failed" from "the gate never ran."

  **A guard fused to the work with `&&` turns a guard failure into a work failure — the two become
  the same observation.**

Rules, all cheap:
- **Never fuse a precondition to the work with `&&` when you intend to read the work's status.**
  Check the precondition as its own command with its own reported result, THEN run the work.
- **A sentinel must prove the work RAN, not merely that something exited.** `GATE_EXIT=` alone is
  ambiguous; pair it with a line the work itself emits (`merge-gate: starting…`), and treat its
  absence as "did not run" rather than "failed."
- **Never read `$?` after a pipeline** unless you want the last stage's status. Capture into a
  variable immediately after the command of interest, or use `PIPESTATUS`.
- The generalization is the same one as the argv lesson and the stale-READY lesson:
  **an observation that cannot distinguish two states is not evidence about either.** Empty output
  next to a failure code should always trigger "which command produced this?" before any diagnosis.

Standing cause worth noting separately: a doc-only commit to main invalidates the ancestor check for
every in-flight branch. That is fine and expected — but it means the conductor's OWN landings are a
source of this class, and the merge should be done deliberately before gating rather than discovered
by a short-circuit.

## 2026-07-27 00:40 — the gate is a SIEVE, not an ITERATION MECHANISM (user correction)

USER: "our feedback loop is getting slower, the gate helps but also became its own bottleneck… the
agents should test it by driving directly rather than by a test and a gate… right now
self-verification loop moved outwards to you managing the gate, it became bureaucracy and procedure
over fast iteration."

Correct, and the cause was in MY BRIEFS. I had been requiring `behavioral-contracts.sh` 3x plus the
full checker suite BEFORE a builder reported, and then gating on top. That pushes gate-shaped work
INTO the iteration loop and then repeats it outside. Two consequences, both bad:

1. Every refinement costs minutes instead of seconds, so builders take fewer swings.
2. The builder optimizes for MAKING AN ASSERTION PASS rather than for MAKING IT RIGHT — the test
   becomes the target instead of the record. For felt qualities (smoothness, feel) that is
   actively wrong, because the assertion is a lossy proxy for the thing the user perceives.

  **Two loops, and they must not be fused: the INNER loop is the agent driving the real app
  (seconds, no gate, no conductor); the OUTER loop is the gate as final sieve (rare, terminal).**

Iteration does not need the gate. Only LANDING does. Provenance discipline — builders never push,
the conductor gates and lands — stays exactly as it was; that was never the bottleneck.

The brief template changes:
1. Reproduce by DRIVING first — no test written yet. If you cannot see it, you cannot fix it.
2. Iterate drive -> change -> drive. One instrument at a time. Never the suite, never 3x.
3. Write the contract only AFTER the symptom is gone, to lock in what was achieved.
4. One verification pass at the END.
5. Judge by observation of the real path; assertions PREVENT REGRESSION, they do not DISCOVER fixes.

That inverts the previous order, where the test came first and dragged the work behind it.

Corollary the user drew, worth keeping: **the gate must be TIMELESS.** A sieve that depends on FPS
is a sieve that depends on the machine, so it is both slow and arguable. Count-based assertions
(#133) have no clock in them: they cannot be slow, cannot flake under load, and cannot be excused.
Making the gate timeless attacks the bottleneck from the other side — cheaper AND stricter at once,
which is the signature of a real reduction rather than a trade.

## 2026-07-27 02:30 — the law file is read from the WORKTREE, so law changes do not reach running builders

User asked: "are all agents aware that driving first is the new way?" The audit said no. codex
auto-reads `AGENTS.md` from its own worktree, and worktrees fork at different commits — so each
builder sees the law file AS OF ITS FORK POINT. Tonight: overlayfix (forked at `185abf9`) had every
new law; foldfeel (merged main mid-task) had all but bycatch; scaleinv (forked at `25cdf18`,
resumed later) had NONE of them — no Primary Loop banner, no defaults-first, no scale parity — and
its resume prompt explicitly told it to follow "the Primary Loop section in AGENTS.md", a section
that did not exist in its tree. An instruction pointing at a missing law reads as noise, not law.

  **Doctrine propagates at FORK time, not at WRITE time. Updating the law file changes future
  builders only; running builders keep the law of their fork point.**

Remedies, in order:
1. **Sync on dispatch and on resume**: copying main's current `AGENTS.md` into the worktree is
   safe — it is a repo file, identical to main's version, so it merges cleanly later. Done for the
   two stale worktrees tonight.
2. **Add it to the dispatch checklist**: any brief that cites a law by name must be preceded by a
   grep for that law in the TARGET worktree's AGENTS.md. Citing a law the worktree cannot see is
   the same defect as the loop prompt pointing at the retired ibr lessons file.
3. Long-lived worktrees that merge main mid-task pick laws up incidentally — fine, but incidental
   is not a mechanism. The sync is the mechanism.

## 2026-07-27 02:45 — a generated artifact got COMMITTED because the ignore pattern named an instance

Landing the scale-invariance branch, the fast-forward aborted: an untracked
`artifacts/fold-dense-scroll-smoothness.json` in the checkout "would be overwritten by merge" —
because the branch TRACKED it. A generated run artifact had been committed.

Cause: `.gitignore` listed `artifacts/scroll-smoothness.json` — the INSTANCE that existed when the
rule was written. The fold work then produced a sibling, `fold-dense-scroll-smoothness.json`, which
the pattern did not match, so it was neither ignored nor noticed, and a builder swept it in with
`git add -A`.

  **An ignore rule that names an instance does not cover the class. The next instance is invisible
  by construction, and `git add -A` will commit it.**

Same family as the smoke asserting a glyph an invariant forbids and the monitor keyed on a filename
that already existed: a rule written against today's names silently fails on tomorrow's. Prefer
pattern-by-KIND (`artifacts/*scroll-smoothness.json`) over pattern-by-NAME, and treat a merge
aborting on "untracked file would be overwritten" as evidence that something generated is tracked —
not as a local-cleanliness problem to sweep aside.

Second-order note from the same minute: `git merge --ff-only … | tail -1` printed `Updating a..b`
and I read it as success — but the merge ABORTED after that line. That is the fourth
output-order/exit-code misread of the session. `tail -1` shows the last line, not the outcome;
verify the REF moved, not the message.

## 2026-07-27 03:10 — a brief is read at LAUNCH; appending to it does not reach a running agent

The rapid-fire builder was dispatched, and over the next fifteen minutes I appended FOUR addenda to
its brief file: the diff-surface clue, the render-stall reframing, the seconds-long-freeze severity
with a re-ranked hypothesis list, and the sibling overlay defect. Its report addresses NONE of them
— zero mentions of the diff surface, zero of stalls or frame gaps, no backlog-scaling test. It
fixed the throttle it was originally briefed for (well, and with real evidence) and never saw the
rest.

  **`codex exec` reads its brief at launch. A file the agent has already read is not a channel.
  Appending to it is writing to a mailbox nobody checks again.**

I did this four times in one night while telling myself the information had landed, and I even
checked the log's phrasing once and concluded "still reading — it will pick this up". That check
was worthless: seeing the process read the file ONCE says nothing about whether it re-reads.

Rules:
- **Post-dispatch information requires a NEW DISPATCH**, not an append. Either stop and relaunch
  with the fuller brief (cheap when minutes old — the earlier redispatch for the accumulation spec
  cost three minutes and was clearly right), or queue the addendum as an explicit ROUND 2.
- If you do append for the record, say so plainly in the report to the user rather than implying
  the running agent now knows.
- **Verify by the OUTPUT, not by the plumbing.** The only reliable evidence that an instruction
  reached an agent is that its work reflects it. Grep the report for the addendum's subject before
  believing it landed.
- Same family as the doctrine-propagation gap two hours earlier: `AGENTS.md` changes reach only
  FUTURE builders, and worktrees keep the law of their fork point. Both are the same shape —
  **information written after a reader has read is invisible to that reader** — and both need a
  push (redispatch / file sync), never a passive edit.

## 2026-07-27 03:45 — when a symptom will not reproduce in-harness, build an instrument where it LIVES

The user reported a multi-second render freeze under rapid flicks, on two surfaces, on a real
`package-lock.json`. A dedicated builder drove 1s/3s/5s continuous bursts on editor and diff, at 2k
and 100k, fold-dense, at defaults — and could not reproduce it. Every input window produced frames.
The only zero was a 100 ms phase-boundary artifact that neither recurred nor grew with duration,
which is the OPPOSITE of a backlog signature.

It did the right thing: no production change on speculation, and it landed the missing observable
anyway (frame-gap sequences, frames-per-input-window, a 3-second `render-progress` contract, and
`The render loop never wedges` as a count-based impossible state). An honest negative plus a
permanent instrument is a real deliverable.

  **But a non-reproduction in the harness is not evidence of absence — it localizes the defect to
  what the harness cannot reach.** The next step is not more harness driving; it is an instrument
  that runs WHERE THE SYMPTOM LIVES.

What our harness structurally cannot exercise, and why each could produce exactly this symptom:
- the user's real terminal + VM output backpressure — a slow consumer applies pressure a headless
  emulator never does;
- real trackpad/mouse event rates and burst SHAPES, which scripted notch writes only approximate;
- the user's LIVE session (agent, terminal, LSP, git watcher all active) versus a minimal fixture;
- their actual document, not a generated look-alike.

This is the same class as the graphics tier and the nerd-font PUA code points: **a property the
harness cannot probe needs the user's real terminal or a persisted declaration.** Tonight adds the
negative form of that rule — a DEFECT the harness cannot probe needs a capture that runs on the
user's machine.

Practical shape, now queued as #140: a bounded, off-by-default capture mode (frame timestamps,
input arrival, top per-frame callees) plus an analyzer with a planted-gap positive control. The
user reproduces in seconds what an hour of driving could not, and the fix waits for THAT evidence.

## 2026-07-27 04:30 — a queued HOOK gate is still a gate (CORRECTED 05:10 — I cited a retired rule)

I launched the `fix-render-stall` gate while a commit was already queued whose pre-commit hook runs
the full gate. Two gates ran concurrently, and the hook gate went red on `audio-narration`.

The durable half: **a pre-commit hook is a gate I did not type.** The tell is easy to miss because
the second gate has no command of mine attached to it — it is a side effect of `git commit`. Before
launching a gate, ask what else is holding a commit. A queued commit is a queued gate.

**CORRECTION.** I originally wrote this up as breaking "my own one-gate-at-a-time rule." That rule
was RETIRED on 2026-07-25 and the skill says so explicitly — gates may overlap, because both
shared-namespace collisions behind the old rule were fixed in 9f6c617. Writing doctrine that cites a
retired rule is worse than writing none: it re-imposes superseded constraint on whoever reads it next,
which is the same failure the cron section warns about for stale prompts. Check the skill before
invoking a rule by name, especially your own.

The rule I ACTUALLY broke — three times tonight, not once — is the live one:
**A GATE MUST NOT OVERLAP A LIVE BUILDER.** A gate and a builder's verification phase are the same
resource. I ran the chrome-wave gate with two builders alive, then the doc-commit hook gate with
three. The skill's warning is precise about the cost: it produces reds indistinguishable from
starvation. That is not hypothetical here — of the chrome wave's three reds, two have exact
literal-text causes that are load-independent and therefore safe, but `scrollbars` is a
thumb-paint timing condition whose verdict I have now made ambiguous by my own scheduling.

  **"Looks quiet" is not a builder being idle.** A builder in its reading phase produces log growth
  and no CPU; minutes later it reaches its own `bun test` and smokes, inside the gate's window.

Cost paid twice over: the #141 brief had to lead with "establish whether it survives a SINGLE-gate
run," buying later, with a builder's time, the discrimination that correct scheduling gives for free.

## 2026-07-27 04:35 — the escalation path from "retry-tally regular" to "hard red" is a DEFECT signature

Two for two now.

`overlay-dialog` was a first-attempt timeout that passed on retry, for two days, and was treated as
ambient load. When it finally went hard red the cause was structural: `requestPaint()` mutated the
reactive `paintRevision` AND directly asked the renderer for a frame, so a stale frame could win.
Two owners of one obligation. Never load at all. It went 4/10 red → 20/20 green.

`audio-narration` has now walked the identical path — nightly retry-tally regular, then a hard red
that survived its own quiet retry.

  **A flake that passes only on retry is not noise that happens to be loud. It is a race whose
  window is usually smaller than the retry interval.** Load moves the window; it does not create it.

The retry mechanism is what hides this: it converts "fails under contention" into a green tick and a
tally line nobody reads. So the tally is not bookkeeping — it is the **early warning**, and a name
that recurs in it has already declared itself. Open it as a defect, not as a flake, and require a
mechanism before accepting any load story.

## 2026-07-27 04:40 — a gate blocker OUTRANKS a solo slot, because the solo task lands through the gate

#125 (the repo-wide ivue statics codemod) holds a SOLO slot precisely so nothing else touches the
tree while it runs. That looked like a reason not to dispatch the `audio-narration` fix.

It is the opposite. **#125 cannot land through a red gate.** The blocker is not competing with the
solo task for the machine; it is a prerequisite for it. Serializing behind the solo slot would have
left the codemod finished and unlandable.

  **A solo slot excludes work that CONFLICTS with it, not work it DEPENDS on.**

The general form: when scheduling, separate contention (two jobs wanting the same resource) from
dependency (one job gating the other's completion). Only contention justifies waiting.

## 2026-07-27 04:45 — a codemod branch resolves conflicts by RE-RUNNING the codemod

While #125 is in flight, every commit I land to main raises its merge cost — a branch that rewrote
471 source files conflicts with essentially any concurrent change.

Do not hand-resolve that merge. Hand-resolving a mechanical transformation is how a codemod acquires
exceptions: each manual resolution is a site where the rule was applied by judgement rather than by
the tool, and none of them are visible afterward.

  **Merge main INTO the codemod branch taking THEIRS for conflicted files, then re-run the codemod
  over the merged tree.** The transformation is idempotent; that is the property being bought.

Corollary for fleet scheduling: a repo-wide codemod is cheapest when main is quiet, so batch doc and
small fixes rather than trickling them in. If main must keep moving, accept it deliberately and plan
the re-run — do not discover the cost at merge time.

## 2026-07-27 04:50 — a builder measuring a LOAD-SENSITIVE defect needs the machine quiet

Standard fleet concurrency here is 2–3 builders. That cap assumes the work is CPU-bound and
order-independent.

It does not hold when a builder's deliverable is a MEASUREMENT of a timing-sensitive intermittent.
Its first job is a failure RATE on an idle machine; a second builder compiling in the background
makes that number meaningless, and worse, makes it meaningless invisibly — the run still produces
digits.

  **When a builder's output is a rate or a latency, its concurrency budget is part of its brief.**

So the cap is not a constant. It is set by the most measurement-sensitive job in flight.

## 2026-07-27 05:00 — I stated an ENVIRONMENT FACT from memory, and the builder had to correct me

My #141 brief asserted, in bold, that `espeak-ng` is **not installed** on this machine, and
built a whole requirement on it ("do not fix this by installing espeak-ng; the gate must be
green on a machine that does not have it, because ours does not").

`/usr/bin/espeak-ng` has been there since April 2024. The claim came from a memory note
saying the narration harness *needs* espeak-ng, which I silently converted into *lacks*.
One `which` would have settled it. The builder checked, found the binary, and said so.

  **A brief's environment claims are ASSERTIONS, and a brief is read as authoritative. Run
  the check before writing the sentence.** Cheap to verify, expensive to propagate: the
  builder would have been entitled to design an entire espeak-absent degradation path for a
  condition that does not exist here.

The general form is the measure-before-briefing rule applied to the environment rather than
to a cause: a remembered fact about the machine is a hypothesis about the machine.

Credit where due — it also read the brief closely enough to contradict it rather than
comply with it. That is the behaviour the drive-first loop is supposed to produce.

## 2026-07-27 05:05 — a FRESH WORKTREE has no `node_modules`, so the first measurement is garbage

The same builder's first ten baseline runs all exited 1. Not the defect: the new worktree
had no `node_modules`, so the harness failed inside its unit-test preflight on unresolved
`vue` and `ivue/extras` before Invar ever launched.

Ten runs of a clean, consistent, completely meaningless red. Worse, the failure mode
resembles the real one closely enough to be believed — an exit 1 from a smoke you dispatched
someone to investigate for exiting 1.

  **`git worktree add` copies tracked files only. Install dependencies as part of worktree
  creation, before dispatch — not as something the builder discovers.**

Dispatch procedure is now: create worktree → `bun install` → copy brief → launch. And any
brief whose first step is a measurement should say that a setup failure is not a data point,
so a uniform red gets re-examined instead of averaged in.

The builder recovered on its own — it noticed the preflight was failing rather than the app,
restored the lockfile dependencies, and re-ran the untouched ten. Then the REAL rate
appeared immediately: run 1 pass, run 2 timeout. Which also answers the contention question
below.

## 2026-07-27 05:10 — the narration red reproduces SOLO, so my two-gates mistake did not cause it

I attributed the `audio-narration` hard red partly to my own rule-break (two gates running
concurrently). With dependencies restored on an idle machine and no gate running at all, it
failed on the second run.

So: the rule-break was real and stays recorded, but it was **not** the cause here. Correct
the attribution rather than leaving a tidy story standing.

  **Owning an error is not the same as owning a causal claim about it.** Self-blame that
  outruns the evidence is still a wrong diagnosis, and it costs the same as any other — it
  would have sent the fix toward scheduling instead of toward the race.

The escalation-signature prior held: retry-tally regular → hard red → reproduces solo. Two
for two that this pattern means a defect.

## 2026-07-27 05:00 — the narration mechanism, and the invariant it exposes

Worth recording in full, because the mechanism is more general than the smoke.

`NarrationProjection.bargeIn()` stops the TTS backend and increments a probe. Stopping audio
**changes no terminal cells**. But `StatusChannel` publishes its snapshot when a render frame
SETTLES — so the probe sat in memory with nothing to carry it out. The only periodic idle
repaint in the app is the status-bar clock, at the next minute boundary. A 30-second waiter
therefore passed when that boundary fell inside its window and failed when it did not.

The measured rate was `0, 1, 0, 1, 0, 1, 0, 1, 0, 1`. **Perfect alternation — wall-clock
phase, not load.** Every load story ever told about this smoke was wrong, and the shape of
the data said so all along; nobody had run ten in a row and looked at the sequence.

  **A semantic action that changes no cells cannot depend on a render frame to publish its
  state.** Publication must happen at the mutation boundary for anything the UI does not
  redraw. Frame-coupled publication is correct only for state a frame actually carries.

Diagnostic tell worth reusing: after the timeout, one extra keystroke produced a frame, and
that frame published the probe. So the action HAD run and only its publication was stale —
which distinguishes "the code never executed" from "the code executed and nobody heard it"
in a single step. Reach for that before bisecting.

Both hypotheses I ranked in the brief were ELIMINATED (the espeak path; a two-owner stale
frame race). The ranked-candidates method still worked: a wrong ranking costs minutes when
the builder is told to measure first, versus the hour it costs when told one confident cause.

## 2026-07-27 05:10 — a liveness predicate must observe what the brief ASKS FOR at that phase

My fleet heartbeat called both live builders STALL: "no source file written in 20 minutes."
Both were fine. One had a `bun` process actively driving the app, and both codex logs had
grown within the previous minute.

The predicate contradicted my own brief. The glide brief's first instruction is **"REPRODUCE
BY DRIVING FIRST. Write no assertion yet."** During that phase, zero source writes is the
CORRECT behaviour — so the heartbeat flagged compliance as death.

  **Liveness evidence must match the phase of work being asked for.** Under drive-first, life
  shows up as an advancing agent log and spawned harness processes, not as file mtimes. File
  writes are evidence of the EDIT phase only.

Fixed by keying the heartbeat on codex-log growth (with `DIED`/`DONE` still resolved by
process absence plus report presence). Note the failure direction: it reported toward
"broken," which invites the conductor to interrupt healthy work — the same direction my own
probes have failed in six times now. Prefer predicates that observe the mechanism, not a
side effect of one particular phase of it.

## 2026-07-27 05:30 — a LAYOUT change invalidates every probe that locates by label or position

The chrome wave landed three surfaces cleanly, with six positive controls and honest
invariant-record updates — then went red on two smokes it never ran: `agent-search` and
`scrollbars`.

Both reds are almost certainly the PROBE, not the app. The `agent-search` log is the tell:

```
Timed out waiting for grid condition: the themed search icon paints in the agent engine mode line
│  claude ⇄ · perm: bypass ·  ⌕
```

The captured frame **contains the glyph it says is missing.** The footer used to read
`engine: claude ⇄ · follow: o…`; the task required reducing that line so it stops overflowing
under the terminal pane, so the `engine:`/`follow:` labels are gone — and the probe located
its line by that text. `scrollbars` fails on the diff thumb, exactly where the hidden tab row
was reclaimed and pane content moved up a row.

  **The blast radius of a layout change is not the set of files you edited. It is every probe
  that locates its target by a label string or a row offset.**

That set is invisible from the diff, which is why the builder's verification — thorough on
the surfaces it touched — missed both. The instruction that would have caught it is not "run
more checks"; it is "enumerate the probes that depend on what you MOVED."

Three standing consequences:
- This is the third instance of the class. `editorArea.title` going blank broke a
  smoke-markdown probe that found its pane by title text; `smoke-gutter-diff` asserted a
  glyph an invariant had already forbidden; now two probes keyed on moved chrome. **Probes
  must locate by owner or semantic role, never by copy text or offset.**
- The risk was already FLAGGED and DATED in #105 —
  `smoke-agent-search.sh:66` hardcodes `⌕` via `characters.indexOf`, "an appearance dependency
  of exactly the class that re-broke twice." A flagged risk with no owner is a scheduled
  outage; flagging is not mitigation.
- Round-2 briefs for this class must force the probe-versus-app verdict FIRST and separately
  per smoke, because the two diagnoses need opposite fixes and "make the smoke green" quietly
  chooses one. And re-keying a stale probe to a NEW label just moves the dependency.

## 2026-07-27 05:40 — the layout change did not BREAK that probe, it EXPOSED what the probe was missing

Round 2 came back with split verdicts, and the split is the whole point.

- `agent-search`: **stale probe, app correct.** The frame painted the footer and clicking the
  glyph really did open the FindBar. The predicate still demanded the retired `engine:` copy.
- `scrollbars`: **app WRONG, probe correct.** `DiffView`'s `SolidThumbScrollBar` sliders had
  never been given theme track/thumb colors. The bar has been unthemed this whole time.

And the sharp part: **the probe had been PASSING by matching unrelated right-edge paint** and
calling it the diff bar. Reclaiming the hidden tab row moved the geometry enough that the
coincidence stopped holding.

  **A probe that passes for the wrong reason is worse than one that fails.** It reports a
  contract that was never being checked, and it converts an unrelated layout change into a
  mystery red — the diagnosis lands on whoever moved the rows, not on the defect.

This is the same family as the instrument rules already recorded (a check that can only pass is
not an instrument; a smoke the gate never runs is not a contract). Tonight adds the third
member: **a check that passes on a coincidence is not a contract either.** All three fail the
same test — ask what would have to be true for this assertion to go red, and whether that thing
is the property you meant.

Two operational consequences:
- Had the round-2 brief said "make the smokes green," a user-visible defect would have shipped
  behind a re-keyed probe. Forcing a per-smoke probe-versus-app verdict, decided BY DRIVING, is
  what surfaced it. Keep that shape for every stale-probe round.
- A layout change is therefore not only a blast radius, it is an OPPORTUNITY: it perturbs
  coincidences and shakes out probes that were passing by luck. Reds following a layout change
  deserve a real verdict, not a re-key.

The census it produced is now debt with an owner: eight further probes keyed to retired copy or
fixed rows (four agent-footer, four diff-toolbar/positional), enumerated and deliberately NOT
expanded into a scoped repair. Enumerating without fixing is correct here — but only because it
is now written down and tasked, which is what #105 failed to do with the `⌕` risk it flagged.

## 2026-07-27 06:00 — `every([])` is TRUE, so a probe that measures nothing reports success

The fourth instrument failure of the night, and the most dangerous, because it is invisible.

The ivue naming rename turned `static get defaults` into `static get DEFAULTS`.
`smoke-settings-applied-harness.ts` derived its field list by regex over SOURCE TEXT:

```js
settingsSource.match(/static get defaults[\s\S]*?return \{([\s\S]*?)\n\s*\};/)?.[1] ?? ''
```

Case-sensitive, so it matched nothing, `?? ''` swallowed the miss, and the field list came back
empty. The gate printed `FAIL all 0 schema fields have an applied-effect drive`.

**It only failed because someone had written `schemaSettingNames.length > 0 &&` on the assertion
line.** Without that guard, `uncoveredSettings.length === 0` is vacuously true over an empty
list, and the rename would have switched off the whole settings-applied contract while the gate
went GREEN with zero settings covered.

  **A probe that parses source text by identifier spelling is coupled to naming in a way the type
  checker cannot see, and it fails SILENTLY TOWARD EMPTY.** Derive from the runtime instead —
  enumerate the imported object — so a rename breaks the import loudly or does not break anything.

Two refinements worth carrying forward, one of which the builder found rather than me:

- **A compound assertion should report WHICH clause failed.** I asked only for a non-zero guard;
  it split empty-enumeration and uncovered-fields into separate failures with separate messages.
  `all 0 fields` is ambiguous between "nothing to check" and "nothing passed" — precisely the
  ambiguity that made this take a diagnosis instead of a glance.
- **Every guard needs its own positive control.** It planted both an uncovered field
  (`uncovered: theme`) and an empty enumeration, and quoted both reds. A guard against vacuity
  that has never been seen to fire is itself vacuous.

The class is now closed, not just the instance: its sweep found no other raw source-text
identifier parsers in the harnesses or checkers.

Four members of this family in one night: a check that can only pass, a check that never runs, a
check that passes on a coincidence, and a check that measures nothing. **One test catches all
four — ask what would have to be true for this to go red, and whether that thing is the property
you meant to assert.**

## 2026-07-27 10:27 — arming a replacement monitor must STOP its predecessor, in the same action

Second false "wedged" alarm tonight from the same cause. A monitor watched
`/tmp/lockvalid-codex.log` (round 1, cold for 55 minutes) while resolving a LIVE pid for the
round-2 builder in the same worktree. Live pid + dead log = confident report of a state that does
not exist.

Both times the mechanism was identical: I created a new monitor for the next round and left the
previous one running. The reconciliation sweep has a step for exactly this — "any Monitor watching
a log/worktree whose subject already completed" — and I answered it twice by checking only the
other half of the step ("any builder WITHOUT a monitor").

  **A replacement monitor and its predecessor are one operation, not two.** Stop the old one in the
  same action that arms the new one, or the pair will disagree.

And the general form, which is the third instance of this shape tonight: **a probe assembled from
two sources must have both sides pointing at the same subject.** The pid came from
`/proc/<pid>/cwd`, the liveness from a log path, and nothing tied them together — so a new round in
the same worktree silently desynchronised them. Same defect family as reading a piped command's
exit code: the thing measured was not the thing named.

Failure direction again toward "broken", which invites interrupting healthy work. That is now six
probes of mine tonight that failed in the direction that invites waste. Prefer predicates keyed to
a single authority (here: the log the CURRENT round writes, discovered from the round, not from a
remembered filename).

## 2026-07-27 16:20 UTC — a green gate is scoped to the commit, not the branch

#149's gate exited 0 on `1d72df0`. I nearly landed on that green. But main had moved to
`317e267` (#137's drive quickstart) while the branch sat, so the branch's merge-base was
`5efc870` — three landings back. Merging would have produced a combined state that **no
gate had ever run against**, carrying a green earned on a different tree.

  **Before landing, ask whether main moved since the gate ran. If it did, the green is
  stale: merge main into the branch and re-gate.** A gate result names a commit, not a
  branch, and a branch's name is the same after main moves underneath it.

Cheap check, and it is the same shape as the quiet-lock lesson: the number was real, the
thing it described was not the thing I was about to act on.

### The phantom-deletion trap, in a new position

`git diff --stat main..fix-scheduling-bound-contracts` reported
`scripts/harness/Drive.ts | 512 ---------` — reading exactly like *this branch deletes the
exploration driver we shipped an hour ago*. It deletes nothing; #137 **added** those 512
lines to main after the branch was cut, so main-relative diffing shows them as removals.

The memory note for this covers reviewing *your own* branch. The new site is **landing
review of a builder's branch**, where the false reading is worse: it looks like the branch
is destructive, which is the one finding that would make me refuse a merge. Same fix, wider
scope:

  **Any branch review — yours or a builder's — diffs against `git merge-base`, never against
  a main that may have moved.** `git diff $(git merge-base main <branch>)..<branch>`.

Positive control that it was phantom: `git diff --name-only $BASE..$BRANCH | grep -i drive`
→ empty. One command separated "the branch deleted it" from "main gained it".

## 2026-07-27 16:20 UTC — a sixth member of the instrument family: the check that reds correct code

The five known members all report success without measuring. This one is the mirror: it
**measures faithfully and fails on code that has no defect**, because it enforces a habit
rather than a property.

I proposed two gate greps for the ivue anchor rule. The user asked, in effect, what the
checker would be for — and one of the two collapsed under the question. "Every installed
test double must be `Static()`-wrapped" is tidy, uniform, and grep-checkable, and it would
have red-flagged `AppLoader.test.ts`, which is correct as written, while catching no defect
anywhere: probed, forgetting the wrapper on an override-only double changes nothing.

  **Justify a gate rule by what goes red, not by how uniform it reads.** If you cannot name
  a defect the rule catches and a file it would wrongly accuse, you have not finished
  designing it.

The property worth gating was already available and narrower: *a class declaring a
`$`-static getter must reach its consumers through `Static()`*. It covers production
anchors and declaring doubles with one rule, and it exempts override-only doubles by
construction rather than by an exception list — which is the tell that it is keyed to the
real property. Three rules collapsed to one, and one fewer checker to maintain.

Related and worth keeping separate: **a habit can be right without being enforceable.**
"Always wrap the double" removes a judgment from the author and costs nanoseconds in test
code, so it is good guidance. It is still not a contract, because its violation is not a
defect. Gate what is invisible; leave habits as habits.

## 2026-07-27 16:40 UTC — I armed a monitor on a sentinel my own launch could not emit

Minutes after appending the lesson about instruments that fail toward "still running", I did it
again, in the cleanest possible form.

Launched the #149 re-gate as:

    nohup setsid bash scripts/merge-gate.sh > /tmp/gate-schedbounds3.log 2>&1 &

and armed a Monitor grepping for `GATE_EXIT`. But `merge-gate.sh` does not print `GATE_EXIT` —
earlier runs had it because those launches wrapped the call and echoed `GATE_EXIT=$? WALL=...`
themselves. I reused the *predicate* from the previous round and not the *launch* that produced it,
so the two halves came apart.

Result: the gate reached `merge-gate: ALL-PASS` at 5m59s and exited. The monitor stayed silent and
would have stayed silent for its full 30-minute timeout, with a clean green and a landable branch
sitting there. I only noticed because I checked the log directly while answering something else.

  **A sentinel is part of the launch, not part of the watch.** If the predicate names a string, the
  command that produces that string must be in the same call that arms the watcher. Never carry a
  predicate forward from a previous round to a launch you wrote differently.

Two supporting notes:

- The correct predicate here was available and mechanism-free: the process is gone AND the log
  contains `merge-gate: ALL-PASS` / `FAILED`. That is what the gate actually writes. I invented a
  sentinel instead of reading what the tool emits — the same error as keying a probe to a
  remembered filename rather than to the round that writes it.
- **CPU, not log age, distinguishes wedged from working** — and here neither applied, because the
  process had already exited. The first question on a quiet log is "does the process still exist",
  and only then "is it burning CPU". I went to CPU first and would have been misled by an empty
  answer if I had not also listed the log's own verdict lines.

This is now the seventh probe in two days that failed in the direction that wastes work rather than
the direction that interrupts it. The bias is consistent enough to be structural: I write predicates
that assume the subject is still alive, because that is the state I am waiting to leave. Prefer
predicates that name the terminal states the tool actually writes, and enumerate them all — a watch
that can only observe one outcome is silent on every other.

## 2026-07-27 16:47 UTC — a builder's log contains every document it was told to read

Armed a failure-signature grep on the new builder's codex log:

    grep -iE 'rate.?limit|quota|usage limit|stream error|fatal|panic|401|429|insufficient'

It fired within three minutes. Six matches, all false:

1. my own brief text — the word `handleFatal` matched `fatal`;
2. a CAUTION line in a doc containing the word "quota";
3. `fatal: TypeError: Attempted to assign to readonly property.` — **quoted inside
   `/tmp/statics-READY.md`, the PREVIOUS attempt's blocked report**, which the brief explicitly
   instructs the builder to read;
4-6. the IBR framework's own objection-severity vocabulary ("**Fatal** — the objection defeats the
   claim as stated…").

The first is the `pkill -f` defect again — a predicate matching the subject through its own brief
text, which cost two builders on 2026-07-26. But the third is worse and is the real lesson:

  **An agent's transcript contains, by construction, every document it was told to read — including
  prior failure reports quoted verbatim. No content-grep over that log can distinguish THIS run
  failing from this run READING ABOUT a past failure.**

So the fix is not a tighter pattern. Tightening chases an unbounded set: any error string that has
ever been written down in this repo can legitimately appear in a healthy builder's log, and the
better our failure reports get, the more error prose a well-behaved run contains. The clause was
DELETED, not narrowed.

  **Detect a builder's failure from OBSERVABLES, never from prose:** process exit, commits ahead of
  base, whether the report artifact exists, log-silence paired with CPU. Those cannot be forged by
  the builder reading something.

General form, and this is the third distinct instance of it in two days: **a predicate must not be
able to match its own subject's inputs.** `pkill -f` matched a brief; a monitor matched a brief and
a quoted report; and earlier a liveness check matched a remembered filename rather than the round
that writes it. All three read a channel that carries the instructions as well as the results.

Note the failure direction, which for once was the safe one: toward "broken" rather than toward
"still running". That invites interrupting healthy work — cheaper than stranding it, but still
waste. It is also the fourth monitor defect of the day, against one real finding, which says the
monitors themselves now deserve the treatment we give app instruments: a positive control, and an
explicit answer to "what would have to be true for this to fire, and is that the thing I meant?"

## 2026-07-27 17:05 UTC — a probe can confirm a symptom while the corpus already holds the cause

The user asked whether the repo already had a rule against `#private`. It did — the "`Static()`
`#private` caveat" in `project.skill-upgrades.md`. I had just "discovered" it from a runtime probe.

The probe was not wrong, it was SHALLOWER. It concluded *a `#`-private static getter does not cache*.
The recorded caveat gives the mechanism: **a `Static()` class is a SUBCLASS of `$Class`, and a `#`
name is keyed to the exact class that declared it, so `this.#member` is REJECTED on the wrapped
receiver** — a broader failure than "does not cache", and one my probe's single symptom would never
have generalised to.

  **Search the corpus BEFORE probing, not instead of it.** A probe answers the question you thought
  to ask. A prior record answers the question someone already worked out — often with the mechanism
  attached, which is the part that generalises. Probing first and searching never is how a repo
  accumulates two statements of the same rule at different depths.

Two structural notes:

- **The rule existed but was not OPERATIVE.** It sat in `project.skill-upgrades.md`, a proposals
  file, tagged *(minor)*. `project.conventions.md` — loaded first by every resume, embedded
  mechanically in every delegate packet — did not carry it. A known limitation parked in a notes file
  is indistinguishable from an unknown one: nothing loads it, no gate reads it, and the next agent
  re-derives it. When a caveat is confirmed real, PROMOTE it to the operative file; leaving it in
  notes is the documentation equivalent of a smoke the gate never runs.
- **The instrument existed too, and was better than the one I proposed.** I specified a source grep
  for `static get #$`. `scripts/ast-query.ts private-members` already covers `private` + `#private`,
  and `ast-query.ts` is already gate-resident (`conventions-gate.sh` runs its
  `text-input-census --require-zero`). So enforcement was a one-line addition in an established
  style, and an AST query is strictly correct where grep is not — grep matches `#` inside comments
  and strings. Before specifying a new checker, grep for an existing one that already parses the
  thing.

## 2026-07-27 18:15 UTC — the gate went green twice on a change that made the app unusable

The statics anchor migration (#125, 144 source files) passed a full merge gate ALL-PASS — 69 OK
steps, clean green, `idle-quiescence violations=0` — and again on the follow-up (#130). Within two
hours the user reported "everything is laggy", then "the app is unusable, i had to close". Two of
their idle instances were burning 52% and 65% CPU; a two-day-old instance on pre-migration code sat
at 0.8%. Reverted to `063e3ab`, `src/` proved byte-identical to the last known-good tree, user
confirmed it was fixed.

The doctrine is in the skill now. What belongs here is the diagnostic record, because three of my
hypotheses died and the manner of their death is the useful part.

**Refuted 1 — two-receiver cache miss.** The discovery test read every `$`-getter through `$Class`;
the app reads through `Class`. Per-receiver caching made that look decisive. It is not:
`Reactive()` is in-place, `Class === $Class` is `true`, the cache hits, zero recomputes, a million
reads in 2.3 ms. Note what actually happened here — I had FOUND the two-receiver fact hours earlier,
checked it against test doubles, and written "zero current exposure". That conclusion was correct,
but not because of the check I ran: I never looked at the production read path at all. **A
conclusion that is right for a reason you did not verify is not knowledge, it is luck with a
citation.**

**Refuted 2 — read cost as the cause.** Real and worth keeping: `Static()`'s guarded getter is
**3.8× slower** than the old self-replacing property, 2.56 ns vs 0.67 ns over 20M reads each. But
50% CPU needs ~200 million reads/second. The mechanism was true and the magnitude was absurd, which
is the most seductive kind of wrong answer — every detail checks out except whether it can produce
the symptom. **Before briefing a mechanism, multiply it out against the observed magnitude.**

**Refuted 3 — construction cost.** 6.0 → 12.3 ns across 45 constructed classes at 59 non-loop
sites. Orders of magnitude short.

**And one invalid test of my own.** I booted the migration's code headless and measured 1–2% CPU,
falling, and briefly took that as a refutation. It refutes nothing: no PTY, so the render loop may
never have run. I built an instrument that could only report green while writing doctrine about
instruments that can only report green. The reproduction requirement went into the brief as the
named negative example.

The clue I under-weighted for several minutes, and the one that mattered: **the CPU rose with
uptime.** 52% at 45 s, 65% at 4:57. A fixed per-operation cost does not grow. That single reading
eliminates every per-op hypothesis above without any probing, and points at undisposed
effects/listeners — plausible because `Static()` inserts a new subclass generation into 143 classes
and `$stopEffects` resolves per-receiver. Handed to a builder (#150) with a real-PTY reproduction
required before diagnosis and a bisect across the three separable groups, because by then I had
killed three structural reads by measurement and that is the signal to stop reasoning.

One more, quieter: the user's own long-running instance was the control group. A two-day-old process
on old code, sitting at 0.8% next to two new ones at 50%+, is a natural experiment nobody designed.
**When a user reports a regression, ask what else is still running.**

## 2026-07-27 20:15 UTC — three vacuous measurements in one day, all mine

Today's outage was a missing `bun install`. Getting to that answer took six refuted hypotheses, and
what slowed it down was not the hypotheses — it was that **three of my own measurements measured
nothing**, and each one nearly became a reported finding.

1. **A headless boot of a PTY app.** `bun run src/main.ts > log 2>&1 < /dev/null`, 1–2% CPU falling.
   No PTY, so the render loop may never have run. I briefly took it as a refutation.
2. **A path-existence audit that could not read its own sentence.** Flagged
   `src/modules/system/Static.ts` as a dead citation; the sentence's entire point was that the file
   *was deleted*. A checker that resolves paths without reading the clause around them invents work.
3. **A two-leg version comparison whose legs were the same version.** Ran the capability probe in a
   worktree whose `package.json` had been restored but whose `node_modules` had not, so both legs
   loaded ivue 2.2.1 and both printed "caching present". I nearly published that as evidence the
   probe could not discriminate — which would have killed the correct design.

Plus a fourth of the same family from earlier: a `git ls-tree ... 'src/**/*.ts'` glob that matched
nothing, so a freeze census summed over zero files and printed a confident `post=0`.

  **Every measurement needs the question: what would this print if the thing I am measuring were
  absent?** All four printed the same output for "healthy" and for "not measured". That is not a
  weak instrument, it is a non-instrument.

The concrete discipline that caught each one, worth copying:

- **Print the environment inside the leg, not around it.** #3 died the moment the probe printed the
  installed version per leg instead of my asserting it from the worktree name.
- **Pin the negative case explicitly.** The real two-leg table needed a scratch directory with
  `"ivue": "2.1.0"` written by hand. "The old worktree probably still has the old version" is an
  assumption wearing a measurement's clothes.
- **A positive control before the subject.** The `bun --cpu-prof` capture was only trustworthy
  because a deliberately hot function came back as 52 of 52 samples first. `perf` failed that same
  check (`perf_event_paranoid=4`) and was discarded instead of shipped — the one time today the
  control did its job before the measurement mattered.

Failure direction, again: all four failed toward "nothing wrong here", which is the direction that
strands work rather than interrupting it. That is now consistent enough across two days to treat as
a personal bias rather than coincidence — I write predicates that assume the healthy state, because
healthy is the state I am hoping to confirm.

## 2026-07-27 21:30 UTC — a wait whose pattern can match ITSELF never fires

This waiter spun from 2026-07-26 21:12 to 2026-07-27 21:30 UTC and could never have completed:

```sh
bash -c 'until ! pgrep -f "codex exec ... -C /tmp/conductor-foldperf" >/dev/null; do sleep 5; done
         ...; bash scripts/merge-gate.sh > /tmp/gate-foldperf.log'
```

The waiter's own `bash -c` argv CONTAINS the pattern, so `pgrep -f` always found itself, always
concluded the builder was alive, and slept forever. Its gate never ran and its log was never
created. The builder had exited a day earlier.

Same root cause as the kill trap already recorded, opposite symptom: there a `-f` pattern kills the
wrong process, here it makes a wait immortal.

  **A full-command-line pattern is not a predicate about a process — it is a predicate about text
  that includes your own.**

And the reason it went unnoticed for a day: **a wait that can never fire is indistinguishable from a
wait that is still waiting.** Both are silent. That is the same failure direction as the vacuous
measurements — toward "nothing wrong here" — so a long wait needs a deadline and a distinct expiry
line, and the harness (a tracked background command, or a Monitor on the builder's own log) is
better than a hand-rolled spin because its expiry is visible.

The operating rule is unchanged and already in the skill: resolve process identity through
`/proc/<pid>/cwd`, never through the text of a command line.

## 2026-07-27 21:40 UTC — a red inside a SOFT step reaches no verdict, and its leak outlives the run

The #152 gate declared `merge-gate: ALL-PASS` and exited 0 while its own log contained:

```
|   FAIL orphan bun processes from this run: 2912951
| == wrap-up: ... measurement failures=2 · idle-quiescence violations=0 · target misses=1 ==
| EXIT 2 — measurement failure(s): the affected numbers cannot support their claims
```

The verdict is honest — `perf-baselines` is declared `SOFT — reports, does not block`, and perf
numbers are load-dependent, so making them block would red honest trees. But three things about
this shape are wrong, and only the first is cosmetic:

1. **The verdict line launders the step's own self-diagnosis.** The step said *the affected numbers
   cannot support their claims*; the gate printed `WARN — target miss or measurement gap`. A soft
   step should surface its own failure COUNT on the verdict line, so `measurement failures=2` is
   legible without reading the block.
2. **A soft step can report N failures and show fewer.** `measurement failures=2` with exactly one
   `FAIL` line visible, because the gate prints a bounded TAIL of a soft step's output. The count
   and the evidence disagree, and the count is the honest one. Bounded output is right; a bound that
   can hide a named failure is not.
3. **The orphan is not a measurement opinion — it is state.** A leaked editor at ~2.8% CPU and
   190 MB survives the gate, so the NEXT run's quiet measurement inherits contention that its own
   quiet lock cannot see. That is #147's family exactly (a contended measurement still reporting a
   number), reached through a different door. A process leak belongs in a HARD step even when the
   numbers around it are soft.

  **Soft means "does not block". It does not mean "does not need reading".** And within a soft
  step, distinguish OPINIONS (numbers that vary with load) from STATE (processes, files, locks) —
  state leaks forward into the next run's opinions, so it earns a hard verdict.

Corollary for the conductor: on ALL-PASS, still grep the log for `FAIL` and for exit codes inside
soft blocks. This run's green was clean by the retry tally and still carried two measurement
failures and a live orphan.

## 2026-07-27 22:20 UTC — a seventh instrument-family member: the status that reports attention

The user asked why `#109 (agent-permissions quiet-tail flake)` was taking so long, having watched it
sit at `in_progress` for a day. The honest answer was that nobody was working on it at all: no
brief, no worktree, no builder, no report file. The work was not slow — it was not happening.

The prioritisation itself was correct. Every fire that day went to live user direction: the scroll
campaign, the ivue outage that made the app unusable twice, the statics migration, the docs de-bloat.
A flaky smoke genuinely ranks below an unusable editor.

The defect is the STATUS. `in_progress` is a claim about the fleet — that something is driving this —
and it was made once and never re-checked against evidence. That puts it squarely in the instrument
family: **it reported "attended" without observing a driver.** Same shape as a check that reports
success without measuring, and the same failure direction the other six share — toward "nothing wrong
here", the direction that strands work instead of interrupting it.

What makes it worse than a merely stale note is the second-order effect: a task that looks attended
generates no pressure. An honest `pending` in a long backlog is visible as debt; a false
`in_progress` is invisible, because the list is telling you it is handled. **A lying status outlives
an honest backlog.**

  **`in_progress` requires a named driver — a worktree, a brief, a log. No driver, set it back.**

Two more things this surfaced, both worth keeping:

- `#124 (terminal-follow Escape intermittent)` carried the same false marker. One instance is an
  oversight; two is the rule being absent, which is why it went into the skill as an order rather
  than staying here as a story.
- The reason #109 could not simply be dispatched on the spot is itself structural: its method needs a
  QUIET MACHINE, because the finding that distinguishes it from a contention story is that it flakes
  inside the serialized quiet tail. A second live builder would poison the measurement. So its
  dispatch condition is *no other builder live* — recorded in the task, because an undispatchable
  task with no stated condition looks identical to a neglected one.

## 2026-07-27 — frame ordering retires blocking clock authority

#155 (convert the gate to frame-count mode) separated configured duration
inputs from measured-duration verdicts. The configured glide cap, easing
window, and maximum animation delta still derive row-count bounds. Delivered
continuation delay, flick pause, burst duration, and frame-gap measurements no
longer participate in blocking predicates; moving-frame order, flick frame
boundaries, completed-frame windows, events, impulses, projections, and rows
replace them.

The byte-flush gate now blocks on the user-visible boundary: the edited glyph
must be present in the first completed DEC 2026 frame after input. The p50/p95
series still appends to `.perf-history/input-byte-flush.ndjson`, and both the
individual and trailing-window comparisons remain warnings. This deliberately
loses sub-frame sensitivity: at 30 FPS, 25 ms can still fit within one frame.
That is accepted because it is not visible as an extra frame; the retained
trend carries the finer diagnostic signal without lending it blocking
authority.

The census also found two blocking duration comparisons in the terminal-stage
smoke and two blocking FPS canaries that predated the claim that byte flush was
the last clock gate. Terminal-stage now uses first-frame completeness and
relative completed-frame counts; FPS remains visible as report-only warnings.
With no blocking verdict depending on the quiet lock, only the soft
`perf-baselines` report retains quiet-exclusive coordination. Blocking gates no
longer take loud-shared or quiet-exclusive locks, so lock degradation cannot
produce `MEASUREMENT INVALID` in their path and concurrent gates can reach
independent verdicts.

## 2026-07-27 23:10 UTC — naming a thing by a proxy that merely usually coincides with it

Four times in one session, across four different tools, a check addressed its subject by something
that only *usually* matches it. Each one produced a confident wrong answer, and three of the four
were aggravated by state I had created myself.

| the check | what it actually matched | what it should have matched |
| --- | --- | --- |
| `until ! pgrep -f "codex … -C /tmp/conductor-foldperf"` | text in a command line — including its own | a process, resolved via `/proc/<pid>/cwd` |
| `grep 'never fires'` in the conductor skill | MY phrasing of a rule | the rule's subject (`pgrep`, `/proc`) |
| `sed 's/^    return 150;$/    return 900;/'` | a bare VALUE, which appeared twice | the value's identifier |
| `merge-base origin/main HEAD` for a builder's commit count | a moving ref, stale because main was deliberately unpushed | the recorded cut commit |

The consequences ranged from a waiter that spun 24 hours, to announcing that doctrine had been
deleted when the builder had merely rephrased it, to silently rewriting
`GESTURE_CONTINUATION_WINDOW_MILLISECONDS` from 150 to 900 while "restoring" the easing value, to a
monitor reporting `+2 commits` from a builder that had made none — and naming MY OWN merge commit as
its evidence.

  **A name must identify. Content that usually coincides with the thing is not its name.**

Three practical forms, each of which would have caught its case:

- resolve processes through `/proc`, never through argv text;
- to check whether a RULE survived a rewrite, grep the invariant subject and then READ the section —
  never grep the sentence you wrote;
- never reverse an edit by re-matching its content: `git checkout HEAD -- <file>` restores by
  identity, and it is what actually saved the corrupted `Momentum.ts`;
- anchor a branch's commit count to the RECORDED CUT COMMIT, not to `origin/main`, which drifts
  whenever main is unpushed — exactly the state a held red creates.

The self-referential one is worth keeping for its comedy and its lesson: the `pgrep` rule exists
because a `-f` pattern matches text rather than identifying a process, and I verified that rule's
survival with a grep that matched text rather than identifying a rule. The defect reproduces one
level up from itself, which is the tell that it is a real class and not four coincidences.

Corollary, learned the same night: when a single grep returns an alarming answer, READ THE FILE
before announcing a loss. Looking costs one command; a false alarm spends the credibility that a
real finding earns.


---

## 2026-07-27 — the bycatch leak was mine, and the eighth proxy defect was in my own monitor

### Nine reports carried bycatch; two had become tasks

The user asked whether any agents had detected bycatch. Sweeping every `/tmp/*READY*.md` for a
`## Bycatch` heading: nine reports carried entries, and two had been converted. Seven findings had
been reported correctly, sat in `/tmp`, and died there.

Builders held their end every single time — including the harder half, refusing to fix what they
found. `AGENTS.md` already named the conductor as the one who triages. The conductor SKILL.md had
no bycatch section at all, so the duty existed in the law and nowhere in the order. That asymmetry
is the whole explanation, and it is worth naming precisely because nothing looked wrong: every
individual merge was clean, every report was read, and the loss was invisible because it consisted
of things that never got written down.

Converted into #161–#167. Three were user-visible defects: Quick Open opening `project.tasks.md`
while publishing and rendering `TASK.md`; the Files pane blank at settled boot with `treeRows=50`
published; the Settings selection moving below the painted viewport at 80x24. A user would have
hit all three, and none of them came from anyone looking for them.

**The retrieval lesson:** a bycatch item is worth a fraction of its value when restated from
memory a day later. The reports carried exact reproductions — fresh isolated HOME, the specific
geometry, how many times it reproduced, which two commits. Converting them meant copying that
evidence verbatim, not summarizing it. A finding recorded as "Quick Open is flaky" would have been
worthless; the published-state detail (`quickOpenSelected=0`, `quickOpenMatches=1`, right file
rendered) is what turns it into a one-paragraph diagnosis.

One item I was carrying from memory — a stale `Fable Test` label — **did not exist in the tree**.
Grep found nothing in `src` or `scripts`. Verifying before recording cost one command and avoided
dispatching someone at a defect that had already been fixed.

### The fourth unreachable-condition instance, found in the gate that verified the third

`1597f40` (#159's merge) went ALL-PASS, `GATE_EXIT=0`, 9m47s — and its retry tally named
`behavioral-contracts (felt invariants)` as passing only on retry. The gate annotated the failure
`timeout-class` and `starvation-class`, which is a contention story. The preserved attempt says
otherwise:

    error: Timed out waiting for the next complete synchronized frame
           (completed frames observed: 58)
       at scripts/harness/SynchronizedOutputQuiescence.ts:63

"The next complete synchronized frame" is a wait for frame 59 to EXIST. It is not a condition on
content. This repo already has an ESTABLISHED invariant that harness waits observe conditions and
not frame ordinals, whose rejected-alternatives section gives the reason: an action whose target is
already painted emits no frame. If nothing needs repainting, frame 59 never arrives — on any
machine, at any load. The gate's contention label is a story attached to an unreachability defect.

That is four in two days: #158 (a probe keyed to the fourteenth moving frame of a glide that
stopped producing fourteen), #159 (a panel close whose publication had no carrier after
coalescing), #164 (panel-chrome expand-heading, pre-existing on both populations), #168 (this).
The audit is `mutation -> reachable publisher -> observed condition`.

**Why #168 outranks the other three:** it is a GATE STEP in the serial tail. Each retry consumes
the quiet window and its eventual green launders everything measured beside it into ALL-PASS. A
flaky sieve is worse than a missing one, because a missing sieve does not certify.

### The eighth proxy defect, and the first I built myself

In the reconciliation sweep I resolved builder liveness by `/proc/<pid>/cwd`, correctly, because
the rule says to. Ninety seconds later I armed a monitor that grepped the builders' LOGS for
`quota|rate limit|401`. It fired `QUOTA/AUTH BLOCK` on both live builders, matching line 474 of
the log — repo documentation reading *"CAUTION: it consumes Codex quota"*. Both were healthy and
90 seconds in. Worse, having "resolved" both, the monitor exited: the false verdict also removed
the instrument.

The rule was right and I followed it. It was written scoped to argv, and I applied it there. The
class is wider: **a builder's log contains the brief, the repo docs, and the agent's narration of
both — so it contains every word you would search it for.** Same shape as `pgrep -f` matching its
own argv, grepping for my own phrasing of a rule the builder had rephrased, `sed` re-matching a
duplicated bare value, `src.index('    unicode: [')` hitting the wrong key.

The generalization is now in SKILL.md with what to key on instead: an exit-code sentinel the
WRAPPER writes, process existence resolved by cwd, log mtime via `-mmin`, commit counts. Those
cannot be uttered by the thing being watched.

**The transferable form:** a rule stated as an instance gets followed at that instance and nowhere
else. When a rule is written, ask what the instance is an instance OF — otherwise the next site
gets the same defect and the rule's presence in the file makes it harder to see, not easier.

---

## 2026-07-28 — the record became a byproduct, and validate-late bit twice more

### dispatch.sh exists because a folder would not have worked

The user asked for auditable briefs. The obvious reading is "a place to put them"; the actual
requirement is an ORDERING. Seven bycatch findings were reported correctly and five were lost for
one reason — recording them was a separate action from the work that produced them. Every brief
written by hand had the same latent defect: it survived because someone chose to keep a copy, and
nothing would have noticed otherwise.

So `dispatch.sh` refuses to launch an agent without committing its brief first, and `land.sh`
refuses to merge without printing the bycatch. Neither is a convenience. They are the two places
where a record used to depend on someone remembering.

`land.sh` holding on untriaged bycatch is the sharper of the two, because it inverts the default:
the conductor now has to actively acknowledge (`BYCATCH_TRIAGED=1`) rather than actively remember.
`AGENTS.md` had named the conductor as triager all along; what was missing was any mechanism that
noticed when the conductor did not.

### Validate-late/act-early, twice in one night

The engine-name check sat at step 5 of `dispatch.sh`, so a typo'd engine had already cut a
worktree, run `bun install`, and COMMITTED A BRIEF before refusing. My own guard test caught it —
the test was worth running precisely because I expected it to pass.

Hours earlier the same shape cost more: pruning merged worktrees, I `rm -rf`'d `.claude/` and
`artifacts/` across 81 trees without checking whether they were TRACKED. Both are. That turned every
worktree dirty with ` D` deletions, which is exactly the condition making `git worktree remove`
refuse — so two passes removed zero while having already deleted things. I had dry-run the
SELECTION and never the OPERATION.

**The generalization: a guard placed after a side effect is not a guard, and a dry run that
rehearses which items you will touch has not rehearsed what touching them does.** Verify the
operation on ONE item, then batch.

Repo law is what kept both cheap. `--force` being forbidden is why the worktree prune failed loudly
instead of discarding work; never deleting branches is why the test branch is parked as
`orphaned/999-good-slug`; not rewriting history is why the test commit was reverted rather than
reset. Three rules I have grumbled about internally, each of which converted a mistake into a
recoverable one tonight.

---

## 2026-07-28 — the burden-of-proof rule paid for itself in one night

### #169 was sent after the wrong subject, and measurement said so

An outside review (ivue-repo Fable/Opus 5) established that every edit allocates four arrays of
length n in `EditorWrap`, plus an unlisted sort copy, and that `buildFoldProjection` runs
unconditionally even when the fold set is the identical reference. Every claim TRUE — I verified each
against the source before dispatching.

The user's directive was the thing that saved us: *it has to prove it's truly an invariant unlock…
if that does not happen, we do not adopt the complexity.* Then, later: *make 500k already
imperceptible.* So the brief measured first and gated implementation behind the number.

    wrap index sync   100k: 1.327-3.763 ms      500k: under 9.124 ms     (goal: under 16 ms)
    TextDocument      100k: 15.7-18.8 ms        500k: 65.7-86.9 ms       <- the actual cost
      max-width rescan

The candidate was already inside the goal at 500k. The real bottleneck is
`TextDocument.replaceLineRange` marking the widest line deleted and rebuilding maximum width BEFORE
comparing the replacement — so typing at the end of the longest line rescans every line, per
character. Two to three dropped frames per keystroke at 500k.

**Had we implemented the proposed Fenwick tree we would have added permanent complexity to a shared
index AND left a 65-87 ms rescan in place.** Raised as #186, where the fix looks like a reduction:
compare the replacement against the champion before deciding a scan is needed.

**The transferable form: a precise structural finding is evidence about STRUCTURE, not about COST.**
Four arrays of length n is a true fact that turned out to be 4% of the boundary it sits in. The
review's stages were ordered by implementation cost rather than by evidence, which quietly assumes
the fix is wanted — and I did not notice that when I first called the brief well-constructed. The
user questioned the premise; I had only audited the reasoning inside it.

### Both other builders declined part of their brief, correctly

- **#178** was told to consider cutting the input-byte check from five sessions to three. It measured
  the 55-entry history (p50 spans 2.326 ms to 13.014 ms), found three of five could materially move
  the median for ~8 seconds, and refused: *"The variance does not justify that weakening."*
- **#171** was offered scaffolding as a second resolution. It declined because Invar never creates or
  intercepts task files, so seeding would mean overwriting user-owned configuration — a new
  capability, not an extension.

Two briefs, two suggestions of mine rejected with evidence. **A brief that offers ranked options
gets a better answer than one that dictates**, because the builder can refuse the cheap option and
say why. Keep offering options; keep expecting some to come back declined.

### The lock does not do what I told the user it does

I dispatched three builders and stated that the machine-wide quiet lock *"lets a second builder
coexist without corrupting timings."* Wrong. It serializes when it can and after 120 seconds gives up
and runs anyway, stamping the journal `degraded` — which is what #147 fixed: degradation is REPORTED,
not PREVENTED. I read one guarantee as the other.

Journal, unambiguous:

    02:20:13  waiting   editor-edit-path-measurement   0
    02:22:13  degraded  editor-edit-path-measurement   120005

One of #169's samples was taken that way, and #178 flagged its own 4m02s as *"a conservative field
measurement, not a perfectly isolated laboratory sample."* Raised as #183, including the operating
rule: **only one measurement phase on the machine at a time, and never assume the lock enforces it.**

Note the timeout is 120 seconds while a full gate is now four minutes — a threshold that predates the
thing it guards.

## 2026-07-28 06:20 UTC — two lessons from a red main, and why I did not invent a feature

Main was red on `52dcde4` after eight landings. #189 is dispatched to separate the two remaining
failures before either is fixed. Two orchestration lessons landed in the conductor skill alongside it.

**A retry inside the pool cannot rescue a pool-caused failure.** The gate's retry-once runs in the
same 60-job pool as the first attempt, so `reserved-chord`'s "RETRIED AND STILL FAILED" is not
evidence of determinism — for a load-dependent failure the retry reproduces the exact condition it
was meant to rule out. It means "failed twice under load," and the discriminating run is standalone.
Reading it as determinism would have sent a builder hunting a defect in the smoke's logic rather than
in its load assumptions.

**A proof standard lives in doctrine or it dies with the brief.** #178 required 10/10 in-pool runs
before promoting a smoke into the pool and proved both promotions that way. Nine hours later #170
registered a brand-new smoke pool-safe by default with zero pool runs, and it is now one of the two
things blocking main. Nothing was violated — the standard existed only inside #178's brief, and
briefs do not read each other. I am the only shared memory between two builders who never meet. Filed
#190 to invert the DEFAULT rather than add a rule someone must remember: a smoke undeclared is
serial, so missing proof costs wall-clock (visible, self-correcting) instead of a red main every few
gates (looks like a flake, gets retried).

I also reconciled `project.tasks.md`, which was listing four already-merged tasks as open under a
header dated 25 minutes after they merged — the "evidence has an age" defect applied to my own record.
The ★ marker meant "a brief exists" and I had been reading it as "open"; that is now stated in the doc.

**On the loop's standing ask for a creative next push:** I did not invent one. The user's own ordering
already names what follows (#114 Wave B -> #122 -> #35), and a red main outranks all feature work.
Manufacturing a feature task here would rank my invention above user-directed work, which is exactly
what the surface-the-ordering correction forbids.

## 2026-07-28 07:00 UTC — #189 refuted three of my claims, one of which I had already written into doctrine

#189 landed at `4c4d248`. It resolved both assigned reds and overturned the framing I sent it with.

**The scrollbars red was not #186.** #186's merge is PASS×5 and the commit before it is PASS×5; the
failure enters with **#168's** wait conversion. That wait observed any byte change in the scrollbar
row, so an intermediate 44-cell thumb satisfied it before the exact horizontal extent arrived. Fixed
by observing the claim itself. #186's 500k win is untouched, which was the constraint that mattered.

**`reserved-chord` did not reproduce**: 5/5 standalone and 3/3 in real six-worker pools from the merge
base. It also refuted the reachability mechanism I proposed — by reading the fixture, where
`Bun.write` completes before `PtyTestDriver` is constructed, so the file cannot still be being written
when the query runs. The two failures at `52dcde4` stand unexplained.

That second one had already reached doctrine. I wrote the in-pool-retry section using reserved-chord
as its confirmed instance, and filed #190 saying the unproven registration "became one of two things
blocking main." Both statements outran the evidence. The retry principle survives on its own logic —
an in-pool retry reproduces the condition it was meant to rule out — but I used it to license a
diagnosis I had not measured, and #190's premise is now corrected in place rather than quietly
softened. **Two gate failures and eight subsequent passes is an unreproduced red.** Filing it as
"pool-caused" would have sent a builder to confirm my population instead of finding the real one.

**The lesson that actually generalises** is about #168, and it is now doctrine: a mass conversion needs
per-site proof, not class-level proof. #168 converted 75 wait sites, proved the class (zero identifiers,
10/10 behavioral runs), and gave 72 sites the generic "something repainted" predicate — which is a
proxy at any site whose claim is narrower. Five harnesses have now regressed from that one task: two
repaired by #188, one by #189, three open in #192. #168 named three sites as needing narrower
conditions and was right about all three; the ratio was the defect. When briefing a sweep, ask for the
exceptions to be **enumerated**, not the conversions counted.

Main is still red, now for two causes neither #189 nor I introduced: **#191** terminal-stage, where the
prompt is visibly on the grid while the compound prompt+colour predicate times out — 8 failed attempts
across 4 gates, pre-existing at the merge base, and #168's bycatch reported the same site weeks ago —
and **#174** markdown's ragged row, third sighting, but passing at the merge base three times, which
argues intermittent rather than the aligner bug I had assumed.

## 2026-07-28 07:30 UTC — the instrument is now the dominant defect source, and that reframes what is missing

A count worth stating plainly. Of every merge-gate red on 2026-07-27/28 whose cause was CONFIRMED, **all
were defects in the harness, not in Invar.** Five harnesses regressed from #168's wait conversion;
terminal-stage has failed eight attempts on a compound predicate whose subject is visibly on the grid;
shortcut-help and panel-chrome each time out on generic waits. The single open candidate for a real
product cause is #174's markdown row, and it passed three merge-base gates.

The product defects tonight — #170's stolen keyboard, #171's displacement, #186's 500k rescan — were all
found by the user or by review. **Not one was found by the gate.** The gate spent the night reporting on
itself.

So when the loop asks what the process is missing, the honest answer is not a feature. Both established
harness invariants (`Harness waits observe conditions not frame ordinals`, `Every wait names itself`)
HELD in every one of tonight's failures. They are necessary and not sufficient, because they constrain
the FORM of a wait and never the AGREEMENT between its two claims — the NAME, which is a human sentence,
and the PREDICATE, which is a machine test. #189's repair is the clean instance: the name promised a
specific horizontal-extent refresh, the predicate accepted any byte change in the row.

Staged as an experiment at `agent-dispatches/_staged/EXPERIMENT-wait-name-predicate-agreement.md`, on an
`experiment/` branch, adoption the user's call. Its acceptance bar is named BEFORE implementation — it
must flag all five known regressions at their pre-repair commits, state its precision as an adjudicated
number rather than assert it, name at least one wait nobody has reported, and leave the legitimately
generic sites a visible way to declare themselves. Six disqualifying signals are listed, including the
one this class has already failed twice here: **if it needs a vocabulary or a word list to work, it is
the rejected `.value` lint and the rejected timing-sensitivity classifier wearing a third costume.** A
recorded negative result is a successful outcome; there is precedent.

**Not dispatched.** #191's terminal condition is a full merge-gate ALL-PASS while it chases a
timeout-class defect, and a second builder's verification produces exactly timeout-class contention. The
exception rule — gate under load when a contention red would still be diagnostic — does not apply here,
because contention reds are indistinguishable from the thing #191 is hunting. The brief is committed and
dispatchable the moment #191 reports.

## 2026-07-28 07:45 UTC — the hard blocker was the length of a name I chose

#191 landed at `23a681b` with a **full merge gate at exit 0, ALL-PASS, no step passed only on retry.**
Eight consecutive failures across four gates, the red that held main all night, and the cause was this:

the predicate required the text `fixtures` in a themed terminal header, and in a task worktree the
header read `parallels@ubuntu2:/home/parallels/.../191-terminal-stage-compound-p`, clipped at the
panel-heading boundary. The suffix it wanted was outside the cell. **The path was that long because I
named the worktree `191-terminal-stage-compound-predicate`.**

The split did its job exactly as briefed and the first measurement named the half: `COLOR PASS -> TEXT
FAIL`, five times standalone and four times in-pool, never alternating. So the conjunction-timing
hypothesis and the colour-capability hypothesis were both killed by the same table — and the colour one
twice over, since `PtyTestDriver.childEnvironment` supplies `COLORTERM=truecolor` to the application in
both tiers regardless of the parent's empty value. Two of my three ranked candidates were wrong; the
one that was right was right for a reason I had not guessed.

Two things follow. The predicate was over-specified and the repair is correct regardless — it asserted a
fixture suffix when the behaviour under test was "the header shows shell identity and a working
directory." But **every observation of that failure came from a worktree**, and the fleet's worktree
paths are the longest in this repo because I choose the slugs. "Pre-existing at the merge base" was
true and thoroughly misleading: it was pre-existing in every environment anyone had run it in, and all
of those were mine. Doctrine now carries it — a probe that asserts rendered text can be broken by the
length of the path it runs in, and the conductor supplies that path. Keep slugs short.

The other thing worth carrying is that **splitting a compound predicate localises rather than repairs.**
The split commit did not fix the gate; the gate failed again right after it, and only then could the
builder see which half to fix. I nearly read that intermediate red as the split being wrong. A
conjunction reports one bit for two claims — the split buys legibility, and legibility is what the
eight previous attempts lacked.

#191's first repair then exposed a SECOND compound wait in the same smoke, which took a transcript
coordinate from an intermediate frame and clicked a row the agent turn had since moved. Its repair is a
pattern worth reusing: await published state proving the operation completed, then REACQUIRE the
coordinate from the stable grid before acting. A coordinate must not be carried across a settling
condition. That is now the second named pattern in #192 alongside #189's.

## 2026-07-28 09:05 UTC — a wait that was already true let a smoke pass while doing nothing

#192 landed at `cd96549`. Three of five waits repaired, two left alone because their predicates were
already narrower than "something repainted" — the right answer to a brief that asked for an enumeration
rather than a count of edits. A builder declining to change two of its five assigned sites, with the
reason stated, is the behaviour I want and the fourth time a builder has correctly declined part of a
brief this session.

The finding worth keeping is not a proxy wait. `smoke-scrollbars-harness` waited for "any dot anywhere"
as proof an edit had painted an overview mark. File-tree and document dots already satisfied that
before any edit — and focus was still `files`, so the driven `End` and `X` **never edited anything.**
The smoke asserted the result of an edit that had not happened, and passed.

That is the inverse of the reachability class and it is worse than a timeout. A timeout is loud. A
pre-satisfied wait is silent: the smoke proceeds as though the action succeeded, later assertions run
against a state the action never produced, and they can pass because the fixture's resting state
satisfies them. Nothing could see it — the coverage ratchet counts calls and every call was still
there. Doctrine now carries the tell: **ask what the screen looks like BEFORE the action, and whether
the predicate is already true of it.**

It also carries a corollary I will need: when a quietly-green smoke starts failing after a nearby
change, the change may have made a real assertion **reachable for the first time.** Do not assume the
change broke it.

Main's sole remaining blocker is now **#187**, escalated from a one-line bycatch note to the gate's only
red. `smoke-editor-harness` sends six rightward Option-wheel events, confirms a greater
`editorScrollLeft`, then sends EIGHT leftward events and waits for a generic screen change. The
viewport clamps at `scrollLeft 0` and the remaining events have nothing to repaint. #192 proved it at
the merge base properly — gate HEAD equal to base, no diff in the implicated files. It is the same
defect `bun run drive` hit at the right clamp during #186, so #187 now has two consumers and one shape,
and the brief asks whether they can share one "wheel until this scroll position, tolerating a clamp"
generator instead of two local repairs.

Sixth spelling of the same class. The ranked candidates in #187 name the fix that is NOT allowed:
reducing the leftward count to match the rightward one would arrange for the clamp never to be reached,
which hides the class until the next caller over-scrolls.

## 2026-07-28 09:05 UTC — I handed the user a command I had never run

The user asked for a 500,000-line TypeScript file to play with. I generated it, verified it properly —
independently with `awk` rather than trusting the generator's own output: 500,000 lines, 39,048,738
bytes, sole widest line at 250,000 — and then printed `bun run start <directory>` as the way to open it.

**I never ran that command.** `start` is pinned to `bun src/main.ts .` and `AppLoader` reads only
`process.argv[2]`, so the appended path became `argv[3]` and was dropped. Invar opened its own
repository. The user reported the files did not exist.

This is the night's dominant defect class landing in the one place it reaches a human: I asserted a
behaviour without checking it was reachable. And the failure mode was the worst available — **correct
work looked broken.** A silently ignored argument is indistinguishable from a missing file, so the
user's reasonable conclusion was that I had generated nothing.

Doctrine now carries it: an instruction is an assertion, so run it from the directory the reader will
run it from before writing it down — including the ones too simple to fail. When a script prints the
instruction, its self-test must cover the printed output and not only the file it produced. Filed #195
for the underlying trap, because a wrapper that accepts an argument and ignores it is worse than one
that rejects it; that is the interface form of a silent wait.

Two things I got right and want to keep doing. I checked whether the 2 MB LSP limit actually existed
rather than accepting the user's premise — it does, `lspFileSizeLimitKb` default 2048, with a
user-visible notice so a suppressed file is never a silent no-op. And I shipped `small.ts` beside
`huge.ts` as a positive control, because a file the language server never attached to looks exactly like
one it deliberately gave up on; without the control, a quiet editor would have proved nothing. That is
the same reasoning the fleet has been applying to waits all night, applied to a hand-test.

Also caught before it cost anything: `tsconfig.json` declares neither `include` nor `exclude`, so
`tsc --noEmit` compiles every `.ts` under the repository root and `.gitignore` does not hide a file from
the compiler. A 500k-line module in `tmp/` would have made the gate unusable. **Fifth instance of
checkers walking the filesystem rather than the index.** The workspace lives outside the repo instead.

## 2026-07-28 09:35 UTC — the user out-measured me twice, and the second time supplied the contract

Two reversals in one exchange, both mine, both found by the user driving the real path.

**#169's decline was a category error, not a measurement error.** The instrument put the wrap sync under
9.124 ms at 500k; I compared one subsystem's cost against the WHOLE 16 ms frame and called it fine. The
user typed in a real 500,000-line file and it was not fine. The comparison was invented, and I had no
principled basis for the apportionment I chose.

**Then they handed me the acceptance test I should have found myself.** ivue's flyweight invariants
record — our own substrate — carries an impossibility boundary that already forbids the editor's
behaviour: "an interaction whose cost is O(total cells)" and "a full-document recalculation, ever". A
keystroke is the first; `buildPrefix` is the second. Rendered as a contract it needs no budget at all:
count array writes per keystroke and require the count IDENTICAL at 2k and 500k. The repo already had
that idiom from #133 and I did not reach for it. Doctrine now says: before accepting a performance
verdict, ask whether a scale-invariant form of the claim exists; if it does, the millisecond figure is a
report, not a gate.

**The LSP hypothesis was theirs and it was right — my process evidence pointed the wrong way.** I
measured tsgo as a child of Invar holding 623 MB after reading 51 MB, and inferred it had scanned the
workspace on its own initiative. Then they said "I see types when I hover", which is a fact my inference
could not survive: `transportFor` calls `ensureStarted` BEFORE any size check, so a single hover started
the subprocess the suppression exists to avoid, and the request went out for a document we had refused
to send. The guard was write-only; four request paths were unguarded. Fixed at one seam ahead of
`ensureStarted`, with both directions asserted — and the over-budget test needed real responders
registered, because without them it would have passed vacuously, returning null because nothing answered
rather than because the guard declined. My own test, the same defect class I wrote doctrine about hours
earlier.

Then the second A/B, also theirs: types gone, typing still slow. That RULES OUT the LSP for the edit
path by measurement rather than argument, and confirms #196's target instead of assuming it.

**Held deliberately: no gate this cycle.** `fix/197-lsp-request-guard` is verified and unmerged, and a
full gate spawns ~60 app instances. The user is interactively evaluating typing latency in that very
tree right now, so a gate would both slow their app and corrupt the impression they are forming. The
"conductor must not compete with its own fleet" rule extends to the user as a machine citizen. The gate
runs when they are done testing.

## 2026-07-28 14:14 EDT — a control that cannot fail, a fixture that cannot expose, and the fourth partial conversion

**Two of my own instruments produced confident numbers while measuring nothing, in one hour.** First,
`timeout bun scripts/...` printed eight instant identical failures and my loop reported
`FAIL (exit 0)` — a verdict incoherent with its own status field, which is the tell. `bun` is not on
this shell's PATH at all (only `~/.bun/bin/bun` exists; the merge gate exports it at line 16, my ad-hoc
shell did not), so `timeout` never ran the subject. Eight data points, zero measurements. Second, and
worse because it looked rigorous: I "proved" the new tsconfig `exclude` worked by running the same check
with `--excludeDirectories nonexistent-dir` as the negative arm. That flag is ADDITIVE, so both arms read
0 and the control could only ever agree with the thing it was checking. A real control needs an arm that
DEMONSTRABLY FAILS: a `tsconfig.control.json` with `include: ["tmp/**/*"], exclude: []` fired, ingesting
both fixtures, 34s, ~125,000 errors, exit 2 — which is also the cost the exclude avoids. Rule: when a
control and its subject agree, ask whether the control CAN disagree before believing either.

**And the liveness probe I have already written doctrine about, used wrong again.** I reached for
`find . -newermt '-5 minutes'` in this same cycle — the form that matches nothing — and read its empty
output as a quiet builder. Caught only because a recalled note contradicted it. The `-mmin -8` form found
eight files immediately. A probe whose failure mode is "reports silence" must be run against something
known to be live in the same breath; I now pair every liveness probe with the transcript file as its
positive control. Writing the doctrine does not install the reflex.

**A fixture that varies SIZE cannot expose a defect that scales with STRUCTURE.** The 500k/1M flat
fixture drove the whole flyweight port to a real result — identical per-keystroke counts at 2k and 1M.
The user then asked the question the fixture could not answer: what about a huge nested package.json,
with fold regions "bigger than viewport or bigger than a single block stored in this new architecture".
Every fold region in the flat file is a few lines and none crosses a block boundary, so a region-size
defect measured perfectly clean. Folding one region of the new nested fixture reproduced slowness
immediately at both 554k and 970k. Rule: state which axes a fixture VARIES and which it holds CONSTANT,
and treat the constants as the untested surface. "It scales to 1M" meant one axis.

**Fourth instance of partial coverage presenting as total, and this time in work I had just accepted.**
The flyweight port converted `rowCounts` and `blockRowCounts` to `Uint32Array` and left
`visibleLineByLine` as `Array.from({length: lineCount}, (_, i) => i)` — a plain boxed array of a million
numbers, reallocated and identity-filled on every projection rebuild. It is the only one of the three
that FOLDING reaches, which is exactly why the unfolded fixture never touched it. The O(1) keystroke
result survives only through an empty-array singleton: with nothing collapsed the identity check holds,
and one collapsed region removes that escape. So the accepted result was true and its scope was
narrower than the claim. When a conversion sweeps a class, enumerate the class MEMBERS and say which
were converted — "converted the row-count arrays" hid a third array in plain sight.

**Committed record beat resumable session, measurably.** The user asked whether to revive the builder
that did the port. Its session resumes (verified present, and resume does restore full context) but the
rollout is 4.6 MB / 2,117 lines; the same knowledge sits committed in the repo as 578 lines of brief plus
report. Fresh agent pointed at the artifacts, ~1% of the context cost. This is the payoff of the standing
rule against writing to an agent's private memory: the artifact is what makes a cold start equivalent to
a resume. The one thing resume would have answered better — whether the third array was left plain
DELIBERATELY — I turned into an explicit question in the brief against the committed report.

**Exonerate before attributing, and the population separation is cheap.** A gate red on the combined
tree failed reserved-chord twice, arriving right after the flyweight landing — the shape of a regression.
Six interleaved runs per arm said otherwise: 0/6 on the combined tree, 0/6 on plain main, identical.
Interleaving rather than batching matters, because it shares ambient load between arms instead of
confounding it with the arm. The red is a pre-existing intermittent and the landing is clean; without
those twelve runs I would have spent the cycle bisecting my own good work.

## 2026-07-28 15:15 EDT — three confirmations for one channel, each verified against only the failure that burned it

**A confirmation must be keyed on the state of the CHANNEL, not on the fate of the PAYLOAD.** I wrote
three delivery checks for `agent-tmux send` in one day and the first two were both guesses about where
the message text ends up:

1. *went busy* — one reachable outcome against an already-busy session. Replaced same day.
2. *no `[Pasted Content N chars]` placeholder* — blind to text TYPED into the composer, which renders as
   ordinary visible lines with no placeholder anywhere. Reported `submitted` while ~1900 characters sat
   there unsent. **The user found it by looking at the pane.**
3. *a probe from the message is gone from the pane* — blind to a message that SUBMITTED, because codex
   echoes the submitted turn into the transcript, so the text never leaves the screen. Reported failure
   on a real success.

The observable that separates all three states was there the whole time: the COMPOSER LINE. Capture it
while the composer is known empty — immediately before sending — and compare after. No hardcoded
placeholder, no assumption about the transcript, works for submit and queue alike. Verified against
three fixtures where the empty and submitted panes share an identical composer line and the stuck pane
has none.

**The generalisable defect is not any of the three checks. It is that I verified each replacement
against the failure it had just seen and no other.** Check 3 was written with check 2's failure in hand
and a positive control proving it caught check 2's case — and it shipped broken for a state neither had
encountered yet. A positive control that replays only the last incident licenses the next one.

So, before trusting a repaired instrument: ENUMERATE THE STATES ITS SUBJECT CAN OCCUPY, and evaluate
the new predicate against every one of them. Here that was three — empty, holding unsent text,
submitted — and the fixtures should have covered three from the start. This is the same operator as
the impossibility boundary applied to instruments: name what the check must say NO to, not only what
it must say YES to.

**Also learned, cheaply, and it cost delivery of a whole steering message: while a codex turn is in
flight, `Enter` is a no-op and `Tab` is what queues.** The footer says `tab to queue message` and that
footer IS the state signal. Ten Enter nudges at a busy session change nothing. No amount of
confirmation logic helps if the submitting keystroke is wrong for the current state — which is why the
key choice is now re-read on every iteration rather than decided once.

**And a monitor of mine had the identical shape in the same hour.** I keyed a report-rewrite monitor on
"content hash differs from baseline" — and a DELETED file also differs, since absence hashes to
nothing. It fired `REPORT-REWRITTEN` during the deletion half of a rewrite, while the file did not
exist. Corrected to: exists, non-empty, differs, and size-stable across two polls. Same lesson: I
enumerated the state I wanted and not the states available.

## 2026-07-28 16:14 EDT — the user caught two regressions the instruments called clean, and both gaps were WHICH FIXTURE

**Twice today the ground truth came from the user driving, not from any check I ran.** First the tab
re-activation delay, which they diagnosed correctly before I did. Then a flat-file editing regression
after the fold work, while every count contract I had independently verified stayed green.

The second one is the one worth doctrine, because the gap was structural and I walked past it. #203
extended the editor for folding. Every latency table in both of its reports used the NESTED fixtures —
its "unfolded" rows were nested JSON with nothing collapsed, NOT the flat `.ts` axis. `scale-edit` mode
exists for exactly that axis and was never re-run. So the flat file that MOTIVATED the original
flyweight work lost its measurement, and that is where the regression landed. I read both reports
closely enough to verify their numbers and did not notice that an entire axis was absent.

**The rule: when work extends a subsystem for a NEW case, re-measure the OLD case.** The new case gets
attention by construction — it is the task. The old case is where regressions hide, because nobody is
looking and its numbers are assumed to carry. And the report must ENUMERATE the axes it covered *and
name the ones it did not*, because an unnamed axis reads as a covered axis.

This is the same operator as the instrument lesson from three hours earlier — enumerate the space,
don't verify against the case in front of you — so I extended that doctrine section rather than adding
a second one. Applying to myself the discipline I had just asked the builder to apply: one rule
reaching another case, not a new mechanism beside it.

**And the sharper half: a green count contract is evidence about COUNTS.** Per-keystroke array-write
counts were identical before and after — I verified that on my own run, twice, with a positive control
proving the counter could move. The user still felt a clear slowdown. Both can be true, because a new
cost can arrive in a currency the counter does not measure: comparisons, document reads, snapshot
validation, or first-paint work landing inside the typing window. When a count and a human disagree,
the count is the one with the narrower view. The repair therefore has two halves of equal weight — fix
the cost, and add a counter for its currency — or the same regression is free to recur behind the same
green.

**Process note that worked.** The user stopped me from interrupting the builder mid-measurement to
restate a requirement it had already demonstrated unprompted (it mirrored instrument assertions into
`bun test` in round 2, 37 assertions including the counter's own positive control, with nobody asking).
The cheap moment for that point is REVIEW OF THE ARTIFACT, not a mid-flight nudge. A queued
interruption costs a live measurement; a review finding costs nothing.

## 2026-07-28 17:0x EDT — main landed four merges, and the flake that unblocked it was an environment difference

**`reserved-chord` was never a race.** It resisted four gate sightings and three investigations. A
builder measured 10/10 passing standalone and clean across eleven gates at `a93b7e8`; I measured 12/12
failing on that same commit. Neither was fabricated. Codex bundles its own ripgrep at
`~/.codex/packages/standalone/releases/*/codex-path/rg` (verified 15.1.0 and 15.2.0), which a
codex-launched app inherits; my shell has `rg` only as a Claude Code shell FUNCTION, which no child can
inherit. Quick Open enumerated zero files and the wait could not be satisfied.

The gate provisions nothing — `parallel_safe_smoke` only records a command — but it INHERITS the
environment of whatever launched it, and that launcher differs between me and every builder. Promoted to
doctrine: a cross-check against a builder's numbers is not a replication unless the environments were
compared, and when our measurements contradict, the first hypothesis is now the environment rather than
an error by either party.

The inverse bit is the uncomfortable one: codex's extra tooling was CONCEALING a real application defect
— Quick Open silently returns nothing in a non-git folder on a machine without ripgrep. A builder better
equipped than the user's machine will hide exactly the defects users hit.

**Landing tally for the day, stated without gloss.** Main moved from `a93b7e8` to `d3721b2`, carrying
the flyweight edit path, the LSP read guard, folded editing with scale-invariant toggles, and the
fixture repair that unblocked all of it. Gate ALL-PASS in 4m18s, fast-forward so main is byte-identical
to the gated tree. But: three regressions reached a tree every instrument called clean, and the USER
found two of them by driving. Both times the gap was which fixture got measured. The gate needed three
quiet retries to go green, which is the fourth day running that the retry population has been the
loudest thing in verification, and it now has its own builder.

**A numbering error worth not repeating.** I dispatched the flake investigation with the label `205`
before creating its task, so the number was a guess; the task list then assigned #205 to something else.
Branches are never renamed here, so the label now disagrees with the ID and both records carry a note
explaining it. Create the task first, then dispatch with its real number.

**A hold I took deliberately.** The user's directed drive-tool work (#204) was ready to dispatch
alongside the flake investigation, and two builders is within cap. I held it anyway: the flake builder's
entire deliverable is population separations on LOAD-SENSITIVE smokes, and a second builder spawning app
instances would inflate the very timings it measures. The cap is about machine capacity; this was about
not corrupting evidence I had just asked for. Concurrency limits should be reasoned per pair of tasks,
not only per count.

## 2026-07-28 19:15 — the negative space is one mistake, not several

The user reduced a session's worth of my errors to a single defect: *"i think you would always forget
the negative space, check for existence but not non existence or vice versa."* That is the correct
reduction, and it retires four separate lessons I had been carrying as independent.

Every instance is a check run in ONE polarity, whose output therefore cannot distinguish *the thing is
absent* from *the check cannot see*:

| instance | what was checked | what was never checked |
| --- | --- | --- |
| `find -newermt '-10 minutes'` | "0 files written" | whether the predicate can match ANYTHING (it cannot — it matches nothing, ever) |
| monitor on "hash differs" | difference | existence — it fired on the DELETION half of a rewrite |
| `grep \| tail \|\| echo` | the success branch | that `\|\|` is unreachable, because `tail` succeeds on empty input |
| `pkill -f merge-gate.sh` | "a process matches" | that argv contains INSTRUCTIONS — it matched builders whose brief said *do not run merge-gate.sh* |
| three dispatch guards | that they refuse | what NOT refusing does |

That last one happened while building the tooling for the other four, which is the useful part. Three
refusal guards were verified by running them and watching them refuse. The fourth check was the
negative control — proof the guard does not simply refuse everything — and it was run the same way,
against a script with side effects. **"Did not refuse" meant it cut a worktree, committed a brief
reading `brief`, and launched a codex on a task nobody asked for.**

**A control that mutates the system is not a control.** The negative arm of any guard test needs a way
to reach the guard without paying for the action. `dispatch.sh` now has `DRY_RUN=1`, which stops after
every guard and before the first side effect.

### The operational form

Every check supplies BOTH arms before its result is readable:

- the PRESENT arm must find something — proves the check can see;
- the ABSENT arm must find nothing — proves the check can be silent.

**If both arms agree, the instrument is broken. Report that instead of a number.** This is the same
rule as *an instrument must fail loudly*, generalised: a positive control alone proves only that a
check can fire, and a check that fires on everything is as useless as one that never fires.

### Tooling, so this stops depending on my remembering

- `scripts/fleet/probe.sh` — `builders` (by `/proc` cwd, with an impossible-path arm that must stay
  empty), `writes` (`-mmin`, never `-newermt`, with a planted canary that must be found), `gate` (a
  finished log must not read as running), `exit` (a command's own status, never a pipeline's last
  stage). `self-test` proves each can both fire and stay silent.
- `scripts/tasks/ledger-status.ts` — ledger counts plus four drift signals; `--self-test` plants one of
  each PLUS a clean control that must produce nothing.
- `DRY_RUN=1 scripts/fleet/dispatch.sh` — the negative arm of a dispatch-guard test.

The generalisation worth keeping: **when the user names a pattern behind several of my mistakes, the
pattern is the fix and the instances are not.** Building four separate guards would have left the fifth
instance free to happen — and it did happen, an hour later, in the very work meant to prevent it.

## 2026-07-28 19:25 — `orphaned/` becomes `retired/`, and the doctrine moves into the skill

**Vocabulary change (user-directed):** the branch park-tag for work that never landed is now
`retired/<branch>`, matching `.invar/tasks/retired/`. 31 tags migrated; the branches themselves were
never touched, only the tag name. Full vocabulary: `finished/` (merged) · `retired/` (never landed) ·
`reverted/` · `blocked/`.

**Why it is worth a rename at all:** branch states and task states describe the same lifecycle, and
having them use different words meant a reader had to learn two vocabularies for one idea. Earlier
entries in THIS file still say `orphaned/` and are left alone — they are dated accounts of what was
true when written, and rewriting a log to match current vocabulary is how a record stops being
evidence. The live rule lives in `AGENTS.md` and the conductor skill, both updated.

**Migration method, since renaming a tag means deleting one:** create the new tag, verify it resolves
to the SAME commit, and only then remove the old name. Delete-then-create loses the pointer if the
create fails — the same ordering defect as validate-late/act-early in `dispatch.sh`.

**Doctrine relocation.** The user asked that this stop living only in a log: *"add all this where
necessary into conductor skill, so you know how to operate, make it prominent so mistakes stop
happening."* So the negative-space rule is now **RULE ONE** in the conductor skill, immediately after
Rule Zero — the second thing read, not the four-hundredth line. It carries the instance table, the
"a control that mutates the system is not a control" corollary, and the runnable tooling.

The ledger protocol section gained the parts that were only in my head: the Engine/Environment/Model/
Effort block, the number-first naming for every file kind, the park-tag vocabulary, and the tracker
command with its self-test.

**The general lesson about lessons:** a rule recorded in a chronological log is found only by someone
who reads the log. A rule that must fire on every fire belongs where the reader starts. Appending here
is how a lesson is CAPTURED; promoting it into the skill is how it becomes OPERATIVE, and those are
two different acts. I had been doing only the first.
