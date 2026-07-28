# Task ledger — the durable, detailed record

**This file is the authority.** Before this existed, the complete task record lived in the conductor's
harness task list — session state that dies with the session — while `project.tasks.md` was a
hand-maintained mirror that had drifted 17 tasks behind (it stops at #189; the live list ran to #206).
The detailed record was ephemeral and the durable record was partial. That is the same defect class this
project keeps finding in its own instruments: an artifact that looks authoritative and is not.

## Conventions

- **Numbers are permanent.** A number is never reused, even if the task is abandoned. Branches carry the
  number (`fleet/<n>-<slug>`) and branches are never deleted here, so a number must resolve forever.
- **Create the task before dispatching**, so the number is backed rather than guessed. This was violated
  once (#206's branch is `fleet/205-flake-population`, labelled before its task existed) and both
  records carry a note.
- **Status:** `OPEN` · `IN FLIGHT <branch>` · `DONE <commit>` · `DECLINED <reason>` · `SUPERSEDED BY #n`.
- **Every entry states the EVIDENCE**, not just the intent: what was measured, what refuted what, what
  is still hypothesis. A task that records only a conclusion is unusable to whoever picks it up.
- Completed tasks keep one line plus their landing commit; the full spec is recoverable from the commit
  message and `agent-dispatches/<n>-<slug>/`.

## Where the other records live

| Record | Holds | Authority |
| --- | --- | --- |
| `project.ledger.md` (this file) | full spec per open task | **yes** |
| `project.tasks.md` | older curated narrative | superseded for tracking |
| `agent-dispatches/<n>-<slug>/brief.md` | the brief a builder received | yes, for what was asked |
| `project.conductor.md` | orchestration lessons | yes, for process |
| `project.handoff.md` | resume anchor | yes, for "start here" |
| `project.decisions.md` | settled design calls + why | yes, for rationale |

---

# OPEN — user-directed

## #204 — `drive` requires every action to repaint, and targets cells by number
**IN FLIGHT** `fleet/204-drive-tool`. User-sequenced: "first the drive script should be solid so recipes
stand on solid foundations."

Two defects in the repo's exploratory instrument.

1. `scripts/harness/Drive.ts:421-422` runs `await driver.awaitScreenChange(...)` unconditionally after
   every `--key`/`--wheel`/`--click`. An action that legitimately paints nothing hangs to timeout.
   Reproduced twice: `bun run drive --key Control+k --key '['` dies on the frame-silent chord prefix,
   while the same chord succeeds as one sequence through the PTY latency instrument — so the app is
   fine and the tool's expectation is wrong. **Eighth spelling** of the dominant defect class.
   Repair is NOT "tolerate N silent actions": a step must STATE its completion condition. Frame-silent
   steps are enumerable (chord prefixes, no-ops at a clamp, keys a focus owner swallows).
2. Targets are fixed cells (`--click 45,7` encodes "the fold gutter of the first top-level region").
   #143 was this at scale. A coordinate one column off does not fail — it clicks the wrong thing and
   exits 0. Needs role/text-resolved targeting.

**Proof required:** chord case exits 0 AND a positive control shows a stated-but-never-arriving
condition still fails; role targeting hits the same element today AND after a simulated layout shift.
**Out of scope:** the recipe corpus (declined), writing recipes.

## #205 — nothing gates launch time or memory
**OPEN.** Found answering the user's "is it gated properly too?"

Gated: `CodeFolding.test.ts:116` asserts `[30, 30]` document reads across `[2_000, 1_000_000]` inside
`bun test` (blocking, `merge-gate.sh:696`), with a positive control reading `[4000, 2000000]`.
NOT gated: first paint and peak RSS. The only latency step (`input-byte-flush-gate.ts`,
`merge-gate.sh:890`) compares keystroke p50/p95 to a reviewed baseline. So the numbers that captured the
user's regression have no contract: first paint 634 → 2,417 ms, RSS 704 → ~1,300 MB at 1M lines.

The `[30,30]` contract guards THAT mechanism, not the class.

**Prefer peak RSS over milliseconds.** 665 MB at 1M is a structural fact about how much the editor
materialises, near-independent of CPU; first-paint ms is a stopwatch that drifts with hardware. Derive
the ceiling from measured headroom and record the derivation in `project.performance-baselines.md`, so
raising it is a reviewed act. **Mandatory positive control:** an RSS check can only fail toward pass if
measurement returns zero or the app fails to launch — plant an over-ceiling allocation, require RED.
Sequence after #204; it lengthens every gate.

## #208 — an expanded commit cannot be folded back
**IN FLIGHT** `fleet/208-commit-collapse`. User-reported: "you can expand a commit but you cannot fold
it back."

Wiring gap, not a missing feature. `CommitExpansion.toggle()` (`CommitExpansion.ts:53`) correctly calls
`collapse()` when `isExpanded()`. But `GitWorkspace.ts:501` and `:522` call `expansion.expand(...)`
directly, and the ONLY callers of `toggle` in the tree are `CommitExpansion.test.ts:100-106`, which
toggles three times and passes. The model can collapse; the tests prove the model can collapse; the UI
never asks it to. **That is why the gate stayed green.**

Do not blindly swap both sites: `:522` awaits expansion then reads `entries.value` for the first changed
file, so it likely wants expansion as a PRECONDITION. Per-site decision with justification. Also asked:
find a SECOND capability with tests but no production caller.

## #202 — tab re-activation re-reads the whole file from disk
**OPEN.** User-diagnosed: "switching a tab to it, there is slight delay because i guess it scans the
whole file again."

Correct, and the code says so. `Editor.ts:352-355`: a clean background tab is dehydrated and its
document RELEASED; re-activation recreates it. `Editor.ts:380` — "the file was just reloaded into a
fresh document." So re-activating runs `openFile` → `loadFromFile`, a full re-read, and it invalidates
the wrap index for free because `EditorWrap.$wrapIndexByDocument` is a WeakMap keyed on the document
INSTANCE.

NOT the cause: switching does not itself invalidate the wrap index (the empty-fold case uses a shared
singleton so identity cannot false-miss).

**Falsifiable check first:** dirty tabs are never dehydrated, so type one character, switch away, switch
back — must be instant. If that asymmetry is absent, the diagnosis is wrong.

Repairs ranked: (1) keep N most-recent documents hydrated — alternating between two files becomes free;
(2) persist derived geometry across dehydration keyed on path+size+mtime; (3) streaming/lazy line index
so load is O(viewport) — the user's own earlier suggestion, and the only one that also touches launch
(~621 ms) and RSS (~680 MB) at 1M. Contract on COUNTS: full-document reads per switch cycle must not
grow with file size.

## #199 — Find reveal paints the active target line blank at 500k
**OPEN.** User-reported during scale testing. Not yet diagnosed.

---

# OPEN — verification integrity (highest leverage)

## #90 — harness diagnostic channels need a provenance guard
**OPEN. CONFIRMED WITH A MECHANISM** 2026-07-28 by #205's bycatch; was a hypothesis.

`artifacts/tui.log` is SHARED. Parallel copies of the scrollbars smoke read each other's latest
`editor-scrollbar-v` lines, mixing wrap-off total rows (`502`) with wrap-on (`504`). Consequence is not
a flaky assertion — a same-smoke pool is an INVALID POPULATION, so any A/B built that way measures
cross-talk. #205 hit this building a scrollbars population and correctly refused to diagnose from it.

Hidden because only scrollbars enables `TUI_DEBUG_BARS`, so the gate's DIVERSE pool never has two
readers at once. Needs two instances of the same debug-bar smoke.

Needs: (1) per-run diagnostic isolation — instance-scoped log path, same treatment the smokes already
give `HOME`; (2) the PROVENANCE GUARD this task opened for — stamp each line with instance identity,
reject foreign lines, because a stale line from a previous run in the same worktree can still satisfy
an assertion; (3) a positive control planting a foreign line.

**Asymmetry:** the collision produces WRONG NUMBERS; stale-line acceptance produces FALSE GREENS. Only
the first has been observed.

## #177 — one retry per gate, never the same smoke twice
**OPEN, partially addressed.** #205 repaired two of the population; the retry TREND is now persisted to
`.perf-history/gate-retries.ndjson` (`5a638f2`), which was the missing prerequisite — previously the
tally was printed but never recorded, so "~27% of 121 runs retry-clean" and "1 of 11" both needed
hand-run censuses from logs `/tmp` reclaims.

**User asked whether to ban retries outright.** Recommended shape, not yet implemented: ratchet rather
than ban. Floor = best observed count, declared-debt escape like the coverage ratchet, timeout-widening
explicitly forbidden as the resolution. Do NOT set the floor from one sample — the first zero-retry gate
was a single observation; needs 3–5 consecutive clean runs or the first ambient blip reds the gate and
the rule gets unwound.

## #179 — the gate reports its own numbers and never compares them to itself
**OPEN.** Three regressions hid in plain sight. Partially addressed by the retry history; the general
form (compare every reported number against its own trailing history) is open.

## #183 — the quiet lock degrades after 120s and runs anyway
**OPEN.** Concurrent measurement is NOT safe, and the conductor assumed it was. A degraded lock still
reports a number, so a contended measurement looks valid.

## #180 — CRITICAL: no smoke can run on macOS
**OPEN.** The harness PTY is FFI-blocked, so the gate has never run on the host machine.

## #181 — `TerminalFactory`'s platform choice has no test
**OPEN.** The darwin arm never executes on Linux. Pairs with #180.

## #182 — `BunTerminalBackend.test`'s `collectUntil` resolves with partial text on timeout
**OPEN.** A false-success wait — the inverse of the dominant class, and the more dangerous direction.

## #105 — a smoke the gate never runs cannot report that it has rotted
**OPEN.** ~20 `*_full_tmux_smoke` registrations the gate skips unless `INVAR_FULL_TMUX=1`. One rotted
for a day asserting `▁`, the exact glyph two invariant records name in Impossible-if-true clauses.
Three mechanisms in cost order: retire ported duplicates; make the skip a declared debt rather than a
count; a report-only tell for smokes asserting a forbidden token.

## #190 — a smoke may not enter the concurrent pool by default
**OPEN.** Pool membership must be earned and declared. #200 DECLINED to implement it: its measurement
did not prove the two candidate smokes must be serial, and a fatal counterexample (n=1 scrollbars
timeout with no pool siblings) refuted pool concurrency as the shared cause. Reopen only with new
evidence.

## #75 — in-gate app crash (exit 1) with no diagnosable reason
**OPEN.** Instrument first, then diagnose.

---

# OPEN — known flakes with evidence

## #167 — audio-narration times out in the parallel pool after #141 closed it
**OPEN.** Plus move-line, same signature.

## #164 — panel-chrome expand-heading times out in the ASCII tier
**OPEN.** Pre-existing, reproduced on both populations.

## #176 — tabs harness passed only on retry on the #172 gate
**OPEN.**

## #124 — terminal-follow's Escape-cancellation intermittent is worsening
**OPEN.** Fails 3/3 on clean main.

## #109 — agent-permissions flakes INSIDE the serialized quiet tail
**OPEN.** Not a load flake — it fails where load is excluded by construction.

## #193 — 100k fold-dense contract travelled 995 rows once
**OPEN.** Against a 1,000-row shape requirement; single unexplained miss on a felt-invariant contract.

## #174 — markdown preview omitted a ragged table visible in source
**OPEN.** Hard failure, not timeout-class, so it does not retry. Two sightings.

## #173 — grid predicates assert contiguous strings that wrapping legitimately splits
**OPEN.**

## #198 — `smoke-selection-harness` has two pre-satisfied wheel predicates
**OPEN.** The waits pass without observing the wheel at all — the launder-a-no-op-into-a-green shape.

## #165 — glide-input-coalescing canary sits on a zero-margin boundary
**OPEN.** 9 rows against an 8-row budget.

## #166 — `measure-input-byte-flush` crashes at `LATENCY_SAMPLE_COUNT=1`
**OPEN.** Should report an unmeasurable run instead of crashing.

## #200 — input-byte p50 8–12 ms against a 4.928 ms reviewed baseline
**OPEN.** Warned in 11/11 gates, report-only so it never blocks. Same metric as #106, now 1.6–2.4× its
re-reviewed baseline. Quiet-locked with zero degraded entries, so contention is not the explanation —
but they were full-gate runs with a live pool, so measure standalone first. If it does not reproduce
standalone, the finding is that the gate's own pool inflates the metric it reports. Widening the FAIL
threshold is forbidden.

---

# OPEN — performance and behaviour

## #175 — attribute the ~300 ms boot and decide what is irreducible
**OPEN.** #205 would give this a contract to land against.

## #185 — gate 4m02s → 2-3m: behavioral-contracts is 62% of it
**OPEN.** Needs shared fixtures, not fewer assertions.

## #153 — horizontal fling 2.75× slower in overlays than the editor
**OPEN.** #50's one-profile fix never reached `ScrollableTextViewport`.

## #86 — wheel-to-first-visible-frame ~85 ms regardless of item count
**OPEN.** Decide whether that is the intended feel.

## #160 — context-menu wheel double-dispatch
**OPEN.** One physical wheel produces two impulses.

## #94 — popup Left/Right should fall through to caret movement
**OPEN.** When there is no drill target.

## #104 — DEFERRED: editor glide monotonicity
**OPEN, deferred.** Reversal check when convenient; velocity work only on trigger.

## #140 — real-terminal freeze capture
**OPEN.** The harness cannot see the user's multi-second stall.

## #154 — perf-baselines is soft
**OPEN.** Its two measurement failures and its leaked editor reach no verdict.

---

# OPEN — architecture and hygiene

## #114 — modularity umbrella
**OPEN.** LSP as provider, terminal as runtime, agents via tasks + MCP (not as a plugin). Gates #122.

## #122 — editor becomes the final contributor
**OPEN, blocked by #114.** Source-text view as default editor-column occupant; capstone extraction.

## #46 — TerminalObserver reverse presence
**OPEN.** Design doc exists, no branch cut; pairs with #114.

## #35 — structure navigator pane
**OPEN.** First new plugin citizen.

## #31 — getter census → scoped invalidation
**OPEN.** Post-campaign.

## #62 — parameter-count sweep
**OPEN.** >3 args → ports object, hot paths exempt, plus convention and checker rule.

## #59 — prettier on commit
**OPEN.** 80-char width, uniform indent, format gate, one-shot repo reformat.

## #136 — one shared scale-fixture generator with a cached corpus
**OPEN.** Stop re-rolling large files per instrument. Partly overtaken: `make-scale-workspace.ts` and
`make-nested-fold-fixture.ts` now exist, but there is no shared cache.

## #77 — close the coverage-ratchet's remaining holes
**OPEN.** Three, in cost order: vague records (require declared counts, verify them); padding within a
file (compare assertion TEXT sets, report-only first); semantic weakening (needs mutation testing,
scoped to invariant-annotated lines, run outside the gate).

## #107 / #108 — glyph decisions awaiting the user
**OPEN.** #107: `🔒`/`🖼` measure 2 cells, render 1 — swap the glyphs (cheap) or fix the width authority
(the real reduction; the growing exception list is the tell). #108: `⚙` has four owners and `.sh`/`.yaml`
are indistinguishable in the same column — both file families need new marks.

---

# LANDED TODAY (2026-07-28) — one line each

Main moved `a93b7e8` → `d3721b2` → `fb199cb`.

- **#186** `DONE` — 500k max-width rescan.
- **#196** `DONE` — flyweight edit path: 1 row write/keystroke, zero index allocations, size-independent.
- **#197** `DONE` — LSP size budget guards reads, at one seam ahead of `ensureStarted`.
- **#203** `DONE f73dc41` — folded editing scale-invariant; fold toggles patch instead of rebuilding
  (970k collapse 132 → 24 ms); flat-file regression fixed (first paint 2,417 → 645 ms, RSS 1,300 → 665
  MB) after the user caught it by driving.
- **#194** `DONE 42a3455` — reserved-chord fixture self-contained. Contradiction resolved: codex bundles
  its own ripgrep, which its spawned app inherits and the conductor's shell (function only) does not.
- **#205→#206** `DONE 55cacb8` — two flake classes: terminal-stage's single click was two PTY writes
  racing a mouse-up toggle; clipboard-frame-boundary waited on a transient first loop value. Bycatch
  became #90's mechanism.
- **#207** `DONE 111034d` — `start` forwards its path; Quick Open gains a bounded third fallback and
  publishes degraded/failed distinctly from empty.
- **#191, #192, #187, #188, #189** `DONE` — harness wait repairs.

Branches parked: `finished/203-fold-flyweight`, `finished/194-reserved-chord`,
`finished/197-lsp-request-guard`, `finished/205-flake-population`,
`finished/207-silent-input-dropping`.
