# READY — #230 (author the ui lattice)

State: READY
Branch: `fleet/230-author-ui-lattice`
Commit: `8378fab` — `contracts: author src/modules/ui/ui.lattice.md (#230)`
Files: [src/modules/ui/ui.lattice.md](../../../../src/modules/ui/ui.lattice.md) (new, 538 lines). No production code.
Tree: clean.

## What was done

[src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) holds 61 records — the largest contract in the
repo, more than [project.invariants.md](../../../../project.invariants.md) (32) and agent (20). It had no lattice.
The new [src/modules/ui/ui.lattice.md](../../../../src/modules/ui/ui.lattice.md) records which records GENERATE which and
which BOUND which, in the form [scroll.lattice.md](../../../../src/modules/ui/scroll.lattice.md) set.

## The placement decision

New file, [src/modules/ui/ui.lattice.md](../../../../src/modules/ui/ui.lattice.md). Not more sections in
[project.lattice.md](../../../../project.lattice.md).

The criterion is in scroll's own header: "How the records in
[scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md) hold together." A lattice unifies the records of ONE
sibling contract. The checker enforces that reading — `checkLattice` reports
coverage for a `*.lattice.md` against the `*.invariants.md` with the same stem
in the same directory (`check_invariants.mjs:645-649`). A ui lattice written
into [project.lattice.md](../../../../project.lattice.md) would get no coverage duty at all.

[project.lattice.md](../../../../project.lattice.md) keeps compositions whose MEMBERS cross contracts. #221's
*Source text state survives replaceable projection* is one of those — it joins
project, workspace, and ui records. The new file JOINS it: the placement
section names it, and the *The editor is an ordinary citizen* composition says
the model side lives there. It is not duplicated.

## What the lattice says

Five generators, stated as derivation trees and then as import-style
references:

1. **The pane seam.** *The panel renders exactly the visible pane content cells
   each frame* is the root. It generates the split, the two focus-routing
   records, the scoped-binding bound, bracketed paste, the headed regions, the
   instance sessions, #114's *A pane runtime owns its processes*, the two
   citizens, and #219's *A pane content projects through exactly one surface* —
   which in turn generates #219's *The source text editor is a pane content
   citizen* and #220's *The editor column's default occupant is a
   contribution*. The reason #219's record exists is recorded: forcing the
   editor to return an empty `StyledText` would be a consumer suppressing the
   seam's core, which is convention 2's tell that a boundary is misdrawn.
2. **One geometry for paint and hit.** The bounded-popup family (geometry →
   behavior → hierarchy → completion, priced by the visible-rows record), plus
   the single-line field painter, plus the six surfaces that state the same
   rule from different generators (panel controls, splitter, tab bars, command
   bar, status edge, settings widgets).
3. **Scrollbars and marks**, standing on the one reality record — a pane height
   is an INPUT, so a track can be derived per frame at all.
4. **The modal slot**, its pointer, geometry, and parity rules, the
   same-frame-dismissal constraint over all of them, and the two deliberate
   NON-members (tooltip, hover card) with the one exception the hover card
   takes.
5. **Projection discipline.** *Renderables hold no model state* and every body
   and list painting record that stands on it.

**Constraint from outside** is its own section, as the brief asked:

- workspace's *One provider creates every workspace buffer view* is what makes
  the source-text pane's release EXPRESSIBLE — one creator recorded what it
  made, so one releaser can free it. Without it the pane could only guess, and
  withdrawal would leave live views behind: the orphaned-pane defect #114 fixed
  one layer up. The edge runs one way — ui may not name the view class, and the
  workspace record may not name a pane.
- [scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md) holds the cross-surface generator; the five ui scroll
  records are named as its surface bindings, and [scroll.lattice.md](../../../../src/modules/ui/scroll.lattice.md) keeps how
  those five hold together. *Driven scroll contracts derive their quantities*
  is named as the constraint on how the ui scroll records may be VERIFIED.
- The seven project roots the family stands on.

**Three recurring shapes** (one owner of one obligation; paint and hit are one
walk; the host holds an opaque occupant) and **eight compositions** in scroll's
members / guarantee / mechanism-of-conjunction / breaks-if form: every occupant
is uninstallable; exactly one consumer per input; a painted cell is the cell
that acts; mouse and keyboard cannot disagree; the frame costs a screenful;
order and identity survive a restart; an overlay's disappearance is atomic; the
editor is an ordinary citizen.

## Verification

`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`

- **0 problems**, before and after.
- **Lattice-link delta: 77 → 217 resolved, +140.**
- Annotations unchanged at 993 resolved.
- **No `coverage src/modules/ui/ui.lattice.md: never referenced:` line is
  printed.** That line only appears when a lattice leaves a sibling record
  unwoven, so all 61 ui records are referenced. Every link resolves; anchors
  are identity.
- Links inside the fenced dependency map do not count — `readMasked` masks code
  fences — so all 140 come from the prose sections, the same as scroll's.
- STE lint: `words=4098 total=111 per100w=2.71`. Lower than both siblings
  (scroll 2.98, project 4.79).

