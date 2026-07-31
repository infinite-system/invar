# READY — Invariant Field web app (#413)

State: READY

Branch: `fleet/413-invariant-field-web-app`

Commit: `e98574055ee858451fc765e0ef2dc6668a3f947f`

The worktree is clean. I did not push, merge, tag, or delete a branch.

## Result

The standalone Invariance Field is complete under
[`tools/invariant-field/`](../../../worktrees/413-invariant-field-web-app/tools/invariant-field/README.md).
It walks first-parent contract history, parses 308 snapshots, tracks record
identity through atomic renames, resolves evidence, counts code annotations,
and derives every radial position from inspectable rank inputs.

The current snapshot contains:

- 377 invariant records;
- 1,286 resolved code annotations and 0 orphans;
- 231 resolved lattice links;
- 21 lattice compositions;
- 80 records with one or more lattice memberships;
- 0 parser findings.

The browser shows R as an unreachable center, contract files as angular
sectors, rank as radius, a time slider, composition highlighting, and an
essence-first record accordion. Search, kind and contract filters, four sort
orders, every record field, lattice guarantees, and the complete weighted
calculation are present.

The scanner writes only the ignored generated store. It never writes a
contract or lattice. The server is separate from the Invar runtime. It has no
timer or watcher.

## Canonical contract relation

The history parser in
[`ContractParser.ts`](../../../worktrees/413-invariant-field-web-app/tools/invariant-field/ContractParser.ts)
adapts the normalization, inert-content masking, ordered sections, fields,
kind derivation, slug, Markdown link, and annotation rules from the canonical
[`check_invariants.mjs`](../../../worktrees/413-invariant-field-web-app/.claude/skills/invariants/scripts/check_invariants.mjs).
The parity test parses every current contract and requires the same 377-record
total as checker version 2.2.2. A malformed fixture with an empty Verification
field is rejected by both parsers.

Historical verification stays `citation-only` because running an old command
against the current checkout would give a false result. The current snapshot
executes only bounded `grep` and `rg` commands with no shell composition or
redirection. One current record produced `executed-pass`; the other 376
records stayed `citation-only`.

Code annotations use exact record identity. Their counts, legitimate
review-time exemptions, orphan pressure, and growth over time feed the rank.
Lattice members resolve to stable record identifiers. A focused test now
locks the record-membership projection that supplies curvature.

## ivue UI

The late
[`build-with-ivue` brief](brief-413-x-build-with-ivue.md)
is fully applied. The frontend has no tracked JavaScript source. Bun serves
the [HTML import](../../../worktrees/413-invariant-field-web-app/tools/invariant-field/index.html)
and transpiles
[`app.ts`](../../../worktrees/413-invariant-field-web-app/tools/invariant-field/app.ts)
directly. There is no separate frontend build step.

Five logic owners use the anchored `class $X`, namespace `$Class`, and
`Class = Reactive($Class)` form from the full
[`ivue operating manual`](../../../worktrees/413-invariant-field-web-app/.claude/skills/ivue/SKILL.md):

- [`InvariantFieldApp`](../../../worktrees/413-invariant-field-web-app/tools/invariant-field/ui/InvariantFieldApp.ts)
  owns loading, selected snapshot, selected record, and selected composition.
- [`HistoryTimeline`](../../../worktrees/413-invariant-field-web-app/tools/invariant-field/ui/HistoryTimeline.ts)
  owns time-slider derivations and bounded navigation.
- [`FieldView`](../../../worktrees/413-invariant-field-web-app/tools/invariant-field/ui/FieldView.ts)
  owns sectors, dots, composition lighting, and tooltips.
- [`RecordList`](../../../worktrees/413-invariant-field-web-app/tools/invariant-field/ui/RecordList.ts)
  owns search, filters, sorting, and accordion view models.
- [`RankDisplay`](../../../worktrees/413-invariant-field-web-app/tools/invariant-field/ui/RankDisplay.ts)
  owns formula, axiom, and selected-record calculation views.

Mutable UI state uses ref-getters. Snapshot structures use `shallowRef` and
are replaced wholesale. Derived values are plain getters. Templates contain
named values and method calls, not anonymous conditions. The structural
census found five `$` classes and five `Reactive(...)` publications.

## Rank and IBR axioms

The rank follows the complete
[`IBR framework`](../../../worktrees/413-invariant-field-web-app/.claude/skills/ibr/IBR.md).
Depth is the weighted sum below minus orphan pressure. Radius is
`0.10 + 0.90 × e^(-2.5 × depth)`, so no record reaches R.

