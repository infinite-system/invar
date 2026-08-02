# #459 — an emptied panel keeps its space, hides its list, and offers no way back

Priority: user-directed
State: ACTIVE
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high

## In plain words

Close every terminal in the instances list and the panel stays open as
a large empty rectangle. There is no "Add terminal" message, the
instances list hides itself, and the only control left is `+ Plugin`.
The user asked for the opposite: with zero instances, say so and offer
to add one.

The user also reports a terminal still running underneath after
removing every row, with no reference to close it. That exact shape did
not reproduce on current main, but a related registry divergence did —
see the phantom content below.

## Driven evidence — `tmp/probe-empty-dock.ts`

Restore a workspace whose panel holds two terminals with the list
pinned, then close both rows and confirm each.

**Before** — note the registry already disagrees with the list:

```text
panelContentIds   : ["pane-instance-1","database","pane-instance-2"]
panelContentLabels: ["Terminal One","Database","Terminal Two"]
panelCellIds      : ["pane-instance-1","pane-instance-2"]
panelCellLabels   : ["Terminal One","Terminal Two"]
```

**After closing both:**

```text
panelCellLabels   : []
panelCellIds      : []
panelContentLabels: ["Database"]
panelListVisible  : false
panelVisible      : true
panelActiveContent: null
```

Painted result: rows 24-40 are an empty void. Searching the grid finds
`Add Terminal instance` absent, `+ Terminal` absent, `$` absent.

## Three defects, ranked

1. **No empty state.** A visible panel with zero cells paints nothing.
   It should say the space is empty and offer to add an instance. The
   contents list already knows how to render `Add <label> instance` at
   its first row (`PanelContentsList.ts:197`), so the vocabulary exists
   — it just never reaches an emptied panel.
2. **The list hides itself when it empties** (`panelListVisible:
   false`), removing the one place a user would click to recover. The
   empty state should be exactly when the list is most visible.
3. **A phantom registered content.** `database` is registered from boot
   and never appears as a cell or a row, so no gesture can close it,
   and it survives closing everything. An id-keyed registry entry with
   no list row is unreachable by construction.

## Candidate mechanism — a hypothesis, not a diagnosis

`PanelHost.removeContent` has no hide-on-empty. Its sibling
`moveContentToHost` explicitly hides a host it empties:

```ts
if (contentWasVisible && !sourceHadOtherVisibleContent) this.hide();
```

`detachContent` instead promotes `orderedContents[0]` to active when
the last visible cell goes — which is how an invisible registered
content becomes the active one. Measure before believing this: the
conductor has been wrong three times in a row this week by reasoning
from code shape instead of driving.

## Wanted

Decide deliberately whether an emptied panel should (a) close itself,
or (b) stay open showing an empty state with an add affordance. The
user asked for an add affordance, so (b) is the default reading — but
say which you implemented and why, and keep the list visible either
way.

Then remove the phantom-content class: a registered content with no
reachable row is a registry-versus-view divergence, the same family as
the ids-versus-labels split #452 just fixed. Prefer making it
structurally impossible over deleting the one instance.

## Invariants in scope

- [The UI contract](../../../../src/modules/ui/ui.invariants.md) —
  `The panel contents list mirrors open content` is the record this
  most directly stresses: a registered content with no row means the
  list does NOT mirror open content. Judge whether the record is
  violated or needs refining.
- Also `A pane runtime owns its processes` and `Pane identity is
  separate from presentation` (landed with #452).
- Propose the missing record if "every registered content is reachable
  by a user gesture" is not written anywhere. That absence is why this
  defect can exist.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## Verification

- Extend `tmp/probe-empty-dock.ts` into a driven assertion in an
  existing harness smoke — a new smoke only if this is a new surface.
- Both arms: the empty state must PAINT when the panel empties, and
  must NOT paint while any cell remains.
- The shared helper `HarnessSmoke.closePanelContentsListRow` cannot
  close a TERMINAL row: terminals open a `Close <label>?` dialog that
  the helper never answers, and the dialog defaults to **No**. Existing
  callers only use it on Database rows. Fix the helper to handle
  confirmation, or the next person loses an hour as the conductor did.
- `bun test` in FULL, `bunx tsc --noEmit`,
  `bash scripts/conventions-gate.sh`, invariant checker `--all --refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## User rulings 2026-08-02

- **The orphaned terminal is FIXED.** The user rebuilt and confirms it
  no longer reproduces. That was #452's stranded-pane defect. Do not
  re-investigate it.
- **But the Database pane DOES show, and that is wrong.** The phantom
  registered content is not merely a status-field oddity — it is
  visible to the user in the right pane. Defect 3 is therefore
  USER-VISIBLE and outranks the empty-state work. The user never added
  a Database instance; it arrives from boot with no row to close it.
- **Empty state: keep the panel open and show the message.** The user
  chose the "Add terminal" affordance over closing the space. Quote:
  "If there are 0 instances in right pane, there should be a message,
  Add terminal". Implement that; do not close the panel instead.
