# Brief 354-1 — the welcome screen mislabels Ctrl+P

## In plain words

The welcome screen says "Ctrl+P command palette", but Ctrl+P actually
opens Go to File. The command palette is F1. Fix the label to match the
real bindings, and drive the welcome screen to prove it.

## The deliverable, twice

CODE: the welcome text names the real default chords — Ctrl+P for Go to
File, F1 (VS Code parity: Show All Commands) for the command palette.
Verify the exact strings against KeybindingDefaults.ts, not memory.
VISUAL (conductor drives before landing): the welcome screen text reads
the corrected bindings at a couple of geometries.

## Evidence (three sightings)

- #351/#405/#510 bycatch: welcome says "Ctrl+P command palette"; a real
  Ctrl+P drive opens Quick Open; F1 opens the palette. Reproduced at
  100x30 and 60x15, and on later boots (the stale label reappears).
- Ground truth: KeybindingDefaults.ts — Ctrl+Shift+P was shadowed and
  never opened the palette; F1 is the retained palette chord.

## The bar

DRIVE the welcome screen and read the actual painted text before AND
after. Extend an EXISTING welcome/help smoke assertion (do not add a new
smoke). Both polarities on the assertion.

## Invariants in scope

Keybinding/help records in
[keybindings.invariants.md](../../../../src/modules/keybindings/keybindings.invariants.md)
and any welcome/help record — enumerate and answer; the fix likely just
corrects drifted copy.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
