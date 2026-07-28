# TASK — find what in the statics anchor migration made the app unusable

Work ONLY in `/tmp/conductor-staticscpu` (branch `diagnose-statics-cpu`, cut off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/statics-cpu-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

**Do not fix anything until you can reproduce it.** The deliverable of round 1 is a
REPRODUCTION plus a MECHANISM, not a patch.

## What happened

The ivue statics anchor migration landed as `eb7460f` (#125) plus `6e424e5` (#130) and made
the app **unusable for the user within ~2 hours**. Both are REVERTED on main (`063e3ab`);
`src/` is byte-identical to the known-good `e9119c2`. The work is preserved:

- branch `refactor-ivue-statics-221` @ `5f22cd8` — the full migration, still intact
- tags `reverted/statics-anchor-2.2.1` (#125), `reverted/statics-discovery-test` (#130)
- worktree `/tmp/conductor-statics221` has it checked out with ivue 2.2.1 installed and working

**The user's symptom, measured:** two Invar instances in `/home/parallels/dev/tui-editor`
burning **52% CPU at 45s uptime and 65% at 4:57 uptime**, while a 2-day-old instance running
pre-migration code sat at **0.8%**. Everything laggy, not just one file. After the revert and a
restart: **10.6%**.

**The CPU rose with uptime.** That is the single most diagnostic fact available. A fixed
per-operation cost does not grow; accumulation does.

## What is already ruled OUT — do not re-derive these

All three were measured, not reasoned:

1. **Two-receiver cache miss.** Hypothesis: the app reads through `Class` = `Reactive($Class)`
   while the test read through `$Class`, so per-receiver caching missed. **REFUTED** —
   `Reactive()` is in-place, `Class === $Class` is `true`, the cache hits, zero recomputes,
   1,000,000 reads in 2.3 ms.
2. **Read cost as the cause.** `Static()`'s guarded getter IS 3.8× slower than the old
   self-replacing property (**2.56 ns vs 0.67 ns**, 20M reads each) — real, and worth keeping in
   mind, but you would need ~200 million reads/second to reach 50% CPU. Contributor at most.
3. **Construction cost.** 6.0 → 12.3 ns/instance across 45 constructed classes at 59 sites,
   none syntactically in a loop. Orders of magnitude short.

## The invalid test — do not repeat it

I booted the bad code with `bun run src/main.ts > log 2>&1 < /dev/null` and measured 1–2% CPU,
falling. **That result is meaningless**: no PTY, so the render loop that is presumably the hot
path may not run at all. An instrument that cannot reproduce the condition reports green for
free.

**Your reproduction MUST use a real PTY** (`PtyTestDriver` / the harness / `bun run drive`), and
must sample CPU over **at least 5 minutes of idle**, printing `elapsed`, `cpu-time`, `%cpu` per
sample. Acceptance for round 1 is a table showing %cpu RISING on `5f22cd8` and FLAT on
`063e3ab`, same harness, same duration, interleaved to cancel ambient load. If you cannot make
it rise, say so plainly — that is a finding, and it means the trigger needs the user's real
conditions (their workspace, LSP, git watcher, open files) which the harness lacks.

## Leading hypothesis — test it, do not assume it

**Effect/listener accumulation via broken teardown.** `Static()` returns a NEW SUBCLASS, so the
migration inserted an extra prototype generation into 143 classes. `$stopEffects()` and the
ivue effect machinery resolve per-receiver. If disposal stops matching the receiver that
registered, effects are never released: every frame runs more of them, and CPU rises with
uptime — which is the observed shape.

Concrete probes, cheapest first:
- does `$stopEffects()` on a `Reactive(Static($X))` class actually clear its effects? Count
  registered effects before/after. Compare against `Reactive($X)`.
- instrument effect/listener/watcher counts in a driven idle app and watch them over 5 minutes
  on both commits. A rising count IS the answer.
- if teardown is fine, look for a repeating invalidation: does a `$`-cache write inside a
  reactive tracking context mark its own dependency dirty?

## Bisect, do not reason

The migration is mechanically separable into independent groups. If the hypothesis above does
not land quickly, bisect rather than theorise:
- the **9** `Reactive`-published namespaces (`Settings`, `SettingsPanel`, `LanguageClient`,
  `HoverCard`, `ShortcutHelp`, `AgentSpinner`, `MarkdownPreview`, `MarkdownDocument`,
  `DiffView`) — these are the only ones combining `Static` with instances and reactivity;
- the **22** that already published `Static($X)` at the `Class` slot (wrapper only moved up a
  line — semantically closest to a no-op, so LEAST suspect);
- the **5** bare ones;
- the **55 deleted hand-rolled cache blocks** across 37 files, which is a separate axis from
  the anchor move and could matter on its own.

Start by re-applying ONLY group 1 (the 9) on top of `063e3ab` and driving. My prior, stated so
you can disconfirm it: the 9 are the likely culprits because they are where `Static` meets
`Reactive` meets instances.

## Report

- the reproduction table (both commits, ≥5 min idle, real PTY, interleaved);
- the mechanism, with the measurement that proves it — not a structural story;
- which group the bisect implicates;
- whether the migration is salvageable and at what cost, or should stay reverted.

Do NOT re-land the migration in this task. Diagnosis only.

## Why the gate missed it

Both merges passed a full gate ALL-PASS with 69 OK steps and `idle-quiescence violations=0`.
Something the user notices in seconds went unmeasured for two gate runs. Whatever you find,
name the contract that SHOULD have caught it and what it would have to assert — a per-frame or
per-idle CPU/effect-count budget in the real-PTY harness, most likely. That contract is worth
more than the migration.

Full descriptive identifier names, 80 columns. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.

---

# ADDENDUM 2026-07-27 18:30 UTC — the user reproduced it under CONTROLLED conditions

The migration was re-landed at the user's request and reverted again (main is now `af40ac9`).
This time the experiment was clean: **no gates running, loadavg 0.74, one fresh instance.**

| instance | uptime | CPU time | %CPU | RSS |
|---|---|---|---:|---:|
| fresh, ON the migration | 1:13 | 50 s | **69.4%** | **493 MB** |
| 2-day-old, pre-migration, same machine same moment | 1d23h | 25 m | 0.8% | 216 MB |

**#125 is the cause. That is settled — stop trying to establish it and go find the mechanism.**

## Two NEW constraints from the thread breakdown

- **The MAIN thread is what spins**: 61.6% on `tid == pid`, while `JITWorker` and `HeapHelper`
  sit at 0.9% each. So it is application code in the event loop — NOT GC pressure, NOT JIT churn.
- **Memory is 2.3x higher.** A slower getter does not allocate. Something is RETAINING or
  re-allocating. Combined with the rise over uptime, that is an accumulation signature.

Snapshot: `/tmp/evidence-ps-125.txt`.

## FOUR hypotheses now dead — do not spend time on any of them

1. **Two-receiver cache miss via `Reactive($Class)`** — `Reactive()` is in-place,
   `Class === $Class`, cache hits, 0 recomputes, 1M reads in 2.3 ms.
2. **Read cost** — real at **3.8x** (2.56 ns vs 0.67 ns, 20M reads each) but needs ~200M
   reads/sec to reach 50% CPU. Contributor at most.
3. **Construction cost** — 6.0 -> 12.3 ns, 45 constructed classes, 59 non-loop sites.
4. **Manual `Object.freeze` / frozen memo tables** — the migration adds ZERO freeze calls (14 in
   both trees, no freeze lines in the diff), and the tables are `Map`/`WeakMap` whose contents
   live in internal slots, so freezing cannot block `.set()` anyway.

## A real semantic change that turned out NOT to bite — recorded so you don't rediscover it

`Static()`'s per-receiver cache genuinely differs from the old self-replacing pattern:

```
reading $MEMO from parent + child + grandchild, 3 rounds:
  Static() anchor        computes=3  distinct tables=3   parent write visible to child: false
  self-replacing (OLD)   computes=1  distinct tables=1   parent write visible to child: true
```

The old `Object.defineProperty(this, …)` installed ONE table on the first-read class and every
subclass inherited it; `Static()` gives each receiver its own. **But it cannot bite in
production**: none of the nine memo owners (`$wrapMemo` EditorWrap, `$rangesByDocument`
CodeFolding, `$snapshotByDocument` BracketMatch, `$entryProjectionCache`
AgentTranscriptProjection, `$overviewKindsByAlignment` DiffView, `$boundariesMemo`/`$clustersMemo`/
`$lineWidthMemo`/`$displayPrefixMemo` EditorCoordinates) is subclassed in production. The only
production `extends` is `$Editor extends ReadOnlyTextBuffer.$Class`, and `ReadOnlyTextBuffer` owns
no memo. Worth keeping as a latent hazard; it is not this bug.

## TOP-RANKED CANDIDATE — the thing the harness lacks

Your own comparison found the migration **numerically identical** to the revert at three minutes
(1.82 CPU-seconds each, ~0.7%). That negative result is a finding: **the trigger needs the user's
real conditions.** What they have and a bare harness boot does not: a live **LSP / TypeScript
server**, a **git watcher** on a real repo, a populated workspace, live panes.

`LanguageClient` and `JsonRpc` are both in the 9 classes where `Static` meets `Reactive` meets
instances. A per-message path on a chattering language server would produce exactly the observed
shape: main-thread CPU, growing RSS, worsening with uptime, invisible without a workspace.

**Reproduce with the LSP and git watcher ACTIVE on a real repo, not a bare boot.** If that
reproduces, bisect from there. If it does not, add the agent pane and terminal.

## Then bisect — do not reason further

Four axes, independently applicable on top of `af40ac9`:
1. the **9** Reactive-published namespaces — `LanguageClient` and `JsonRpc` are here, start here;
2. the **22** that already had `Static($X)` at the `Class` slot (wrapper moved one line — least
   suspect);
3. the **5** bare ones;
4. separately, the **55 deleted hand-rolled cache blocks** across 37 files.

Four structural hypotheses have now died by measurement. Bisect empirically; do not add a fifth.
