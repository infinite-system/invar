# #405 — PanelHost hard-codes the database/terminal kind tables

State: IN-PROGRESS
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low

## Origin — #402 bycatch 1-3 (reproduced by registering a new shared pane)

Three sites repeat a two-value kind table: registerShared hard-codes
kind 'database' + label 'Database' for non-selected workspace content
sets (createContentSet repeats it); contentSpaceKind() forces any new
bottom-panel kind into 'terminal'; nextSpaceLabel() repeats the table.
A THIRD bottom-panel citizen paints inside a space labelled Database.
Distill to one kind-to-label map all three read.

COORDINATE WITH #404: the panel v2 redesign rebuilds the space/pane
model — this distillation likely belongs inside it; check #404's landed
state first and retire this if the redesign already removed the tables.
