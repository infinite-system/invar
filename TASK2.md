# TASK2 — Repair: completion popup fails to dismiss under your key-routing change

Gate + solo evidence (deterministic, both gate attempts + conductor solo): the completion smoke
times out on `status.completionOpen === false` in the MOCK-RUST phase — the popup opens, works,
and then never dismisses. Full logs: /tmp/merge-gate-failures/smoke-completion-harness-.log and
.attempt1.log, plus /tmp/ov-comp.log.

Hypothesis to verify (not to assume): your overlays-first key routing consults the exclusive
input-overlay slot BEFORE focused-pane routing. The completion popup is deliberately NOT a modal
overlay — the EDITOR keeps focus and dismissal (Escape / cursor moves) flows through the editor
path. If the completion popup now occupies or is shadowed by the exclusive slot — or your routing
bypasses the editor while any overlay-slot occupant exists — Escape no longer reaches the editor's
completion-dismiss handler. Find the actual drop point; fix so BOTH contracts hold: modal overlays
own the keyboard first (your fix — keep it), and the non-modal completion popup dismisses through
the editor path (its invariant). Then: completion smoke 3/3 solo quiet; the overlay Escape matrix
smoke still green; full instruments BY EXIT CODE; CLEAN TREE. Overwrite /tmp/wt-overlays-READY.md.
