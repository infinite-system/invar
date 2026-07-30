/**
 * Restore the detail my own migration threw away.
 *
 * The conductor task list carries multi-paragraph descriptions for many tasks — mechanisms, measured
 * evidence, what refuted what, ranked repair options. `migrate-task-ledger.ts` tabled only the one-line
 * `subject` for each, so 61 task files landed at 12-13 lines apiece with a single line of content. The
 * detail was never lost to compaction; it was dropped in transfer, by me, in a script I wrote and did
 * not check the output of.
 *
 * That is the same defect as the coverage ratchet's "vague record" hole: an entry that satisfies a
 * structural check while carrying none of the information the check exists to preserve. A folder per
 * task looked like a ledger and held a stub.
 *
 * This writes the full description into each task file that has one. Tasks whose list entry genuinely
 * IS one line keep their single line and say so — the honest floor, not a hedge.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { execSync } from 'node:child_process';
const repositoryRoot = execSync('git rev-parse --show-toplevel', {
  encoding: 'utf8',
}).trim();
const tasksRoot = `${repositoryRoot}/.invar/tasks`;

/** Full detail, keyed by task number. Absent = the list entry is genuinely a single line. */
const DETAIL: Record<number, string> = {
  77: `The landed ratchet (\`scripts/check-coverage-ratchet.ts\`) gates DISCLOSURE of assertion loss, not
justification. Three known holes, in cost order.

1. **VAGUE RECORDS** (cheap, do first). An entry in \`coverage-deltas.md\` satisfies the check by naming
   the file path alone. Require it to state the new counts — \`path/to.test.ts — assertions: 6, waits: 10
   (was 7/10) — reason\` — and verify the declared numbers against the actual ones. The record then
   cannot be a shrug, it names the magnitude, and a stale record stops passing once the file changes.
2. **PADDING WITHIN A FILE** (cheapest exploit remaining). Delete one real assertion, add one trivial
   one, count unchanged, gate green. A pure count ratchet cannot see this. Partial mitigation: compare
   per-file assertion TEXT sets, not just counts, and REPORT replacements rather than failing —
   legitimate rewrites replace assertions constantly. Report-only first.
3. **SEMANTIC WEAKENING** (expensive, different instrument). \`expect(actual).toBe(1)\` becomes
   \`expect(true).toBe(true)\` and the count holds. Only mutation testing catches it: break a source
   invariant deliberately and require some assertion to fail. Scope narrowly — a handful of load-bearing
   modules, run OUTSIDE the merge gate, because a full mutation run is far too slow for a commit gate.
   The valuable form is targeted: for each invariant claiming an impossibility, mutate the line its
   annotation sits on and require a red.

Ordering: 1 is a small edit to an existing checker. 2 is report-only instrumentation. 3 is a genuine
project and should not start while user-requested UI work is unmerged.`,

  105: `\`scripts/smoke-gutter-diff.sh\` sat in the tree asserting the PRESENCE of \`▁\` as the deleted-line
hint — the exact glyph that both \`diff.invariants.md\` and \`workspace.invariants.md\` name in their
Impossible-if-true clauses. A sweep updated the harness twin and both records but not this file, and
nothing noticed for a day because the smoke is registered \`parallel_safe_full_tmux_smoke\`, which the
gate skips unless \`INVAR_FULL_TMUX=1\`.

The instance was fixed (verified by driving: ALL-PASS on \`▎\`, and it failed on \`▁\` beforehand, so the
assertion can still fail). The CLASS is open — about twenty more \`*_full_tmux_smoke\` registrations sit
in the same position.

**The reduction:** a smoke that never runs is not a contract. It is a file that LOOKS like a contract,
which is worse than no smoke at all, because the coverage count and the invariant's Verification line
both cite it. Three mechanisms in cost order:

1. **Retire the ported duplicates.** The PTY-harness port was completed and user-adopted. Where the
   harness version is a superset — the gutter-diff harness even carries a NEGATIVE assertion that \`▁\`
   is absent, which the shell one lacks — the shell smoke is dead weight. Retiring needs a
   coverage-ratchet declaration, and per repo rule the file is parked, not deleted.
2. **Make the skip consequential, not just counted.** The gate prints "\$FULL_TMUX_SKIPPED tmux audit
   smokes not run". A count is not a consequence. Require every registered smoke either to run in the
   default configuration or to appear in an explicit retired-pending-port list with a reason, so an
   unrun smoke is a declared debt rather than an invisible default.
3. **Cheap mechanical tell** (report-only first). No smoke may assert the PRESENCE of a token that an
   invariant record names in an Impossible-if-true clause. Extract quoted single-glyph literals from
   Impossible-if-true text, extract asserted-present literals from smokes, report the intersection.
   Needs a positive control — plant \`▁\` back and require the report to name it.

Separate and smaller: \`scripts/smoke-agent-search.sh:66\` hardcodes \`⌕\`. That glyph is current so it
passes today, but it is an appearance dependency of the class that re-broke twice during icon work.`,

  107: `Found by the width-agreement instrument (\`TextCoordinates.lineWidth\` from OpenTUI versus
\`@xterm/headless\` \`cell.getWidth()\`, with a \`漢\`→2 positive control).

The app measures \`🔒\` and \`🖼\` at TWO cells while the terminal renders them at ONE. Same defect class as
\`☰\` (U+2630), which was swapped for \`≡\` because OpenTUI measured two where the terminal rendered one and
the activity bar shifted a column — except here the disagreement runs the other way, so the app RESERVES
space the glyph does not occupy and rows drift in the opposite direction.

Both instances are enumerated in the checker, so a THIRD such glyph now fails the gate. That is the right
ratchet, but the two enumerated ones are still live: the file tree and the breadcrumb popup mis-measure
any row carrying them.

Two options, and the choice needs a judgement call:
- swap both glyphs for single-cell marks that agree (consistent with the \`☰\`→\`≡\` and \`⬢\`→\`⧫\`
  precedents, and with the rule that the vocabulary owns appearance);
- or fix the WIDTH AUTHORITY so OpenTUI matches the terminal for emoji-presentation code points.

The second is the real reduction; the first is the cheap mitigation. **The enumerated-exceptions list is
itself the tell:** a list that grows is a signal the authority is wrong, not that the glyphs are unlucky.`,

  108: `Found by the mark-ownership instrument. Completing the ownership table — under the rule *a mark may
be shared only by owners that mean the same thing* — exposed a worse collision than the two it was built
to adjudicate.

\`⚙\` has FOUR owners, and two can appear in the SAME column: \`.sh\` and \`.yaml\` file rows are
indistinguishable in the tree today. Unlike \`⑂\` (verdict: intended — both owners mean version control)
and \`●\` (verdict: failed, fixed by moving \`.js\`/\`.jsx\` to \`◉\`), this is a genuine ambiguity a user can
hit: two file types, same mark, side by side.

It was declared and dated rather than fixed, correctly — changing it moves the tree's appearance for
every user, which is the user's call, not a builder's.

Constraints on the replacements: unambiguously one cell; no thin internal detail that vanishes at
terminal size (that killed \`⊞\`); not in the Geometric Shapes block (largely EAW-Ambiguous); and not
colliding with the reserved-mark table or the activity row \`≡ ⑂ ⌕ ⚙ ⧫\`. The \`⚙\` slot presumably stays
with the Settings activity glyph, since that is the meaning users associate with it — so BOTH file
families move. Worth surfacing with a proposed pair rather than asking cold.`,

  90: `CONFIRMED WITH A MECHANISM by the flake investigation; previously a hypothesis.

\`artifacts/tui.log\` is SHARED. Parallel copies of the scrollbars smoke read each other's latest
\`editor-scrollbar-v\` lines, mixing wrap-off total rows (\`502\`) with wrap-on (\`504\`). The consequence is
not a flaky assertion — a same-smoke pool is an INVALID POPULATION, so any A/B built that way measures
cross-talk. The investigator hit this while building a scrollbars population and correctly refused to
diagnose from it.

Hidden because only scrollbars enables \`TUI_DEBUG_BARS\`, so the gate's DIVERSE pool never has two
readers at once. It needs two instances of the same debug-bar smoke.

What is needed:
1. **Per-run diagnostic isolation** — an instance-scoped log path, the same treatment the smokes already
   give \`HOME\`. \`artifacts/\` is repository-shared by construction, so the fix is a scoped path, not a mutex.
2. **The provenance guard this task opened for** — stamp each diagnostic line with instance identity and
   reject foreign lines, because a stale line from a previous run in the same worktree can still satisfy
   an assertion.
3. **A positive control** — plant a foreign-instance line and require the reader to reject it. A
   provenance check that never rejects anything looks exactly like clean provenance.

**The asymmetry that decides priority:** the concurrency collision produces WRONG NUMBERS; stale-line
acceptance produces FALSE GREENS. Only the first has been observed.`,

  200: `Warned in 11 of 11 gates, report-only, so it never blocks. Same metric as the earlier latency
investigation, now 1.6–2.4× its RE-REVIEWED baseline of 4.928 ms.

Two things make it worth its own task rather than a note:

1. **The number moved again.** The earlier investigation re-reviewed the baseline upward after
   establishing an intrinsic cost. The distribution is now above that reviewed figure, consistently, in
   every run — so either a new contributor landed after it, or the re-review was already generous.
2. **The instrument cannot stop it.** The check is report-only, so eleven consecutive warnings produced
   eleven ALL-PASS gates. This is precisely what the earlier task's SECOND HALF was meant to close: it
   added a trailing-history trend comparison, deliberately report-only because a blocking rule was
   uncalibrated at the time. That was right then. Eleven firings without consequence is the calibration
   data the blocking decision was waiting for.

**Load caveat, stated honestly:** these were quiet-locked runs with zero degraded lock entries, so
contention is not available as an explanation — but they were full-gate runs with a live pool.

Order of work: measure standalone under the quiet lock with load average beside every number. If 8–12 ms
does NOT reproduce standalone, the finding is that the gate's own pool inflates the metric it reports —
its own defect and a different repair. If it does reproduce, bisect from the baseline commit forward; do
not reason structurally first, since four structural diagnoses were overturned by measurement on this
metric before. Then decide the instrument's status with the eleven-run evidence in hand.

Widening the FAIL threshold is forbidden. The permitted outcomes are a defect, a declared intrinsic cost
with the baseline re-reviewed UPWARD in writing, or a ranked ladder of accumulating contributors.`,

  202: `The user diagnosed this themselves: "switching a tab to it, there is slight delay because i guess it
scans the whole file again."

Correct, and the code says so. \`Editor.ts:352-355\`: a clean background tab is dehydrated and its
document RELEASED; re-activation recreates it. \`Editor.ts:380\` — "the file was just reloaded into a
fresh document." So re-activating runs \`openFile\` → \`loadFromFile\`, a full re-read, and it invalidates
the wrap index for free because \`EditorWrap.$wrapIndexByDocument\` is a WeakMap keyed on the document
INSTANCE — a fresh document is a cache miss by construction.

**NOT the cause**, so nobody re-derives it: switching does not itself invalidate the wrap index. That
index survives activations for a retained document, and the empty-fold case uses a shared singleton so
the identity comparison cannot false-miss.

**Falsifiable check, run FIRST:** dirty tabs are never dehydrated. Type one character, switch away,
switch back — must be instant, while the same round trip on a clean tab pays the reload. If that
asymmetry is absent, this diagnosis is wrong.

**Why it is a defect and not a trade:** the substrate invariant forbids an INTERACTION whose cost is
O(total). A tab you switch to is observed, and switching is an interaction. The flyweight was applied to
background STORAGE — correctly, that is why idle memory is bounded — but re-hydration was left at
O(bytes).

Repairs ranked:
1. **A bounded hydrated set.** Keep the N most-recently-active documents hydrated. Alternating between
   two files — the dominant real pattern — becomes free, and memory stays bounded by N rather than tab
   count.
2. **Persist the derived geometry** across dehydration, keyed on path + size + mtime. The key is
   load-bearing: a stale cache here mis-renders silently.
3. **Streaming / lazy line index** so \`loadFromFile\` is O(viewport). The deepest fix, already the user's
   own suggestion, and the only one that also addresses launch (~621 ms) and RSS (~680 MB) at 1M.

Contract on COUNTS, not milliseconds: full-document reads per switch cycle must not grow with file size,
and for a re-activated recent buffer should be zero. Include a positive control — a check that counts
reloads can only fail toward "pass" if its counter is never incremented.`,

  205: `Found while answering the user's question "is it gated properly too?" after the flat-file regression
landed. The answer: the mechanism is gated, the symptom is not.

**Gated.** \`CodeFolding.test.ts:116\` asserts exact \`[30, 30]\` document reads across
\`[2_000, 1_000_000]\`, inside \`bun test\`, a blocking gate step. Verified independently: 11 pass, 54
assertions, and its positive control reads \`[4000, 2000000]\` when global discovery is restored, so the
counter provably still moves.

**Not gated at all.** First paint and peak RSS. The gate's only latency step compares p50/p95 KEYSTROKE
latency against a reviewed baseline. Nothing anywhere looks at launch time or memory. So the numbers that
actually captured the regression have no contract:

    1M flat lines, first paint  634 ms -> 2,417-2,526 ms  (fixed to 645-649 ms)
    1M flat lines, peak RSS     704 MB -> ~1,300 MB       (fixed to 665 MB)

The \`[30, 30]\` contract guards THAT mechanism, not the CLASS. Any other mechanism inflating launch or
memory sails through green, exactly as this one did through three rounds of reports.

**Why RSS and not milliseconds.** Repo doctrine prefers counts over thresholds because a faster machine
beats a threshold and nothing beats a count. First paint in milliseconds is a speed threshold: it drifts
with hardware and would either false-positive on a slow machine or be set so loose it catches nothing.
Peak RSS is different in kind — 665 MB at 1M lines is a structural fact about how much the editor
materialises, near-independent of CPU speed. A generous ceiling would have caught 1,300 MB without ever
firing on a slow machine.

To build:
1. A peak-RSS ceiling at a declared document size, as a blocking gate step, with the derivation recorded
   in \`project.performance-baselines.md\` so raising it later is a reviewed act rather than a quiet edit.
2. A MANDATORY positive control: an RSS check can only fail toward "pass" if measurement silently
   returns zero or the app fails to launch. Plant an over-ceiling allocation, require RED, remove it,
   require green.
3. First paint: measure and RECORD without blocking, or argue in writing for a blocking form.
   Report-only is acceptable — but only compared against its own trailing history, since a report-only
   check nobody reads is how twelve elevated samples once accumulated unnoticed.

Sequence after the drive-tool work; it lengthens every future gate.`,
};

