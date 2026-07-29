# Brief — #299: ONE input primitive everywhere — selection, copy, alt+backspace, uniform

Read first: [task-299-structure-filter-uses-shared-input-generator.md](task-299-structure-filter-uses-shared-input-generator.md)
— USER-DIRECTED, Effort: high; his verbatim words are in the record and
GOVERN. This is a one-painter/one-generator task, not a patch task.

The law (seam-at-shared-generator): there is ONE text-input generator
(TextInputModel/TextFieldPainter family). Every text input in the app
renders and behaves through it. A consumer reimplementing editing is
the defect; a consumer missing capabilities is the same defect from the
other side.

Arms:

1. **Census first**: enumerate EVERY text input surface (structure
   filter, breadcrumb search, editor find, go-to-line (#267 just
   landed on the shared seam — use it as the reference consumer),
   command palette, settings filter, dialogs, terminal rename, anything
   else the census finds). Report the full list with
   which generator each uses today. The census is a deliverable.
2. **Capabilities at the generator**: selection (shift+arrows like the
   editor), copy (everywhere), alt+backspace word-delete, and the
   existing editing set — implemented ONCE at the generator, inherited
   by all consumers.
3. **Migrate non-conforming consumers** to the shared generator.
   Structure filter and breadcrumb search are the user's named cases.
4. **Active-state port**: the user prefers structure's ACTIVE search
   state visual; port that state to breadcrumb search "but with input
   capabilities extended/fixed" — the state style and the input
   capabilities both come from shared seams, not copies.
5. **Both polarities** per consumer: shift+arrow selects + copy yields
   the selection; unselected copy behaviour defined; alt+backspace
   deletes a word and NOT the whole field; a planted consumer bypassing
   the generator must be catchable (contract or conventions check if
   feasible — state the decision).

Real PTY drives on each migrated surface, both scales for at least the
structure filter and breadcrumb search.

## Invariants in scope

The text-input/one-painter records (TextInputModel, TextFieldPainter);
structure records; breadcrumb records; the #267 go-to-line record as
the reference consumer; clipboard records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy — a census task
generates bycatch by nature; file every non-migrated oddity. The READY
report carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: full input-surface census, generator capabilities
implemented once, named consumers migrated and driven both polarities,
active-state ported, green `bun test` + affected smokes. The conductor
gates at landing.
