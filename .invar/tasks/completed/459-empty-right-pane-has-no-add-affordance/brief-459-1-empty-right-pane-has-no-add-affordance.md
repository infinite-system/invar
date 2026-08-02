# Brief #459 round 1 — the phantom Database pane, and the empty panel

## In plain words

A Database pane the user never added shows up in the right pane, with
no row in the instances list, so there is no way to close it. Fix that
first. Then: when the last instance is closed, the panel goes blank
with no message and the list hides itself. It should stay open and
offer to add a terminal.

## Read the task file first

[task-459](task-459-empty-right-pane-has-no-add-affordance.md)
carries the driven evidence, the ranked defects, the candidate
mechanism, and the user's rulings. This brief does not repeat it. Read
it, then run the committed probe.

## Start by driving the probe

`probe-459-empty-dock.ts` sits in the task folder. It restores a panel
holding two terminals with the list pinned, closes both rows, and
prints the published status plus the painted grid at each step. Run it
before changing anything. You must see what the conductor saw.

Gotchas the conductor paid for, so you do not:

- `HarnessSmoke.closePanelContentsListRow` **cannot close a terminal
  row.** Terminals open a `Close <label>?` dialog; the helper never
  answers it and then times out waiting for a count that never moves.
- **That dialog defaults to No.** Pressing Enter declines the close.
  The probe sends `Left` then `Enter`. Two runs read as "the product
  ignored my close" when in fact the drive had clicked the safe button.
- The list is published as `panelCellLabels` / `panelCellIds`;
  `panelContentLabels` / `panelContentIds` are the REGISTRY. Their
  disagreement is the bug, so never use one as a proxy for the other.

## Defect 1 (highest) — the phantom Database pane

From a clean restore, before any gesture:

```text
panelContentIds   : ["pane-instance-1","database","pane-instance-2"]
panelContentLabels: ["Terminal One","Database","Terminal Two"]
panelCellIds      : ["pane-instance-1","pane-instance-2"]
panelCellLabels   : ["Terminal One","Terminal Two"]
```

`database` is registered, is not a cell, has no list row, and survives
closing every terminal. **The user confirms it is visible in their real
app.** They never added it.

Note the id: `database` is a legacy KIND-shaped identifier, not an
opaque `pane-instance-N`. #452 made pane identity opaque and migrated
persisted ids. A registration still carrying a bare kind id is the
first thing to explain. Find where it is registered and why it has no
cell — do not assume it is the restore path, and say what you actually
found.

The fix must remove the CLASS, not the instance: a registered content
with no reachable row is unreachable by construction. Make that
impossible, or make the divergence loud at the seam where it arises.
Deleting one stray registration and leaving the shape intact is a
rejected deliverable.

## Defect 2 — the empty panel offers nothing

After closing every row: `panelVisible: true`, `panelCellIds: []`,
`panelListVisible: false`. The grid paints an empty void; the strings
`Add Terminal instance`, `+ Terminal` and `$` are all absent.

**User ruling: keep the panel open and show the message.** They asked
for "a message, Add terminal". Do not close the panel instead.

`PanelContentsList.ts:197` already renders `Add <label> instance` as
its first row, so the vocabulary exists — it just never reaches an
emptied panel.

## Defect 3 — the list hides itself exactly when it is needed

`panelListVisible` goes false when the panel empties, removing the one
place a user would click to recover. The empty state is when the list
should be MOST visible. Keep it open.

## The mechanism candidate is a hypothesis, not a diagnosis

`PanelHost.removeContent` has no hide-on-empty while
`moveContentToHost` explicitly hides a host it empties, and
`detachContent` promotes `orderedContents[0]` when the last visible
cell goes. That plausibly explains an invisible registration becoming
active — and it may be wrong. The conductor has been wrong three times
this week by reasoning from code shape instead of driving. Measure,
then say which candidate survived and what killed the others.

## Invariants in scope

- [The UI contract](../../../../src/modules/ui/ui.invariants.md) —
  `The panel contents list mirrors open content` is the record this
  most directly stresses. A registered content with no row means the
  list does NOT mirror open content. Decide: violated, or does the
  record need refining to say which collection it mirrors?
- Also `A pane runtime owns its processes` and `Pane identity is
  separate from presentation` (landed yesterday with #452).
- **Propose the missing record.** If "every registered content is
  reachable by a user gesture" is written nowhere, that absence is why
  this defect can exist. Give it an `Impossible if true` that names the
  unreachable registration.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy: runtime
defects, invariant violations in function, comment drift, distillation
possibilities, generator drift or introduced variance, plain nonsense.
Write the `## Bycatch` section even if it reads `None observed`.

## Verification

- Turn the probe into driven assertions in an existing harness smoke.
  A new smoke only if this is genuinely a new surface.
- Both arms, for each defect: the empty-state message must PAINT when
  the panel empties and must NOT paint while any cell remains; a
  registered content with no row must FAIL the new guard and a normal
  registration must pass it.
- Fix `closePanelContentsListRow` to answer the confirmation dialog, so
  the next drive of a terminal row does not repeat the conductor's
  hour.
- `bun test` in FULL, not focused. `bunx tsc --noEmit`,
  `bash scripts/conventions-gate.sh`, invariant checker `--all --refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`. The
  conductor gates and lands.

## End state

A report file in the task folder opening with `## In plain words`,
stating which mechanism survived, answering the invariants record by
record, and carrying a `## Bycatch` section.
