# 219 — retrofit the source-text view onto the PaneContent seam

State: COMPLETED — 43b6002 — PaneContent grew native-surface (who paints); editor is a citizen via SourceTextPaneContent + PaneProjection; paint-then-selection ordering became a tested invariant; release path ready for #220; fingerprints unchanged at 10/100k/500k; boundaries filed as #228, #229
Created: 2026-07-29
Engine: claude
Environment: linux
Model: opus-5
Effort: high
Priority: architecture-hygiene
Assignment note: Capstone step 2 of 3. Strictly after #218. The hardest step.

## Outline

The editor is the only pane that is not a `PaneContent` —
`PaneContent.interface.ts` says so in its own header. `RootView` constructs
native OpenTUI renderables for it (BoxRenderable area, TextRenderable gutter,
SelectableText code body), attaches mouse handlers directly, drives native
selection through `codeBody.setSelectionRange`, and places the native terminal
caret from `EditorPane.visualPosition`.

Putting the editor on the seam means expressing the render, selection, caret,
and pointer path of the product's hottest surface through `PaneContent` —
including the native caret and native selection, which no current PaneContent
needs. Expect the seam to grow capabilities (per #114's pattern:
`capability<Port>`, `claimsContextAction`), not the host to grow branches.

Hazards, from the record: a rule that exists only implicitly dies in the
generalisation (#114 Wave B) — write the invariant before removing the branch
that enforces it. Scale parity is absolute here: the frame fingerprint
(documentLineReads 19-20, foldProjectionLookups 10, wrapProjectionLookups 2,
layoutComputations 1) must be identical at 10/100k/500k before and after.

## Sources

- #122's report, "What is left" — the native-renderable inventory.
