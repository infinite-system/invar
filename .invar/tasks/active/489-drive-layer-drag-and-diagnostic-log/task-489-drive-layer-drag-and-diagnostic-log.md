# Task 489 — drive layer: drag primitive and first-class diagnostic log

Priority: architecture-hygiene
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
State: ACTIVE

## In plain words

Two asks from the #487 builder. First: selecting text by mouse drag
needs raw-driver calls today; DriveSession should have a drag verb.
Second: the warm driver silently replaces an inherited TUI_LOG_PATH
with its own diagnostic path, and nothing on DriveSession exposes it;
structured-log probes should be first-class.

## Wanted (verbatim class from report-487 Instrument feedback)

1. A primitive DriveSession drag operation (press, glide, release —
   humanPace-aware) so transcript selection needs no raw-driver calls.
2. A diagnostic-log path getter and a tail/read method on DriveSession
   that exposes the warm driver's actual log path (and documents the
   TUI_LOG_PATH replacement in the drive-pty skill).
3. Also from #487: a note in the skill that broad findText needles
   (like the composer prompt glyph) can match other surfaces first —
   prefer narrow visible text.

## Additional ask from #458 (2026-08-03)

CONFUSING: chaining type() with waitForRepaint() can miss the repaint
type() already caused (pre-satisfied class). Document in the drive-pty
skill: prefer a visible-text condition (waitForText('$ xy')) over a
bare repaint wait after input.

## Additional ask from #491 (2026-08-03)

MISSING: a drive primitive `--setting KEY=VALUE` that holds one user
setting fixed without hand-building a temporary home + settings file.

## Additional ask from #356 (2026-08-03)

MISSING: a first-class negative screen condition — wait until text or
a control is ABSENT (builders currently improvise with final snapshots
and missing status keys). Also document: panelActiveContentKind
persists while hidden; the close condition is panelVisible === false.

## Additional ask from #356 round 2 (2026-08-03)

MISSING: the one-shot drive CLI needs a narrow-output option for
selected status fields (a two-key probe prints hundreds of status
lines; the fluent driver has show, the CLI has nothing). Also note:
status waits use JSON quoting — panelActiveContentKind="agent", not
'agent'.
