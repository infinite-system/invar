# Conductor lessons — consolidated

**What this file is.** The orchestration lessons, grouped by the RULE rather than by the date
they were learned. 102 dated entries collapsed into these families, because most of them are
the same handful of mistakes recurring. A lesson repeated eleven times under eleven headings
reads as eleven lessons. That is why none of them stuck.

**Nothing was discarded.** The full append-only log is `project.conductor.archive.md`
(3,351 lines, verbatim, moved with `git mv` so history follows it). Every instance below
cites its date, so the account is one search away. **Read this file; consult the archive.**

**Where a rule is OPERATIVE.** A lesson recorded here is CAPTURED. A lesson in
`.claude/skills/conductor/SKILL.md` is OPERATIVE — that is what gets read at the start of a
run. Those are two different acts. Doing only the first is how the negative-space rule got
broken an hour after being written down. When a family below hardens, promote it.

**Appending.** New lessons go under the family they belong to, as one dated line, unless
they are genuinely a new family. If you cannot find the family, that is the finding. Say so.

---

## 1. THE UNREACHABLE WAIT — asking for evidence of a change that will not happen

**The rule.** A result condition is only safe when the result is REACHABLE. Before writing
any wait, ask: **is this thing FALSE right now?** If it is already true, the correct wait is
a no-op, not a timeout. Walk `mutation → reachable publisher → observed condition` and check
that each link can occur.

**Its inverse is the more dangerous direction: the PRE-SATISFIED wait.** A condition already
true when the wait begins launders a no-op into a green. It is silent, and it looks like
coverage, because the ratchet counts CALLS. **A wait that cannot fail is worse than the
flake it replaced.**

**Never widen a timeout or raise a frame budget to fix one.** Both convert the defect into a
slower version of itself. The timeout is exactly what disguised this class as flakiness for
days. Converting between spellings of an unreachable wait fixes nothing.

| date | instance |
|---|---|
| 07-26 21:50 | a completion predicate keyed on EXISTENCE is satisfied before the work starts |
| 07-27 06:00 | `every([])` is TRUE, so a probe that measures nothing reports success |
| 07-27 21:30 | a wait whose pattern can match ITSELF never fires |
| 07-27 16:40 | I armed a monitor on a sentinel my own launch could not emit |
| 07-28 09:05 | a wait that was already true let a smoke pass while doing nothing |
| #158 | a probe keyed to the 14th moving frame of a glide that stopped producing fourteen |
| #159 | a mutation with no publication carrier |
| #161 | a settle preceding its own publisher |
| #164 | panel-chrome expand-heading, pre-existing on both populations |
| #168 | "the next complete synchronized frame" — frame 59 that does not exist |
| #187 | a clamped wheel with nothing left to repaint |
| #188 | a screen change with no cause |
| #192 | eight leftward wheels against six rightward; the viewport clamps at 0 |
| #198 | two pre-satisfied wheel predicates — the launder-a-no-op shape |
| #204 | `Drive.ts:421` awaited a repaint after EVERY key, in the tool everything is built on |
| #211 | a reformat wrapped a declaration across rows; the contiguous-string predicate could never match again |

---

## 2. THE NEGATIVE SPACE — a check run in one polarity ⚑ (RULE TWO in the skill)

**The rule, in the user's words (2026-07-28):** *"you would always forget the negative
space, check for existence but not non existence or vice versa."* One defect, not several.
A single-polarity check cannot distinguish **"the thing is absent"** from **"the check
cannot see."** Both print zero.

**Supply both arms before reading any result.** The PRESENT arm must find something: it can
see. The ABSENT arm must find nothing: it can be silent. **If both agree, the instrument is
broken. Report that, never a number.** A positive control alone proves only that a check can
fire, and a check that fires on everything is as useless as one that never fires.

**A control that mutates the system is not a control.** The negative arm of a guard test
needs a way to reach the guard without paying for the action.