| Component | Weight | IBR axiom it operationalizes |
|---|---:|---|
| Kind | 14% | Scope Principle and Provisionality: reality-set constraints start inward of agreement-set choices. |
| Falsifiability | 10% | Impossibility Principle: a concrete negative boundary earns depth; a vacuous boundary earns none. |
| Evidence | 12% | Proof and Breaking Principles: path-like evidence must exist in that commit tree, and dead evidence moves outward. |
| Verification | 9% | Proof Principle: an executed passing bounded check is stronger than a citation; failure or absence earns none. |
| Status | 7% | Provisionality: established records have survived more pressure, but still remain short of R. |
| Generativity | 11% | Generative Principle: explicit generated consequences and lattice membership move a record inward. |
| Simplicity | 8% | Simplicity as the signature of invariance: a compact rule earns compression only when it has a real mechanism, boundary, and downstream breadth. |
| Curvature | 10% | Invariant Reinforcement and the Generative Principle: logarithmic connection density literally bends a record inward. |
| Annotations | 9% | Generative Principle: reverse pointers show the record operating at enforcement points. Review-time exemptions earn weaker credit. |
| Survival | 10% | Provisionality: age earns depth only while semantic refinement remains stable. |
| Rot penalty | subtraction | Breaking Principle and Provisionality: orphaned annotations apply outward pressure instead of being hidden by positive inputs. |

The formula and this axiom map are visible inside the app. Selecting a record
shows each normalized component, its weight, contribution, rot subtraction,
final depth, and radius.

## Driven calibration

I drove the real Bun server and Chromium surface after the ivue conversion.

1. **Known deep.** `Seams are drawn at the shared generator` is a
   reality-absolute record with two lattice memberships and 23 code
   annotations. It ranked `0.791249` at radius `0.224496`, visibly inward.
2. **Thin provisional.** `Fleet extras name their repository scope` is a
   chosen provisional record with no lattice membership and one annotation.
   It ranked `0.385892` at radius `0.442978`, the current outermost record.
3. **Planted rot.** The
   [`calibration script`](../../../worktrees/413-invariant-field-web-app/tools/invariant-field/calibrate.ts)
   copied the deepest record to its own temporary directory, replaced its
   Evidence with a missing path, emptied Verification, parsed it again, and
   removed the scratch directory. The controlled radius moved from
   `0.245505` to `0.322285`: outward by `0.076780`. No real contract changed.

Scale parity also held. Snapshot 0 rendered 22 dots and 22 cards. Snapshot 307
rendered 377 dots and 377 cards with the same geometry and controls. Search
for `structured event stream` returned `1 of 377 records`. The `Memory scales
with the visible set, not the file` composition returned and highlighted five
records. Opening the first card populated all ten weighted calculation rows.
The production server returned 404 for a missing favicon instead of logging
an exception.

## Positive controls

I inverted the planted-rot unit expectation. The rank test went red with
baseline radius `0.181762` and planted radius `0.238215`. Restoring the
outward expectation returned it to green.

I changed the ivue composition test to expect `second`. It went red because
the highlighted member was exactly `first`. Restoring the real member returned
all four UI-model tests to green.

Before the lattice projection repair, the generated census reported zero
record memberships while composition highlighting still had members. After
the repair, 80 current records carry memberships and the focused membership
test passes. This proves the curvature input is not a decoration.

## Verification

The final post-ivue full gate completed in 4 minutes 8 seconds:

- conventions, TypeScript, Prettier, invariant structure, invariant
  references, coverage ratchet, and observation audit passed;
- all unit tests and the binary build passed;
- all 66 parallel PTY harness jobs passed without a retry;
- behavioral contracts and all three serial jobs passed;
- the retry tally was empty;
- final result: `ALL-PASS`, exit 0.

The preceding attempt received SIGTERM 143 during the parallel pool. Its
preserved log showed one unrelated goto-definition visibility miss and 64
completed green jobs. The same harness passed every step immediately in
isolation. No code changed before the clean full-gate retry.

After the gate, the commit used `SKIP_GATE=1` only to prevent the pre-commit
hook from running the same full gate again. Post-commit focused verification
then passed:

- `bun test tools/invariant-field`: 17 passed, 0 failed, 37 expectations;
- `bun run typecheck`: exit 0;
- `bunx prettier --check tools/invariant-field`: exit 0;
- canonical checker: 1,286 annotations, 231 lattice links, 0 problems;
- `git diff --check`: exit 0.

## Bycatch

- **Comment drift, reproduced twice:** `Appearance is data with a capability
  fallback` in
  [`project.invariants.md`](../../../worktrees/413-invariant-field-web-app/project.invariants.md)
  cites absent `src/modules/ui/PanelHeading.ts`. Not fixed.
- **Comment drift, reproduced twice:** `Undo records deltas not whole-document
  snapshots` in
  [`editor.invariants.md`](../../../worktrees/413-invariant-field-web-app/src/modules/editor/editor.invariants.md)
  cites absent `src/modules/editor/TextDocument.ts`; the tracked document
  implementation is
  [`src/modules/text/TextDocument.ts`](../../../worktrees/413-invariant-field-web-app/src/modules/text/TextDocument.ts).
  Not fixed.
- The current parser found no malformed record and no vacuous
  `Impossible if true` boundary.
- The aborted final-gate attempt observed one goto-definition harness miss.
  It did not reproduce in the immediate isolated run or the clean final gate.
