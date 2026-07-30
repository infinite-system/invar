# 323 — quit confirmation: modern dialog on Ctrl+Q/Cmd+Q (Yes/No, keyboard + mouse, close button)

State: active
Engine: codex
Model: 5.6-sol
Effort: high
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> Add are you sure you want to quit? Yes  No, when you click ctrl+q or
> cmd+q, must look like modern ui popup not y/N terminal thing, should
> be usable via keyboard and mouse by click and even have a close
> button at the top, make it look great, maybe say Invar at the top?

## Design

- Ctrl+Q / Cmd+Q opens a MODAL confirmation dialog through the existing
  overlay-dialog machinery (#303 just adjusted its margins — build on
  it; one dialog generator, no bespoke popup): title "Invar", body
  "Are you sure you want to quit?", buttons **Yes** and **No**, and a
  close control at the top (the shared close glyph from #316's token —
  never a literal x).
- Keyboard: Left/Right (and Tab) move between Yes/No with a visible
  focus state; Enter activates the focused button; Esc = No; pressing
  Ctrl+Q again while open should be decided + recorded (recommend: No/
  dismiss, so a double-tap never quits accidentally).
- Mouse: click Yes quits, click No or the close button dismisses,
  clicks outside the dialog are decided + recorded (recommend dismiss).
- Look: modern — rounded corners if the box-drawing generator carries
  them (#318 adds the rounded variant), themed tones (derive from
  theme; the dialog records own the tokens), centered, compact per
  #303's sizing law. Nerd + plain glyph tiers both render properly.
- Both polarities: Yes actually quits (process exit driven in PTY);
  No/close/Esc leaves the app running with state intact; the y/N
  terminal prompt (if one exists today) is GONE from the quit path;
  quit-with-unsaved-changes interaction: state what exists today and
  keep its protection (do not let the dialog bypass an existing dirty-
  file guard — compose them, decision recorded).

## Acceptance

PTY drives: keyboard-only path (open → arrows → Enter both answers),
mouse-only path (click Yes / No / close / outside), frame quotes of the
dialog in both glyph tiers and both themes, double-Ctrl+Q recorded
behaviour, dirty-buffer interaction stated + tested, both scales.
