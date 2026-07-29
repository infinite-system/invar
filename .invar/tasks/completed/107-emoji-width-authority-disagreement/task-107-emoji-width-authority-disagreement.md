# 107 — two icons measure 2 cells and render 1; swap glyphs or fix the authority

State: COMPLETED — glyphs swapped at 966c5d1; the exception list is now empty
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

Found by the width-agreement instrument (`EditorCoordinates.lineWidth` from OpenTUI versus
`@xterm/headless` `cell.getWidth()`, with a `漢`→2 positive control).

The app measures `🔒` and `🖼` at TWO cells while the terminal renders them at ONE. Same defect class as
`☰` (U+2630), which was swapped for `≡` because OpenTUI measured two where the terminal rendered one and
the activity bar shifted a column — except here the disagreement runs the other way, so the app RESERVES
space the glyph does not occupy and rows drift in the opposite direction.

Both instances are enumerated in the checker, so a THIRD such glyph now fails the gate. That is the right
ratchet, but the two enumerated ones are still live: the file tree and the breadcrumb popup mis-measure
any row carrying them.

Two options, and the choice needs a judgement call:
- swap both glyphs for single-cell marks that agree (consistent with the `☰`→`≡` and `⬢`→`⧫`
  precedents, and with the rule that the vocabulary owns appearance);
- or fix the WIDTH AUTHORITY so OpenTUI matches the terminal for emoji-presentation code points.

The second is the real reduction; the first is the cheap mitigation. **The enumerated-exceptions list is
itself the tell:** a list that grows is a signal the authority is wrong, not that the glyphs are unlucky.

## Sources

- [brief-107-1-emoji-width-authority-disagreement.md](brief-107-1-emoji-width-authority-disagreement.md)
