# Brief — #317: bottom panel splitter — thinner + left editor buttons + always-draggable

Read first: [task-317-bottom-panel-splitter-thinner-with-action-buttons.md](task-317-bottom-panel-splitter-thinner-with-action-buttons.md)
— USER-DIRECTED; his verbatim words govern all three arms.

Build on current main: #313/#315 landed (terminal pane), fidelity-2
bundle (#320+#321) is LIVE in another lane touching terminal pane
RENDER internals — your work is the splitter ROW between editor and
panel, different seam; coordinate via merge if you brush the same
files.

The three arms are in the record: (1) thinner separator sharing one
thickness token with the thinned horizontal scroller / vertical
splitter; (2) LEFT-side editor action buttons on a proper contribution
seam (this row will grow) — pick two genuinely useful first citizens
from cheap existing editor seams, record the choice as
placeholder-for-user-refinement; (3) layout order buttons | DRAG
SEGMENT | close controls with a minimum draggable width that wins at
every pane size (buttons truncate first; planted zero-width red).

Full gate through the enforcing hook, no SKIP_GATE product commits;
both polarities per arm; frame quotes before/after; narrow-width
drives; both scales where the row renders at scale.

## Invariants in scope

panel/splitter records, editor records for the chosen button actions,
theme records (derive thickness + tones).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: three arms driven both polarities, GATE_EXIT=0 through
the hook, clean tree. The conductor gates at landing.
