# Brief 522-1 — the drive-layer instrument batch (four items, one surface)

## In plain words

Four small improvements to the same drive layer, batched into one task:
a scoped text click for duplicate glyphs, a paste gesture, modified-key
chords, and an honest --reload --size flag. Each has both polarities.

## The deliverable, twice

CODE: the four items below in DriveSession/HarnessInput/drive server.
VISUAL: none (agent-facing instrument). Document every new verb in
[.claude/skills/drive-pty/SKILL.md](../../../../.claude/skills/drive-pty/SKILL.md).

## Items (each task file carries its evidence; read all four)

1. [#522 scoped clickText](task-522-drive-scoped-text-click-gesture.md):
   optional scope (rectangle, named band, or occurrence index) so a
   probe can click the SECOND of two identical glyphs. Gesture stays
   real (move, hover, click). Positive control: click the second of two
   identical glyphs and prove the right one activated; negative arm:
   unscoped stays first-match.
2. [#520 paste gesture](../../active/520-drive-session-framed-paste-gesture/task-520-drive-session-framed-paste-gesture.md):
   chainable app.paste(text) with bracketed-paste framing and a
   condition wait; composes with the fluent chain.
3. [#527 modified key chords](../../active/527-harness-modified-key-chords/task-527-harness-modified-key-chords.md):
   HarnessInput support for modifier+key chords (Control+Shift+Enter
   class) with correct byte forms; a probe proves the chord fires an
   existing shortcut; unsupported chords still refuse loudly.
4. [#541 reload fixture size](../../active/541-drive-reload-fixture-size/task-541-drive-reload-fixture-size.md):
   --reload honors --size (rebuild the fixture) or refuses loudly —
   the silent no-op is the defect. Both polarities.

## The bar

One surface, one seam family — no parallel layers; every verb
primitive (coordinates, text, keys — no app verbs); each item's
positive control planted and shown red before trusted; full bun test +
the smokes that consume changed harness files.

## Invariants in scope

None (harness-only; the founding harness invariant — input travels as
real PTY bytes — binds every item; state conformance).

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