| date | instance |
|---|---|
| 07-26 01:25 | a pattern match against a command line matches ARGUMENTS, not programs |
| — | a liveness check matching process ARGV matches your own briefs (`pkill -f merge-gate.sh` hit builders told *not* to run it) |
| 07-27 00:30 | `A && B; echo $?` reports B's status only if A succeeded, and silence looks like a run |
| — | `find -newermt '-10 minutes'` matches NOTHING; use `-mmin`, always with a planted canary |
| — | a Monitor on "hash differs" fired on the DELETION half of a rewrite |
| — | `grep \| tail \|\| echo` — the `\|\|` is unreachable, `tail` succeeds on empty input |
| 07-28 14:14 | a control that cannot fail, and a fixture that cannot expose |
| 07-28 19:15 | three dispatch guards verified by watching them refuse; the fourth control had side effects and launched an agent |
| 07-28 23:0x | a ledger-arm condition compared COMMITS; a branch cut from main has main's commit, so the record went to the branch — the throwaway-clone test caught it on run one |

**Tooling — never hand-roll these idioms again:** `scripts/fleet/probe.sh`
(`builders` / `writes` / `gate` / `exit`, all two-armed, `self-test`),
`scripts/tasks/tasks-status.ts --self-test`, `DRY_RUN=1 scripts/fleet/dispatch.sh`.

---

## 3. A PROXY READ AND REPORTED AS THE STATE — the instrument family

**The rule.** Naming a thing by a proxy that merely usually coincides with it produces a
check that is right until the day it matters. **Ask what the output would be if the thing
were absent.** By 2026-07-28 the instrument had become the dominant defect source — more
reds came from the harness than from Invar. That reframes what is missing: not more checks,
but checks that can be wrong out loud.

**Eight family members, each a different way to report a state nobody observed:**

