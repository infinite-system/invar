# Task 483 — shortcut getters replace the chains

Priority: user-directed
State: COMPLETED — 7330851c — Landed: both phases of the conversion; the codebase now speaks activeEditor/activeDocument.
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high

## The user's direction (2026-08-03): "get both done intelligently"

Convert `workspaceSet.active.editor…` / `workspaceSet.active.document…`
chains to the #471 shortcut getters (`activeEditor`, `activeDocument`,
`activeLanguageProviderNotice`). Census at filing: 168 chain sites (154
outside tests), 6 shortcut users, 9 drive-path strings.

## Why (recorded so the diff has its reason)

Not aesthetics: (1) in this repo the code is the training set — builders
grep for precedent, and 154:6 teaches the chain as house style; (2) Demeter
— one concept should bind one structural fact, so a workspace-selection
restructure costs one getter body, not 154 edits; (3) one name for one thing
across app code, graph paths, smokes, and records. Getter indirection is a
single inlined prototype frame — negligible, no allocation, no new edges.

## The two phases, in order

1. **Harness and drive paths** (~20 sites): every graph-path STRING and
   smoke condition uses the short form. Zero app risk; do this first and
   run the touched smokes.
2. **App code, judgment-guided — NEVER a regex.** Per-site rules:
   - A site reading ONE concept converts to the shortcut.
   - A method touching SEVERAL `.active` members keeps (or introduces)
     `const workspace = this.workspaceSet.active` — repeated shortcuts there
     would be worse, not better.
   - Mint NO new shortcuts (no `activeEditorCursorLine` inflation); only the
     three that exist, plus a new one ONLY if a concept genuinely repeats
     10+ times (name it in the report for the user).
   - Mass-conversion doctrine: per-site proof — the full suite is not
     sufficient alone; eyeball every hunk in your own diff before commit.

## Verification

Phase 1 smokes green; `bun test` FULL; `bunx tsc --noEmit`; conventions
gate; checker --all/--refs; a final census in the report: chain sites
before/after, shortcut users before/after, sites deliberately KEPT with the
local-variable form (counted, not itemized). NO merge-gate; SKIP_GATE=1.