`scripts/merge-gate.sh` not run, per the brief. Contract-only change.

## Bycatch

**Comment drift — three symbols cited by [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) exist nowhere in
`src/`.** `grep -rn` over `src/` finds `renderEditorStyled`, `renderTree`, and
`renderGitPanel` in NO file except [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) itself. `RootView.ts` has
zero occurrences of all three. The records that cite them:

- *Only the visible window is rendered* (Mechanism): "`renderEditorStyled`
  slices `document.slice(top, height)`… `renderTree` slices the visible tree
  window".
- *A scrollable pane height is an input not an output* (Mechanism):
  "`renderGitPanel` derives `bodyH` from `sidebar.height`".
- *Selection is item-anchored click-set keyboard-moved and stays*
  (Mechanism + Evidence): "`RootView.renderTree` and `RootView.renderGitPanel`
  always project selection"; Evidence names both again.

The BEHAVIOR each record states still holds — the work moved into
`FileTreePaneContent`/`TreePaneRenderer` and the pane-content extraction. Only
the citations rotted. Not fixed: three records in a contract file, which
[AGENTS.md](../../../../AGENTS.md)'s small-and-obvious rule excludes ("never a contract file").

**Comment drift — the contract disagrees with itself on two module paths.**
`src/modules/ui/EditorPaneRenderer.ts` and `src/modules/ui/EditorPane.ts` do
not exist; both are under `src/modules/editor/`. Cited with the wrong `ui/`
path at `ui.invariants.md:719`, `:720` (*Indent guides mark leading whitespace
without shifting columns*, Evidence) and `:1822` (*TS diagnostics render as an
underline and overview mark*, Evidence). The SAME file cites the correct
`src/modules/editor/EditorPaneRenderer.ts` at `:1390` (*Renderables hold no
model state*, refined 2026-07-29). One contract, two answers.

**Plain nonsense — a duplicated paragraph.** *The selected range renders with a
background*, `ui.invariants.md:1531-1545`. The "Mouse addendum (2026-07-21)"
paragraph is followed immediately by a near-identical paragraph starting "The
MODEL is the only selection writer (mouse, 2026-07-21)". Same three claims
(model is the only writer; `documentPositionAtCell` mapping;
`selectable:false` disabled OpenTUI drag), same parenthetical dates, ~15 lines
of restatement. An editing artifact, not two rules.

**Contract-layer gap — two scroll records sit in the ui contract but govern the
scroll generator, not a ui surface.** *Same-direction notches accumulate until
the glide ceiling* has Scope `Momentum.queueImpulse` and `Momentum.addImpulse`,
and Evidence `src/modules/system/Momentum.ts`. *A fast glide crosses rows in
many small steps* is about `Momentum.stepMomentum` and the Bootstrap cadence
timer. Neither names a `src/modules/ui/` site in its Scope. `scroll.invariants`
already carries *Same-direction impulses accumulate to the ceiling* and *The
glide tail is bounded and effective*, and its header says surface-specific
rules stay in module contracts — which these are not. Same question for *One
writer per scroll regime per frame* against scroll's *One generator owns each
scroll position*: two near-identical statements in sibling contracts. The
lattice states the relation honestly (ui as the surface binding), but the
placement is a real design call someone should make.

**Contract-layer gap — [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) is due a split.** 61 records, against
32 for project and 20 for the next-largest module. The families are clean and
the new lattice names them: the pane seam, the bounded-popup geometry, the
modal slot, the scrollbars, and the editor-body projection. `scroll` was split
out of this same file already, which is the precedent. Not proposed as a task
here — the lattice makes the seams reviewable first.

**A distillation possibility — seven records state one rule.** *Bounded list
popups share paint and hit geometry*, *Panel controls share paint and hit
geometry*, *Splitter paint and hit testing share one geometry*, *Tab bars share
paint and hit geometry*, *Command bar paint and hit geometry are identical*,
*Settings are editable by mouse per widget kind*, and *A scrollbar thumb is
painted as background fill, never block glyphs* all say: the walk that PLACES a
control returns its hit segment. The shared generator is one project-level
record (a candidate name: *A control's paint walk returns its hit segments*),
after which the seven become its instances with their own geometry. I did NOT
unify them — the seam call is a design decision, and the seven generators
genuinely differ (column cursor, one-cell cross-axis rect, right-pinned segment
list, normalized half-cell thumb rect). The lattice records it as a recurring
SHAPE, which is the honest halfway point. Recorded in `## The recurring
shapes`.

**An invariant violated in function:** none observed. This was a contract-only
task; I read every ui record but drove no code, so absence of a finding here is
weak evidence.

**Generator drift / introduced variance:** none observed. The new file adds no
code path and no seam.

## Follow-on tasks this suggests

1. Repair the three dead symbol citations and the two wrong module paths in
   [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md), and delete the duplicated selection paragraph. One
   contract-only pass, ~6 edits.
2. Decide where the two `Momentum`-scoped records belong — ui or scroll — and
   move or refine accordingly.
3. Consider splitting [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) along the five families the lattice
   names.
4. Consider the shared paint-and-hit generator as a project record.
