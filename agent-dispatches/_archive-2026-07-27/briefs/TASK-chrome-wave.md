# TASK — chrome wave: bottom-bar controls, agent footer, diff tab row (#115, #116, #119)

Work ONLY in `/tmp/conductor-chromewave` (branch `feat-chrome-wave`).
Do NOT run `scripts/merge-gate.sh`. Do NOT push, merge, tag, or delete branches — the
conductor lands work. Write your report to `/tmp/chrome-wave-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH`.

## ⚑ DRIVE IT FIRST

Open the real app in your own PTY and LOOK at each of the three surfaces before editing
anything. All three of these came from the user's own eyes, so your evidence has to be
the same kind: what the pane looked like before, what it looks like after. Screenshot-
equivalent frame captures in the report, not just assertion names.

Assertions prevent regression; they do not discover fixes. Write them last.

Drive **defaults first**. The user changes settings while chasing our bugs, so their
config is not the contract — defaults are what almost everyone sees.

---

## Part 1 — #115: panel controls belong to the BOTTOM BAR, not to each pane

USER, verbatim: *"on the bottom bar the close / expand buttons should be put to the whole
bottom bar beside it's separator, the split pane, can we have the split pane separator be
smaller then its total width and we put small add, expand, close buttons there, and then
the agent window does not need add, expand buttons, only the close button"*.

The panel-level controls — add `+`, expand/restore `↗`/`↙`, close `×` — move to the bottom
bar itself, placed on or beside the split-pane separator. Draw the separator **shorter
than full width** to make room for them. Individual panes then keep only their own close.

This is a de-duplication: the same three controls currently exist per-pane and at panel
level, which is why the agent pane carries buttons that act on something larger than
itself. One owner for a panel-level action.

Constraints: use the existing reserved heading-control glyphs, through the theme
vocabulary — never glyph literals in behaviour code. Hit targets stay mouse-routable and
must not shrink below what a mouse can reliably hit. Expand/restore SEMANTICS are
unchanged; only their home moves.

## Part 2 — #116: the agent footer must sit flush, unbolded, and never overflow

USER, verbatim (their message was cut off mid-word): *"Refine agent panel, the bottom
engine: codex/claude line should not have space at the bottom before the edge of the agent
window, also all the things in that line should not be bolded, also they should be reduced
because now when both terminal and agent panels are on, the text overflows under terminal
window, so it should have less things there, the sk"*.

Three fixes, all unambiguous:

1. the engine footer line sits **flush** with the pane's bottom edge — remove the trailing
   gap;
2. **nothing** in that line is bold;
3. the line's content is **reduced** so it cannot overflow under the terminal pane in a
   split layout.

On (3): keep the essentials — engine name and permission mode — and compact or drop the
rest. The line must **truncate gracefully at narrow widths**; painting under a neighbouring
pane is the actual defect and a width-driven assertion should make it impossible.

The user's sentence ends at `"the sk"` — most likely the skip-permissions / permission-mode
segment. Do NOT guess your way into removing something they wanted kept. Be conservative:
compact rather than delete, keep permission mode visible, and list in your report exactly
which items you dropped or shortened so the conductor can put the question to them.

## Part 3 — #119: reclaim the diff view's freed tab row and icon-ise change nav

USER, verbatim: *"git diff view now hides the file tabs bar -> as it should, but maybe now
that there are no tabs in git diff view, we shift the view 1 row up, where tabs where? Also
the top line becomes next/prev and open current, can we make those as symbols with
tooltips? maybe leave Open current but next prev, should be icons up and down and also move
them to the top right corder near open current"*.

1. **Layout** — with the tab bar hidden, reclaim the freed row: shift the comparison
   content up one row so no blank band remains where tabs were.
2. **Icons** — next/prev change navigation becomes one-cell up/down symbols **with
   tooltips** (the tooltip primitive already exists). Candidates `↑`/`↓` or `▲`/`▼`, chosen
   through the theme vocabulary. The glyph must be **width-proven single cell** — run it
   through the existing width-agreement instrument, because two glyphs already in this repo
   measure 2 and render 1, and that class of bug shifts every row that carries them. Do not
   collide with the reserved-mark table.
3. **Placement** — move the up/down icons to the **top-right**, adjacent to `Open current`,
   which stays textual.

Note the diff invariant *Base and current stay unambiguous* requires `Open current` to be
positioned WITH the right pane. Verify that corner placement still satisfies that record.
If it does not, refine the record honestly and say so — do not quietly weaken it, and do
not retire it.

---

## Scale parity

Drive each surface at both scales. A small file and a large file must feel and lay out the
same; the diff work especially should be checked on a large real file, not only a fixture.

## Bycatch

Report other bugs you notice while driving. Do not chase them. Fix one only if it is small,
obvious, clearly correct, and in a file you already touched — and list each such fix
separately so the conductor can split it out.

## Verification — quote exact exit codes

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, and the driven smokes for the surfaces you
touched. ONE verification pass at the end — do not run the full checker suite while
iterating, and never read `$?` after a pipeline.

Full descriptive identifier names (no abbreviations — `increment` not `inc`, `index` not
`i`), 80 columns, ivue conventions (subclass `$Class`, never `Class`). Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>` and leave the tree clean.
