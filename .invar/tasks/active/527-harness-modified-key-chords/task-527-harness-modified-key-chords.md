# 527 — harness modified key chords

Priority: architecture-hygiene
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: low

## In plain words

The drive harness cannot press chords like Control+Shift+Enter, so a
probe cannot reach shortcuts the app already has. Add modified-key
support to the input primitive.

## Evidence (from #521 instrument feedback, 2026-08-06)

- `HarnessInput` rejects a modified Enter chord such as
  `Control+Shift+Enter`; the #521 builder had to drive Replace All
  through its visible button instead of the existing shortcut.

## Outline

Extend HarnessInput with the correct escape-sequence byte forms for
modifier+key chords (CSI u / modifyOtherKeys as the app expects), expose
through the fluent layer, document in drive-pty SKILL.md. Both
polarities: a probe proving the chord fires the shortcut, and a control
proving an unsupported chord still refuses loudly.
