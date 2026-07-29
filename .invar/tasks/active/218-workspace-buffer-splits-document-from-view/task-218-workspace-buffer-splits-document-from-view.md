# 218 — a Workspace buffer becomes a document plus a view handle, not an Editor

State: ACTIVE
Created: 2026-07-29
Engine: claude
Environment: linux
Model: opus-5
Effort: high
Priority: architecture-hygiene
Assignment note: Capstone step 1 of 3 (from #122's sequencing). Strictly before #219.

## Outline

`Workspace.createEditor` is the sole creator of every buffer. `Workspace` casts
`buffers.activeBuffer` to `Editor.Instance` and reads `editor.document` to serve
LSP sync, hover, completion, and go-to-definition. The workspace cannot stop
depending on the editor until a buffer is a document plus a view, rather than an
`Editor`.

#122 took the first step: `TextDocument` lives in `src/modules/text/`, and
`DocumentHandle` + `LanguageProvider.interface` already hold documents without
naming the editor. This task finishes the split inside Workspace.

Done-test: `src/modules/workspace/` has zero production imports of
`../editor/` (`Workspace.ts` currently imports `Editor` and
`EditorContributions`; `DocumentHandle.ts` imports `EditorFoldState`). Each
step must end in a working app — drive before and after, both scales, per
Rule Zero. The #202 warm-set contract (`bufferLiveCount === 2` at 3 clean
tabs) must hold unchanged.

## Sources

- `.invar/tasks/completed/122-editor-becomes-final-contributor/report-122-editor-becomes-final-contributor.md`
  — "What is left, and why it is not one task".
