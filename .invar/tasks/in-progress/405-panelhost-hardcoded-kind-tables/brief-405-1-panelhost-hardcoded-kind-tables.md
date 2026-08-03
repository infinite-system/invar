# Brief 405-1 — one kind-to-label map replaces the panel kind tables

## In plain words

Three sites in the panel host repeat a two-value table mapping pane
kinds to labels and spaces ('database' else 'terminal'). A third
bottom-panel citizen gets forced into the wrong space with the wrong
label. Distill the three sites to one map that pane registrations
feed.

## First check

#404 (panel v2 redesign) has NOT landed — verified at dispatch. This
distillation stands alone; keep it small so #404 can absorb it later.

## Reproduce by DRIVING first

Drive the bottom panel: open terminal and database panes, read the
space labels. Register nothing new yet — first see the current
behavior, then write a probe registering a third kind and watch it
land in the wrong space (the census row 4 defect made visible).

## The work

[The #488 census report](../../completed/488-core-to-plugin-coupling-census/report-488-core-to-plugin-coupling-census.md)
row 4 + [the task file](task-405-panelhost-hardcoded-kind-tables.md): registerShared, contentSpaceKind(),
nextSpaceLabel() in PanelHost/PanelWorkspaceState/PanelContentsList.
One kind-to-label-and-space map, fed by pane content registration
(the contributor declares its kind, label, space) — core stops
knowing 'database' and 'terminal' by name. Re-run
census-488-vocabulary.ts; row 4 counts must fall.

## Invariants in scope

- Pane chrome and child cells keep separate authority
  ([src/modules/terminal/terminal.invariants.md](../../../../src/modules/terminal/terminal.invariants.md)).
- Panel/UI records in [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — answer record
  by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh. Commit on your branch; READY report
in the task folder.

Commit note: the pre-commit hook auto-runs the full gate; use the
documented SKIP_GATE=1 bypass on your branch commits (the conductor
gates the combined tree at landing).
