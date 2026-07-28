# 35 — structure navigator pane

State: TODO — sequenced after the #114/#122 capstone
Created: 2026-07-28

## Outline

An outline/symbols pane — functions, classes, headings — as a sidebar citizen, with jump-to-symbol
carried by LSP `documentSymbol` through the existing provider seam.

### Its original purpose is spent; its new one is sharper

Conceived when the plugin canvas was new, explicitly as "the first new plugin citizen" — something that
was not an extraction, to prove the contribution contract on a genuinely new thing. That purpose has
since been served three times over by Git, Markdown, and FileTree.

**Its job now is the capstone's done-test.** User-sequenced 2026-07-27: it comes RIGHT AFTER the
modularity capstone (#114, then #122), and it docks in the RIGHT PANEL. The test is mechanical — *if
adding this pane requires touching the host, the capstone is not done.* That makes it worth more after
the capstone than before it.

### What it can reuse

The icon RESOLVER is shared: one generator maps "this filesystem entry, at this glyph tier" to a mark.
The tree asks it, the breadcrumb popup asks it, and the structure navigator asks the same one. This is
the property that made the `☰ ⑂ ⚲ ⚙` swap a one-line data edit rather than a hunt.

### The adjacent follow-up already designed

From the breadcrumb segment picker design: the LAST breadcrumb segment (the open file) should open
DOCUMENT SYMBOLS from the LanguageProvider — a natural pairing with this pane once `documentSymbol`
joins the contract. Explicitly marked do-not-build-now at the time.

Keep, low priority as a feature, but it has a real role in sequence.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
