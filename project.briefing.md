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
