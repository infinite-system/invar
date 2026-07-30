# READY report #346 round 6: restore editor actions

Commit: `a4ab1afb7e4f7262c29cd3ba480b4a669f0ae02d`

Parent: `c79f94ef7db7ac5de6ceb89b61901c17dad363a6`

`GATE_EXIT=0`

## Result

I completed the [round 6 brief](brief-346-6-5-restore-editor-actions.md).
The bottom panel row now contains workspace tabs, wrap and go-to-line action
buttons, the drag span, and the three panel controls.

I committed the change on the task branch. The worktree is clean. I did not
push or land the branch.

## Published geometry

[PanelTabBar](../../../../src/modules/ui/PanelTabBar.ts) now publishes two
distinct segment lists:

- `tabs` identifies workspace tabs by `spaceIdentifier`.
- `editorActions` identifies editor buttons by `commandId`.

One projection paints both lists and resolves pointer hits for both lists.
[RootView](../../../../src/modules/ui/RootView.ts) publishes the same segment
bounds through the status geometry. It does not calculate a second hit map.
This keeps the tab-bar paint and hit geometry invariant true for the mixed row.

The row order is tabs, actions, drag span, and panel controls. Tabs receive
space before actions. At a narrow width, the action buttons disappear first.
The tabs and the one-cell drag span remain.

Each editor action uses three cells. Its icon has one padding cell on each
side. Both buttons dispatch through the command registry.

## Driven result

I drove the real app before and after the change.

- At 120 by 40, the row paints Terminal, Database, wrap, go-to-line, the
  centered heavy drag line, Add, expand, and close.
- At 88 by 24, the row keeps both tab identities and the drag cell. Both
  editor actions are absent because the row has reached the action truncation
  boundary.
- `Alt+Z` toggles word wrap at both sizes.
- `Alt+G` opens the shared go-to-line prompt at both sizes.
- At the wide size, clicking each published action segment produces the same
  effect as its shortcut.
- Add, keyboard tab cycling, tab clicks, expand, and close still work.

The positive control changed the expected go-to-line command identity to a
false value. The panel chrome smoke failed at the distinct editor-action
geometry assertion. I removed the planted defect, and the smoke passed again.

## Verification

- `bun run typecheck`: passed.
- Focused unit tests: 4 passed, 0 failed, with 88 expectation calls.
- [Panel chrome smoke](../../../../scripts/harness/smoke-panel-chrome-harness.ts):
  passed at 120 by 40 and 88 by 24.
- [Database smoke](../../../../scripts/harness/smoke-database-harness.ts):
  passed after it changed from the old overloaded `editorActions` field to
  the distinct `tabs` field.
- Invariant checker: 1,233 annotations and 231 lattice links resolved, with
  zero problems.
- Coverage ratchet: passed across 392 files.
- Full commit-hook gate: passed with `GATE_EXIT=0`.

The first hook run failed because the database smoke still treated workspace
tabs as editor actions. I changed that semantic consumer to read `tabs` by
`spaceIdentifier`. The next hook passed all 65 parallel smokes, including the
panel chrome and database smokes.

The behavioral contracts had a starvation-class first attempt in the final
hook. The hook's one quiet retry passed. The retry tally therefore names one
retry-only pass. All other gate steps passed without a retry.

## Invariant answer

The mixed row upholds
[Tab bars share paint and hit geometry](../../../../src/modules/ui/ui.invariants.md).
`PanelTabBar.project` is the one generator for tab, action, drag, and control
placement. `tabAtColumn`, `editorActionAtColumn`, and `controlAtColumn` inspect
that projection. RootView paints and publishes those same bounds.

The right-dock proportional bound and shared splitter geometry from the prior
round remain unchanged.

## Bycatch

- The final behavioral-contract run passed only after its built-in quiet
  retry classified the first attempt as starvation. The gate recorded this
  in its retry tally. It did not reproduce in the earlier complete hook run,
  where behavioral contracts passed on the first attempt.
- No product bycatch was observed.
