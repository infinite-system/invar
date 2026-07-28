# TASK — Uniform one-cell file icons: retire the emoji-presentation glyphs (#107 + user finding)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-icons2`
(branch `fix-icon-uniformity`, forked from main at `1563456`). Do NOT run `scripts/merge-gate.sh`;
do NOT push/merge/tag/delete. Commit and report to `/tmp/icon-uniformity-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile` first.

## The user, verbatim (2026-07-26 ~19:55)

> "bun.lock icon is different from others and takes more space in file tree, convert to simple lock
> icon, also if there are other huge icons, replace them with small ones so everything looks uniform"

## The known mechanism (measured this morning — do not rediscover it)

The width-agreement instrument built for #89 (app `EditorCoordinates.lineWidth` vs
`@xterm/headless` `cell.getWidth()`, with a `漢`→2 positive control) found the app MEASURES `🔒`
and `🖼` at TWO cells while the terminal renders ONE. Both are enumerated as known exceptions in
that check (`ThemeIcons` area) so a third such glyph already fails the gate. Emoji-presentation
code points are the class: the app reserves a phantom column, so rows carrying them look oversized
and misaligned — exactly what the user sees on `bun.lock`.

## The work

1. **Sweep the ENTIRE icon vocabulary for the class, not just the two known instances.** Run the
   width-agreement check over every glyph in every tier of `ThemeIcons` (file-type map, activity
   row, marks, fold controls, breadcrumb set) and list every glyph where measured != rendered OR
   rendered width is 2 (double-width glyphs break tree uniformity even when measured correctly).
   The instrument exists — extend its coverage to the full vocabulary as a TEST so the class is
   closed permanently, not just today (a growing exception list means the authority is wrong).
2. **Replace every offender with a plain one-cell mark.** For `bun.lock` / lock files: a simple
   one-cell lock-like mark — candidates in preference order: `⚿` (U+26BF, key symbol-ish),
   `⌐` no; honestly evaluate candidates yourself against the constraints below and PROVE width.
   If no legible one-cell lock exists across tiers, a neutral file mark with the config-family
   color is better than an oversized emoji. For `🖼` (images): a one-cell pictorial mark, same
   constraints. Selection constraints (all earned this session): unambiguously ONE cell measured
   AND rendered (assert via the width-agreement check); no thin internal detail that vanishes at
   terminal size (killed ⊞); avoid the Geometric Shapes block (largely EAW-Ambiguous); no
   collision with the reserved-mark table (▎ ● ❯ • ↗ ↙ + × ◉ ⌄ ›) or the activity row
   (≡ ⑂ ⌕ ⚙ ⧫); marks come from the theme vocabulary, never literals in behavior code or tests;
   after the swap, sweep the BARE outgoing tokens (`grep -rn '🔒' src scripts` etc.) until only
   deliberate historical comments remain.
3. **Remove the two entries from the known-exceptions list** in the width check once fixed — the
   list should end EMPTY, and the check then fails on ANY future emoji-width disagreement, which
   retires the class. Keep the `漢`→2 positive control.
4. **Drive it**: open a fixture containing bun.lock, an image file, and ordinary files through the
   PTY driver; assert every tree row's filename column starts at the SAME column (uniformity is the
   user's actual acceptance test); breadcrumb popup rows likewise (it shares the icon set).

## Verification — exact exit codes

Full checker suite; the extended width test in the suite; the tree/breadcrumb uniformity drive 3x;
one loaded run; coverage declarations (counted grammar, APPEND). Update the theme invariant record:
the Open-question / exceptions text about 🔒/🖼 is RESOLVED — replace it with the closed-class
statement, per the never-delete-without-replacing rule.

## Rules

Full descriptive names, 80 columns, ivue conventions. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`; clean tree; no TASK files.