| date | member |
|---|---|
| 07-27 20:15 | three vacuous measurements in one day, all mine |
| 07-27 16:20 | the check that REDS CORRECT CODE (sixth member) |
| 07-27 22:20 | the status that reports ATTENTION without observing a driver (seventh) |
| 07-27 | the eighth proxy defect was inside my own monitor |
| 07-27 23:10 | naming a thing by a proxy that merely usually coincides with it |
| 07-27 18:15 | the gate went green TWICE on a change that made the app unusable |
| 07-27 21:40 | a red inside a SOFT step reaches no verdict, and its leak outlives the run (#154) |
| 07-28 07:30 | the instrument is now the dominant defect source |
| 07-25 19:30 | the quiet tail was made of the wrong thing entirely — all 20 smokes qualified by CALLING a frame-silence helper, ZERO derived a duration. The classification was invented, not derived |
| 07-27 05:10 | a liveness predicate must observe what the brief ASKS FOR at that phase — the heartbeat called two healthy builders STALL on "no source file written in 20 min" while one was actively driving the app |
| 07-28 22:0x | my markdown control run failed on plain main, the builder's passed — the "deterministic red" was a timing race, and one control run is one sample |
| 07-29 11:3x | TWO branches' combined gates both redded workspace-tabs "watcher activation" while solo main ran green — not either branch: inotify instances were EXHAUSTED (122/128) by 31 idle codex sessions of LANDED tasks squatting in deleted worktrees, and the 6-worker pool needs 6 instances at once. A load-only red that no solo control can reproduce is an ENVIRONMENT suspect: count the shared kernel resource before blaming a branch. Sessions of landed+archived tasks are closed at landing now |
| 07-29 08:3x | a BUILDER classified its own twice-reproduced red as "unrelated bycatch" with no main control; the conductor's control ran main GREEN — the red was the builder's change. "Outside my diff" is a hypothesis; the polarity check is the evidence. Landing-time rule: any red a report classifies as pre-existing gets a MAIN CONTROL before the classification is accepted |
| 07-29 05:5x | I LANDED #237 ON A RED GATE: land.sh was chained behind a wrapper whose exit code was the trailing echo's, not the gate's — GATE_EXIT=1 sat unread in the log. A verdict must be READ from the sentinel, never inferred from a wrapper exit. land.sh now refuses without GATE_LOG showing GATE_EXIT=0 or a written GATE_OVERRIDE (exit 6, all four arms probe-tested) |

**Corollary — `in_progress` requires a named driver:** a worktree, a brief, a log. A status
that asserts attention without one fails in the same direction as the other seven.

**Corollary — a green gate is NOT evidence for a change to the GATE ITSELF** (07-25 19:25).
A builder delivered a 466-line rewrite of `merge-gate.sh`. A gate that silently drops a
smoke still reports ALL-PASS. Changes to the verification apparatus need verification from
OUTSIDE the apparatus.

---

## 4. PARTIAL COVERAGE THAT PRESENTS AS TOTAL

**The rule.** When you review any wrapper, guard, adapter, or restatement, **do not ask
"does it handle the cases named here."** Enumerate the surface INDEPENDENTLY — from the
interface, from an AST census, from the producer — and diff it against what the boundary
actually covers.

| date | instance |
|---|---|
| #197 | the LSP size budget guarded WRITES and no reads; hover started the very subprocess suppression exists to avoid |
| — | a brief's "Repo law" restated a FRAGMENT of ivue as if complete |
| — | `EditorFrameAttribution` forwarded everything except `lastLineChange` — a 1.8-second cost |
| 07-28 14:14 | the fourth partial conversion |
| 07-28 15:15 | three confirmations for one channel, each verified against only the failure that burned it |
| — | a component budget is not the frame budget (#169's category error: 9 ms judged against 16 ms) |
| 07-25 20:30 | **a coverage ratchet cannot see a deleted PRECONDITION** — a shortened fixture prefix went 0-for-5 because later assertions required the tab name to be ELLIPSIS-CAPPED. Counting assertions misses the setup they depend on |
| 07-25 23:15 | **enumerate a shared seam's CONSUMERS before calling its defect test-only** — `OpenPty.write`'s synchronous blocking `write(2)` looked like a harness deadlock and was also a real freeze risk in the integrated terminal (#81) |
| 07-28 23:0x | #114's done-test counted a STRING, not imports — `modules/agent/` scored 0 host references while Bootstrap imports it at ~25 sites; the builder ran the strict census beside the mechanical one |

---

## 5. THE FIXTURE IS THE BLIND SPOT — an instrument sees only what its subject contains

**The rule.** When an instrument reports clean and a user reports broken, suspect **WHICH
FIXTURE** before you suspect the assertion. A probe that constructs one instance at a time
cannot see a theft between two. A fixture that supplies its own subject is not a control.
When a symptom will not reproduce in-harness, **build an instrument where it LIVES** rather
than trusting the harness's silence.

| date | instance |
|---|---|
| 07-26 08:52 | a probe that constructs one instance at a time cannot see a theft |
| 07-27 03:45 | when a symptom will not reproduce in-harness, build an instrument where it LIVES |
| 07-27 05:30 | a LAYOUT change invalidates every probe that locates by label or position |
| 07-27 05:40 | the layout change did not BREAK that probe — it EXPOSED what the probe was missing |
| 07-28 16:14 | the user caught two regressions the instruments called clean; both gaps were WHICH FIXTURE |
| #203 | 500k/1M flat files do not stress folding at all — the fold must straddle viewport AND block boundaries |
| #194 | codex bundles its own ripgrep, which its spawned app inherits and the conductor's shell does not |

**A cross-check against a builder's numbers is not a replication unless the environments
were compared.**

---

## 6. A STRUCTURAL READ IS A HYPOTHESIS — measure before briefing a cause

**The rule.** An absence found by grep, a mechanism inferred from code, a story that fits
the symptom — all hypotheses. **Brief RANKED CANDIDATES, not one confident cause.** A brief
that names a cause spends the builder's effort CONFIRMING it, and a wrong named cause spends
it on the wrong thing.

**The differential is cheap. Run it before believing the load story.**

| date | instance |
|---|---|
| 07-26 01:25 | an absence found by grep is a HYPOTHESIS, not a mechanism |
| 07-26 06:25 | three impossible errnos at one call site — the MESSAGE was the bug |
| 07-26 11:30 | the failure that looked like a mystery was the feature working |
| 07-26 13:20 | the extraction did not create the bug; it removed the accident hiding it |
| 07-26 22:30 | the differential is cheap; run it before believing the load story |
| 07-27 05:10 | the narration red reproduces SOLO, so my two-gates mistake did not cause it |
| 07-28 07:00 | #189 refuted three of my claims, one already written into doctrine |
| 07-28 09:35 | the user out-measured me twice; the second time supplied the contract |
| #191 | my stale-coordinate hypothesis refuted — coordinates were identical `47,33` every run |
| #190 | reserved-chord as a "confirmed" pool flake: two failures and eight passes is an UNREPRODUCED red |
| #94 | the popup-eats-`Left` story, refuted by a clean solo run |
| #174 | filed as the one candidate PRODUCT red in the census; measurement showed a harness race — the smoke asserted preview content before the preview parsed the opened revision |

**Record refutations AS refutations.** Left dangling, a plausible story is re-chased. Four
diagnoses were overturned by measurement in a single night.

---

## 7. EVIDENCE HAS AN AGE, AND A RATE DESTROYS THE SHAPE

**The rule.** A count tells you history, not status. **Read logs as a SERIES, never as a
rate.** "50% failure" said nothing, while a clean `0,1,0,1` alternation named wall-clock
phase instantly. Ask builders for ordered sequences, and apply the same rule to your own
output.

**Prefer making the comparison automatic over remembering to do it.** The conductor
noticing is the weakest available mechanism, and it is the one that failed — twice (#179).

| date | instance |
|---|---|
| 07-25 20:30 | a retry that hides a flake is worse than a red |
| 07-25 20:50 | the flake census: 121 gate runs, 33 masked retries (~27% retry-clean) |
| 07-26 08:52 | "nothing asynchronous ran in between" does not mean nothing changed |
| 07-27 04:35 | the escalation from retry-tally regular to hard red is a DEFECT signature |
| 07-27 16:20 | a green gate is scoped to the COMMIT, not the branch |
| #179 | three regressions hid in numbers that were ALREADY PRINTED — twelve elevated latency samples, 1m22s→0m45s→12m54s, one retry per gate |
| #193 | the fold-dense contract failed at EXACTLY 995 rows twice and passed at 1002 — a repeating exact value is structure, not noise |

---

## 8. CONCURRENCY — the conductor competes with its own fleet

**The rule.** **NO GATE WHILE ANY BUILDER IS LIVE.** A gate and a builder's verification
phase are the same resource, and "looks quiet" is not idle. A reading-phase builder reaches
its own tests minutes later, inside the gate's window. A `git commit` launches a gate you
did not type, so enumerate builders by `/proc/<pid>/cwd` before committing too. The
conductor also holds its OWN heavy work while a gate runs. Take the exception deliberately
and write down why, or HOLD.

**You cannot demand a quiet machine you are not providing.** Concurrency limits are reasoned
per PAIR of tasks, not only per count. Two builders may be within cap and still ruin each
other's measurement (#204 was held beside the flake investigation for exactly this).

| date | instance |
|---|---|
| 07-25 eve | the concurrency doctrine the day paid for |
| 07-25 20:40 | a negative result worth keeping: do NOT parallelize the cheap checks |
| 07-25 20:45 | the conductor must not compete with its own fleet |
| 07-25 20:30 | a fixture rooted in a shared directory imports the whole machine |
| 07-25 21:50 | 25 minutes at 1 second of CPU — and when aborting a run IS correct |
| — | a silent builder holding no CPU may be blocked on YOUR serialization primitive |
| 07-26 06:25 | you cannot demand a quiet machine you are not providing |
| 07-26 15:15 | the quiet lock's first catch was falsifying its own favourite explanation — it is a CLASSIFIER that strips the load alibi |
| 07-27 04:50 | a builder measuring a LOAD-SENSITIVE defect needs the machine quiet |
| #183 | the lock gives up after 120 s and runs DEGRADED — shorter than one gate, so it fails exactly when needed |

---

## 9. DELEGATION — a brief is read at LAUNCH, and the builder's world is not yours

**The rule.** **A brief is read at LAUNCH. Appending to it does not reach a running agent.**
Verify by grepping the OUTPUT, and send post-dispatch information as a NEW dispatch. Law
files are read from the WORKTREE, so law changes do not reach builders already running. A
builder's environment is not the conductor's: state environment facts from measurement,
never from memory.

Delegation is **cold-start-clone orientation + task delta**: assume the agent knows nothing
about this session and everything about the repo it can read.

| date | instance |
|---|---|
| 07-27 02:30 | the law file is read from the WORKTREE, so law changes do not reach running builders |
| 07-27 03:10 | a brief is read at LAUNCH; appending does not reach a running agent (4 instances in one night) |
| 07-27 05:00 | I stated an ENVIRONMENT FACT from memory and the builder had to correct me |
| 07-27 05:05 | a FRESH WORKTREE has no `node_modules`, so the first measurement is garbage |
| 07-27 16:47 | a builder's log contains every document it was told to read — grepping it for doctrine finds your own brief |
| 07-28 17:0x | the flake that unblocked main was an ENVIRONMENT DIFFERENCE, not timing |
| 07-26 13:20 | codex round-trips are cheap — use them for the fix loop, not just the build |
| 07-26 05:35 | pick the second builder by CONFLICT SURFACE, not by queue order |

---

## 10. DESTRUCTION AND MERGE SAFETY — every one of these cost real time

**The rule.** Never destroy a recovery point. Branches are never deleted — park them
`finished/` (merged) · `retired/` (never landed) · `reverted/` · `blocked/`. Never rewrite
history. Never `git worktree remove --force`. **Never search for a process you intend to
kill.** Resolve the pid through `/proc/<pid>/cwd`, because argv contains INSTRUCTIONS,
including what the agent was told not to do. Guards go first or they are not guards
(validate-late/act-early has bitten three times).

| date | instance |
|---|---|
| 07-25 21:03 | I killed a running smoke on a partial reading and destroyed the evidence |
| 07-26 21:40 | a union merge without the BASE cannot tell "we added" from "they deleted" — it resurrected a deleted test |
| 07-27 02:45 | a generated artifact got COMMITTED because the ignore pattern named an instance |
| 07-27 10:27 | arming a replacement monitor must STOP its predecessor, in the same action |
| 07-28 | the record became a byproduct, and validate-late bit twice more |
| 07-28 07:45 | the hard blocker was the length of a name I chose |
| 07-28 19:15 | a negative control with side effects cut a worktree and launched an agent (see family 2) |
| — | `land.sh` merged into the wrong branch because I left the checkout off main AFTER being warned |
| 07-28 23:0x | dispatch's record commit named only the brief; the staged task-folder move stayed uncommitted and the next merge tripped over it — now a pathspec commit of the whole record, always on main |
| 07-29 02:4x | the agent-sdk import leaked 131×200MB per gate run; disk hit 100% TWICE before any lens showed it (#244) |
| 07-29 06:3x | a `;`-separated merge ran in MAIN after its worktree-add guard failed (`worktree add main` refuses when main is checked out — needed `--detach`): #238 merged into main ungated, caught in seconds, `git reset --keep` restored. Same genus as the wrapper-exit landing: a compound command whose later step ACTS while an earlier failure is invisible. A destructive step never follows `;` — every link that precedes an acting git command must be `&&`, and the acting step belongs in its OWN command once the guards are seen to pass |

**The sprawl corollary (user directive, 07-29).** The filesystem is fleet
infrastructure and gets a standing instrument: fleet-watch's SPRAWL arm (floor <10G,
fill >600MB/cycle, sustained >2G across a 5m window, entries >300/cycle, 5m throttle) plus the heartbeat that `dispatch.sh`
requires before any launch — a builder never runs unwatched. The sentinel ANALYZES and
never deletes: on a breach it names the top growers; the responder kills the growth
SOURCE, and deletion is reserved for patterns the fleet provably owns. An unknown file
may be another project. A wrong sweep is worse than a full disk, because a full disk
recovers.

---

## 11. THE GATE IS A SIEVE, NOT AN ITERATION MECHANISM (user correction)

**The rule.** Iteration does not need the gate. **Only LANDING does.** The agent's inner
loop is DRIVING the real app; the gate is the conductor's outer sieve. Fusing them is the
most expensive mistake available, and it is invisible while it happens, because everything
still looks rigorous. (Full statement: RULE ZERO in the skill.)

**A green gate is not a claim about what the user feels.** It went green twice on a change
that made the app unusable. Contracts earn their keep on properties a human CANNOT see. For
felt properties the value is attribution, not detection — so **verify by DRIVING the real
user path.**

**The user's veto is a gate the harness cannot replace.**

| date | instance |
|---|---|
| 07-26 06:25 | landing on a red gate, honestly |
| 07-26 18:25 | the user's veto is a gate the harness cannot replace |
| 07-27 00:40 | the gate is a SIEVE, not an ITERATION MECHANISM (user correction) |
| 07-27 04:30 | a queued HOOK gate is still a gate — CORRECTED 05:10: I had cited a RETIRED rule |
| 07-27 04:40 | a gate blocker OUTRANKS a solo slot, because the solo task lands through the gate |
| 07-27 18:15 | the gate went green twice on a change that made the app unusable |

---

## 12. PRIORITY AND PROVENANCE — whose call is it

**The rule.** **Never silently rank one user-directed item above another.** Surface the
ordering. Provenance decides main, not quality: conductor-invented experiments stay on
`experiment/*` branches for the user to adopt. **A structural fact is not a problem.** Make
the change carry the burden of proof, and name predictions BEFORE implementing
(cost/benefit becomes arguable once someone has a diff). Escalate only when the call is
genuinely the user's: naming, scope, feel, publish consent.

**An instruction is an assertion.** Run it, from the directory the reader will run it from,
before handing it over. Including the ones too simple to fail.

| date | instance |
|---|---|
| 07-26 00:20 | I ranked my own work above a user-directed task, SILENTLY |
| 07-26 00:20 | the mechanism/vocabulary split, for taste-dependent work |
| 07-26 05:35 | an instrument nobody can find is not tooling (user correction) |
| 07-28 | the burden-of-proof rule paid for itself in one night |
| 07-28 06:20 | two lessons from a red main, and why I did NOT invent a feature |
| 07-28 09:05 | I handed the user a command I had never run (#195) |
| #169 | declined on a component budget; the user's driving overturned it |

---

## 13. RECORDS — capture is not the same as operative

**The rule.** **ONE live copy, in the repo the work happens in.** Two copies diverge, and a
reader cannot tell which is current. A record that needs a SECOND STEP eventually does not
happen — make it a BYPRODUCT (`dispatch.sh` refuses to launch without committing the record
first).

**A stale instruction in an automated prompt does not become correct by repeating.** Check
any rule you are about to cite by name against the skill before acting on it. I cited a
retired rule with full confidence once (07-27 04:30).

**Appending here CAPTURES a lesson. Promoting it into the skill makes it OPERATIVE.**

| date | instance |
|---|---|
| 07-25 19:20 | a record of a loop is not the loop |
| 07-26 21:40 | MIGRATED — the ibr `Skills/Orchestration Lessons.md` entries that lived only there; that file is SUPERSEDED |
| 07-28 | the record became a byproduct |
| 07-28 19:25 | `orphaned/` → `retired/`; the negative-space rule promoted into the skill |
| — | the ledger migration carried each task's subject and dropped the rest; verifying a script RAN is not verifying its OUTPUT |
| 07-28 23:5x | the parallel CLI task list was retired and drained; `.invar/tasks/` is the ONE live task record (a note task marks the supersession) |

---

## 14. CRAFT — rules that are specific rather than general, and still load-bearing

**Contracts.** Separate CONFIGURED duration inputs from MEASURED duration verdicts (#155).
The glide cap, easing window, and maximum animation delta still derive row-count BOUNDS —
that is legitimate. What is forbidden is a blocking verdict read off a clock. Frame ordering
retires clock authority for verdicts, not for configuration. **A threshold I have to invent
is one I will get wrong.** Derive it, or make the contract a count.

**Zero-margin bounds are an unstated tolerance, not a flake.** #144 (23 of 24 frames), #149
(two bounds ignoring real scheduling), #165 (9 rows against 8), #193 (995 against 1000).
Before diagnosing a miss, establish the MARGIN.

**Smoke authoring.** Chained steps carry state forward. Compute cursor math from the ACTUAL
carried state, not from the step's assumed starting point (07-23: a wrap smoke assumed
index 0 while the prior step had left it at 20). Full list in the archive under
`## Smoke authoring`.

**Building new modules.** **Mirror an existing module 1:1.** It is the cheapest path to a
correct new one. The agent-harness module mirrored `terminal/` exactly: backend seam
(interface) + mock double + reactive single-source. Full list in the archive under
`## Building new modules`.

**Modularity.** Draw the seam at the shared GENERATOR. Reject both duplication AND
over-unification. The tell for a bad seam is a consumer suppressing a core behaviour.
Addendum from #114 Wave B: a rule that exists only implicitly (a hand-written action-name
list) dies in the generalisation that removes the list — write the invariant BEFORE
extracting the mechanism that silently enforces it.

**Search for the CONCEPT, not a guessed spelling** (07-26 01:25). I told the user no
keyboard acceleration existed; it did, as `movementRun`/`movementAcceleration` feeding
`ScrollPhysics.Class.keyAcceleration`, with an invariant already recorded for it. A grep for
the word I expected found nothing, and I reported that as absence — family 2 wearing a
search's clothes.

**The invariant lattice reviews a design before the code exists** (07-25 20:20). I proposed
frame ORDERING with more confidence than it deserved. Stating it against the lattice exposed
the gap before any code was written. Use it as a design reviewer, not only as a record.

## 15. THE ANCHOR PROTOCOL — surviving compaction (user-directed 2026-07-29)

The conductor is an amnesiac: context compacts intermittently and everything not on
disk is gone. The user's framing, verbatim: "We are basically making amnesia context
based agent remember its identity and lessons over intermittent compactions of its
context." The protocol makes survival MECHANICAL, not remembered.

**Trigger — never from memory.** fleet-watch fires a `CHECKPOINT:` event at
CHECKPOINT_PCT (default 85) of the compaction gauge — roughly 15% of runway left —
once per crossing, even when the fleet is quiet. Every event batch also carries a
`CTX:` speedometer line, so the gauge is seen at every gate. The gauge itself is
`~/dev/ibr/scripts/context-usage.sh` (mechanical, reads the live session jsonl).

**On CHECKPOINT (or whenever COMPACT_PCT ≥ 85 is seen): stop starting new work and
run these five steps, in order, each ending in a commit:**

1. **ANCHOR** — write/replace the RESUME ANCHOR in `project.briefing.md`: lanes with
   verdict state, queue with contracts, laws delta since the last anchor, watcher
   re-arm lines (Monitor command + cron spec verbatim). The anchor is STATE — it may
   be pruned when stale (user-approved).
2. **LESSON SWEEP** — split what the session learned by DURABILITY CLASS:
   - instance lessons (this bug, this task) → task records / the census; they are
     already home.
   - fundamental lessons (generator-level, would recur in any project) → THIS FILE as
     a numbered family, and the conductor's auto-memory if global.
   The test: would the lesson still be true if every current task were deleted? Then
   it is doctrine, not an incident.
3. **MECHANICS HARDENING** — any ritual performed by hand twice or more this session
   becomes a script WITH A SELF-TEST before compact (the verdict-extraction, steer,
   land, archive-repair scripts were all born this way). A manual ritual dies at
   compaction; a self-tested script survives any number of them.
4. **WATCHERS** — verify the anchor names the exact Monitor command and cron spec so
   the next incarnation re-arms in one action each.
5. **CLEAN TREES** — `git status` in both repos must be clean; uncommitted work is
   the one thing no protocol can resurrect.

**The one-line rule: if it must survive the session it goes to disk; if it must
survive the project it goes to doctrine; if it must run without being remembered it
becomes a self-tested script.**

## Historical arc — the founding runs (full accounts in the archive)

`Part 1`–`Part 11` cover 2026-07-23→24: the first conductor runs, the Invar UI batch, the
tsgo swap, the agent-harness experiment, the provider layer, and the review phase. Their
durable output is already distilled above. Two framings are worth keeping verbatim here,
because everything else rests on them:

- **Part 3b — delegation is cold-start-clone orientation + task delta.** The strongest
  formulation of what a brief has to contain.
- **Part 5 — the invariants are the artifact; the app is an expression of them.** The
  reason contracts are written as counts and impossibilities rather than as thresholds.

`Part 9` (a false invariant from a flawed verification method) is the ancestor of family 3,
and `Part 2` (antipatterns and traps) is the ancestor of families 1 and 10.

## Live cron prompts

**NOT here.** Their verbatim copies live in the skill (`## Live cron prompts`). Crons are
session-only and die on restart; the words are the durable artifact.
