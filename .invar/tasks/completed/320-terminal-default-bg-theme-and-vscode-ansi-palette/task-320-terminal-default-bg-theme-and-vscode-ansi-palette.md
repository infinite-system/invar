# 320 — terminal: default background from OUR theme; ANSI palette brightness like VSCode

State: COMPLETED — c8c8723a — terminal defaults + ANSI palette theme-derived, VSCode model; child-explicit lanes stay exact (landed in #320 bundle merge f64f85ef)
Engine: codex
Model: 5.6-sol
Effort: medium
Provenance: USER-DIRECTED 2026-07-29 (correction on landed #315)

## User's words (verbatim, GOVERNS)

> ok claude colors restored, but only thing wrong is background should
> be ours, right now background became black which is not our theme,
> this is for claude in terminal, terminal itself also black background
> -> should not be and the colors still look a bit off for oh my zsh
> tui-editor git:(main), in vscode git:(main) is much lighter blue than
> the one i see in Invar, as well as tui-editor is a lighter green than
> i see in invar

## Design

#315 correctly stopped re-theming child-REQUESTED colors, but it took
"fixed xterm defaults" too far on two axes. VSCode's actual model (the
user's reference): the THEME supplies the terminal's default background
and a per-theme 16-slot ANSI palette; only cells where the child names
a color keep exactly what it named.

1. **Default background**: cells with no child-specified bg render the
   Invar theme's terminal background (derive from theme; if the theme
   lacks a distinct terminal.background token, add one deriving from
   the panel/editor bg — record the decision). Same for the default
   foreground: a theme-supplied terminal default fg (VSCode has
   terminal.foreground), not hard #c0c0c0.
2. **ANSI 16 palette**: adopt VSCode's default palette values (their
   documented defaults, e.g. brighter blue #2472c8, green #0dbc79 —
   CITE the actual source list) as theme-derived tokens — themable per
   theme, defaulting to the VSCode set. robbyrussell's `git:(main)`
   then shows the lighter blue/green the user sees in VSCode.
3. **Unchanged**: 256-color + truecolor stay byte-exact from the child;
   an ANSI slot the child sets via OSC 4 also stays the child's.

Both polarities: default-bg cell tracks a live theme switch; a
child-requested truecolor/256 cell does NOT; ANSI slots render the
palette tokens (planted divergence red); the #315 contract updates
rather than reverts — the boundary stays "chrome vs child", only the
DEFAULT/PALETTE sourcing moves from fixed-xterm to theme.

## Acceptance

Real oh-my-zsh drive: `git:(main)` blue/green match the VSCode default
palette values; real Claude drive: default bg equals the theme terminal
background, its explicit whites stay white; theme switch recolors
defaults + palette, never child-explicit lanes; both scales.
