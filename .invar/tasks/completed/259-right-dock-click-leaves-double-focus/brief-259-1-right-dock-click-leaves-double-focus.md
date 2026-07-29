# Brief — #259: a right-dock click can leave BOTH docks focused

Read first: `.invar/tasks/in-progress/259-right-dock-click-leaves-double-focus/task-259-*.md`.

One paragraph: `RootView.ts:399-407` — the right-dock click handlers blur
`panelHost` but not `primaryDockHost`. Click a right-dock row while the
primary dock (e.g. Extensions) is focused: BOTH docks stay focused and the
primary dock wins the key ladder — Enter routes to the wrong pane. #238
fixed this shape on the COMMAND path; the CLICK path still has it, and
#238's landed report reconfirms the repro (its Bycatch item 3). Now that
#238's structure pane is default-ON, this is a default-path bug.

Reproduce FIRST by driving: focus Extensions, click a structure row, press
Enter, observe routing. Fix at the generator: "focus this dock" must be ONE
operation with one owner that blurs the rest — not N boolean blurs
scattered per call site. Check the LEFT/primary click handlers for the
mirror gap. If no record states "at most one dock holds focus", write it —
that gap is part of this task. Lock with a driven assertion on the exact
double-focus scenario (both polarities: the scenario fails before the fix,
passes after; a control that cannot fail proves nothing).

Related, out of scope: #238's report also noted `Bootstrap.ts` now holds
two near-copies of the focused-dock key ladder (~1985, ~2162) — the seam
becomes due at a third consumer; name interactions, do not unify here
unless your one-owner fix collapses them naturally.

## Invariants in scope

- [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — the right-dock toggle record #238
  extended; any record naming dock focus; the NEW at-most-one-dock-focused
  record if absent.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## End state (mechanical)

READY report in the task folder with the driven repro (before), the
generator fix, the driven assertion (after + control), green `bun test`
and the touched smokes; the conductor gates at landing.
