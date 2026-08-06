# 520 — drive session framed paste gesture

Priority: architecture-hygiene
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: medium

## In plain words

The drive layer has no paste gesture. A builder who wants to paste text in
a probe must call the low-level driver directly. Add one chainable gesture
so paste composes with the fluent chain like keys and clicks do.

## Evidence (from #513 builder instrument feedback, 2026-08-06)

- The #513 variation drive had to call `driver.sendPaste` directly because
  DriveSession has no chainable framed-paste gesture.

## Outline

Add `app.paste(text)` to DriveSession: bracketed-paste framing, correct
byte form, a condition wait after the gesture (the pasted text is visible
or the graph shows the input landed). Document it in drive-pty SKILL.md's
gesture table. Both polarities: a probe that pastes and sees the text, and
a control that proves the assertion can fail.
