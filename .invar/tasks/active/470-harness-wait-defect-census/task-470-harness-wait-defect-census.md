# Task 470 — harness wait-defect census and repair

Priority: verification-integrity
State: ACTIVE — BLOCKED ON #471 (graph completeness precedes the migration)
Engine: claude
Environment: any
Model: fable-5
Effort: high

## Why this exists

The user asked, verbatim (2026-08-02): "scout the app harness smokes/tests for
where we can implement the same to reduce tests,smokes flakiness and give me a
report before we do the fixes".

The report was delivered and is preserved beside this file as
`census-470-harness-wait-defect-census.md`. It was written to `tmp/`, which is
gitignored; it is copied here because 1600 lines of analysis one `git clean`
from deletion is not a record.

**The user has NOT chosen what to fix. Nothing in here is authorized work
yet.** A recommended order was offered and is repeated below.

## The generator: the pre-satisfied wait

A wait whose condition is ALREADY TRUE when issued returns whatever frame is
current instead of waiting for the change. It goes green most of the time,
which is why it survived. Under contention the stale frame is staler, so it
reads as a load problem and the investigation stops. This one defect explains
the #464 gate red (fixed, 97c89a44) and the undiagnosed drag red.

The most severe form: a pre-satisfied POSITIVE CONTROL. A control that cannot
fail makes every claim it guards unfalsifiable. Five are known so far.

## The single biggest finding

`renderQuiescent` is initialized false at src/modules/system/StatusChannel.ts:33,
set true at :97, and NEVER RESET TO FALSE ANYWHERE. Verified directly. After
the first completed frame it is permanently true, so `scripts/tui-harness.sh`'s
`settle` is a no-op and every `renderQuiescent === true` wait is pre-satisfied.
The ~258 sleeps in the shell suite are the SYMPTOM: people papered over a
primitive that never worked.

## Ordering decided by the user (2026-08-02): #471 FIRST

The graph-completeness work (task 471) precedes this task, so waits migrate
once, onto a complete graph — not twice. The renderQuiescent fix and the
PtyTestDriver guard do not depend on #471 and could land alongside it.

## Recommended order (offered, not approved)

1. Fix `renderQuiescent` — reset to false when a frame is requested. Restores
   a primitive 236 call sites already use; precondition for retiring sleeps.
2. `PtyTestDriver.ts:412-439` — add the pre-satisfaction guard its own sibling
   already has at `:277-282`. The only fix that stops class 1 recurring.
3. `HarnessSmoke.ts:313-316` — the surviving half of #464, in a SHARED helper
   on the contention tier.
4. Finish the census (see coverage below), contention tier first.
5. The individual class-1 sites, unfalsifiable positive controls first.

## Coverage — PARTIAL, state this honestly to anyone who picks it up

Audited: 47 of 77 files (batch 1: 43 shared/contention/agent/terminal/shell;
batch 2: plugin-manifest pair; batch 3: panel-split, layout, activitybar,
tree-scroll). Roughly 30 files remain, named in the report's coverage section:
the overlay/markdown/tasks set, the editor/popup/settings set, and ~24 smaller
harnesses. The class counts are a FLOOR, not a total.

Running counts: class 1 pre-satisfied 82 · class 2 proxy 40 · class 3
sleep-as-sync ~261 (needs triage, not 261 defects) · class 4 stale needle 2 ·
class 5 blink 13 · class 6 unsynchronized read 15.

## A limitation of the graph instrument, found by this census

Contributor state has NO graph path. File-tree rows come from
`FileTreeContributor.ts:138` and git counts from `GitPlugin.ts:460`; neither is
in the `statusProjectionPorts` object armed as graph roots at
`Bootstrap.ts:1442`. Waits on tree rows and git counts therefore cannot be
migrated to `awaitValue` today. Either widen the graph roots to include
contributors, or leave those waits on the screen and fix only their
pre-satisfaction. This is a real gap in what #469 shipped.

## Verification when the work is eventually done

Both arms per fix: the migrated wait must still FAIL when the app genuinely
does not reach the state (plant it), and PASS when it does. A pre-satisfied
wait replaced by another pre-satisfied wait is invisible to a green suite.

## User direction, verbatim (2026-08-02, after batch 3)

"yes, everything should be in the graph, and even things like
workspaceSet.active.editor.blabla, should be converted to shortcuts like
workspaceSet.activeEditor, to reduce the chains between things"

This RESOLVES the contributor-gap question in principle: the graph must reach
everything, and the chain-shortening happens as real getters. Design
discussion in the session transcript; implementation not yet started.