let enriched = 0;

let singleLine = 0;

for (const stateDirectory of ['todo', 'live', 'done', 'retired']) {
  const statePath = join(tasksRoot, stateDirectory);
  if (!existsSync(statePath)) continue;
  for (const folder of readdirSync(statePath)) {
    const taskFilePath = join(statePath, folder, `task-${folder}.md`);
    if (!existsSync(taskFilePath)) continue;
    const taskNumber = Number(folder.split('-')[0]);
    const detail = DETAIL[taskNumber];
    const current = readFileSync(taskFilePath, 'utf8');
    if (!detail) {
      singleLine++;
      continue;
    }
    if (current.includes(detail.slice(0, 60))) continue;
    // Replace the one-line Outline body with the full detail, keeping heading and Sources.
    const outlineStart = current.indexOf('## Outline');
    const sourcesStart = current.indexOf('## Sources');
    if (outlineStart < 0) continue;
    const head = current.slice(0, outlineStart);
    const tail = sourcesStart > 0 ? current.slice(sourcesStart) : '';
    writeFileSync(taskFilePath, `${head}## Outline\n\n${detail}\n\n${tail}`);
    enriched++;
  }
}

console.log(`restored full detail to ${enriched} task files`);

console.log(
  `${singleLine} task files have no richer source than their one-line entry — that is the honest floor`,
);
