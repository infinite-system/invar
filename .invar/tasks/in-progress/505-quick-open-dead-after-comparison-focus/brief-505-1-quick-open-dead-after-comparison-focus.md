# Brief 505-1 — Ctrl+P is dead while a comparison holds focus

## In plain words

Open a git comparison, give it focus, press Ctrl+P: nothing happens.
Quick Open should appear anywhere the app is not feeding keys to a child
terminal. Fix the chord routing hole and sweep one similar sighting.

## End state (mechanically checkable)

A report newer than dispatch; the reproduction drive (comparison focused,
Ctrl+P) opens Quick Open, ratcheted into a smoke; the Ctrl+Shift+O
sighting is fixed or refuted with evidence.

## Evidence

- #371 report bycatch (completed folder): "Control+p did not open Quick
  Open after the node_modules comparison gained focus" — loaded AND solo
  sequenced probes, same final state.
- #498's decisions table (completed folder): Ctrl+P is deliberately
  pane-owned for TERMINALS (a child consumes the readline byte). A
  comparison view has no child that consumes bytes — the chord dying
  there is a routing hole, not a design.

## The boundary (from #498 — use it, do not re-litigate it)

Pane-owned chords are legitimate ONLY where a child process consumes the
bytes. Draw the fix at that generator: any focused surface without a
byte-consuming child routes the global chords globally. Do not special-
case "comparison" — enumerate the surfaces (comparison, image viewer,
markdown preview, any read-only pane) and fix the class, driving each.

## Also sweep (one sighting)

#498 bycatch: Ctrl+Shift+O did not open the folder picker while Files
held focus (seen once). Verify and fix or refute with the same boundary.

## The bar

DRIVE ADVERSARIALLY per your fundamentals: reproduce first; fix the
routing class, not the symptom; drive the neighbors (terminal keeps its
pane-owned Ctrl+P — that MUST NOT regress; agent pane likewise; editor
Ctrl+P still opens Quick Open); both polarities on new assertions.

## Invariants in scope

- Keybinding/routing records in
  [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) and any
  chord-ownership record from #498's landing — enumerate and answer
  record by record. If the pane-owned boundary is recorded, this fix
  likely REFINES it (propose wording; do not apply without the report
  stating it).

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
