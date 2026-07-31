# Task 414 — two invariant records cite files that no longer exist

Priority: architecture-hygiene
State: COMPLETED — 354d1527 — Repointed two rotted citations (PanelTabBar glyph vocabulary; text/TextDocument.ts). Claims verified true against current code; contract-only diff; checker fully green. Bycatch converted to #422 before landing.
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## Source

#413 bycatch (builder's parser resolved evidence across the whole
contract layer; each reproduced twice).

1. "Appearance is data with a capability fallback"
   (project.invariants.md) cites absent src/modules/ui/PanelHeading.ts.
2. "Undo records deltas not whole-document snapshots"
   (src/modules/editor/editor.invariants.md) cites absent
   src/modules/editor/TextDocument.ts — the implementation lives at
   src/modules/text/TextDocument.ts.

## Work

Re-resolve each citation to the current file/symbol (the claims appear
true; the pointers rotted). Propose-only per the invariants skill;
run the checker after. Note: the Invariant Field app (#413) ranks
dead evidence as outward drift — fixing these moves two dots inward,
a nice live demo of the instrument.
