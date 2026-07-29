# Brief — #289: preview scroll syncs with editor scroll (setting, default ON)

Read first: `.invar/tasks/in-progress/289-preview-scroll-sync-setting/task-289-*.md`
— the design is decided there; #286 LANDED (f7b2e202), its position map
and "Explicit jumps use one reading position" record are yours to
consume.

Short form: the pane receiving user input LEADS; the other follows; a
programmatic follow never re-triggers (the leadership rule kills the
feedback loop). `markdownPreviewScrollSync` contributed setting, default
true; OFF = full independence. Consume #286's source<->rendered map —
building a second map is the named seam failure. Exact at headings,
interpolated between.

Drive: wheel the editor at three depths — preview tracks; wheel the
preview — source tracks; toggle OFF — independence BOTH directions;
#286's jump smoke stays green. Positive control: break one follow
direction, red.

## Invariants in scope

- The markdown split record (extend with the leadership component);
  settings records; [#286's record](../../../../src/modules/text/text.invariants.md).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## End state (mechanical)

READY report: both directions driven, toggle both polarities, control
quoted, lint-task-links clean, green `bun test` + markdown smokes. The
conductor gates at landing.
