# 256 — the source editor paints a stray glyph in the cell after an emoji

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: user-directed

## Outline

Bycatch of #236, reproduced twice, pre-existing (no preview involved):
open a file containing `| 漢字 | 🙂 é | 42 |` and boot with
`bun run drive --open <file> --geometry 120x40` — the boot frame's source
row paints `| 🙂t é |`: a stray `t` occupies the cell after the emoji.
Suspects named by the finder: the wide-glyph spacer cell, or syntax
highlighting applied on a surrogate pair (UTF-16 offsets bleeding into cell
placement — the same wrong-unit family #236's smoke fix and the FrameProbe
astral lesson both belong to).

Reproduce first, at both 120x40 and another geometry. Then bisect the
suspect list by observation (disable highlighting for the row; inspect the
spacer cell's contents). Fix at the generator: whatever maps string offsets
to cells for wide/astral glyphs must count code points or graphemes, never
UTF-16 units. Lock with a cell-level assertion on that exact fixture row.

## Invariants in scope

- The editor/text records naming grapheme-cell mapping (the creator
  invariant from #218's family); FrameProbe conventions if the lock uses it.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy — wrong-unit siblings especially; this family now
has three members in two days. The READY report carries `## Bycatch` even
if it reads `None observed`.

## Sources

- `report-236-...md`, Bycatch item 2.
