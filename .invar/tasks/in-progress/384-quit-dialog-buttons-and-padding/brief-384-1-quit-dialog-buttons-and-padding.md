# Brief #384 round 1 — quit dialog: bracketless buttons, padding

## The request (user, verbatim intent)

"our app looks like real vscode in terminal lmao, doesn't look like
terminal app at all" — and in that spirit: (1) the close dialog's
"[ Yes ] [ No ]" buttons lose the [ ] brackets; (2) "Are you sure you
want to quit" needs left/right padding — or the whole dialog text gets
more left/right padding — and maybe bottom padding too. Direction: less
terminal-ASCII decoration, more real-UI affordances.

## Method

Drive the quit dialog first (Ctrl+Q or the close path), look at it at a
couple of geometries, then restyle: buttons keep their hover/selection
affordance (background/accent treatment like the panel tabs) WITHOUT
bracket glyphs; inner padding on all sides that read cramped. Fix at the
SHARED dialog painter if one exists (census first — other dialogs with
the same [ ] button style should inherit the change; if the painter is
shared, name every dialog that changes with it). Contracts after the look
is right: exact-cell assertions for the button cells (no bracket glyph,
padded margins), hit geometry unchanged or updated coherently with paint.

## End state

Commit BEFORE READY; report in the main checkout's in-progress folder
for this task; header carries commit hash + GATE_EXIT read from the hook.

## Invariants in scope

- Splitter paint and hit testing share one geometry — [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — the same paint-equals-hit rule governs dialog buttons; if buttons shrink visually the hit area must stay coherent.
- Appearance comes only from theme data — [src/modules/theme/theme.invariants.md](../../../../src/modules/theme/theme.invariants.md) — button/padding styling comes from theme values, not literals.
- The overlay dialog records in [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) (grep for dialog/overlay) — answer whichever bind.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; carry the section even when it reads None
observed.
