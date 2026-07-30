# 311 — Vue SFC integration: MAP what's needed (pre-task, no implementation)

State: COMPLETED — cae53480 — Vue SFC integration map: architecture, phases, open questions for user review
Engine: codex
Effort: high
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> Another things, Vue script setup should know that are is typescript,
> <style> should know it's style, <template></template> that it's
> template but this is a big integration, cause you need full vue
> integration, so it's a bit separate task agent has to do, can you do
> a pre-task to map out what's needed first and then another task to
> implement it?

## Scope — RESEARCH AND MAP ONLY, ZERO product code

Deliverable: a written integration map that #312 implements from.

The map must cover, each section grounded in Invar's ACTUAL current
code (name the files/seams) and in the real Vue tooling ecosystem
(cite sources):

1. **Current state**: how .vue files behave today in Invar — syntax
   highlighting, LSP, structure pane, hover, diagnostics. Drive a real
   .vue file and quote what happens.
2. **Highlighting**: how the editor's grammar/tokenizer handles
   embedded languages today; what per-block language selection
   (script lang="ts" -> TypeScript, style [lang] -> css/scss,
   template -> vue-html) requires; whether the existing grammar system
   supports injections or needs a mechanism.
3. **LSP**: the Vue language server landscape (@vue/language-server /
   volar; typescript plugin vs takeover mode), what our per-workspace
   LspWorkspaceProvider needs to launch it, how it coexists with the
   TS server (which owns .ts files, who owns .vue script blocks),
   install/runtime prerequisites.
4. **Structure pane**: what symbols the Vue LS returns for SFCs and
   what the structure pane needs.
5. **Tasks/diagnostics wiring**: anything else touched (formatting,
   folding, breadcrumbs within blocks).
6. **Phasing**: ordered implementation plan for #312 — smallest
   shippable slice first (e.g. block-aware highlighting), then LSP,
   then structure — with per-phase acceptance drives and risks.
7. **Impossibility/boundary list**: what is explicitly OUT (e.g. no
   template type-checking in phase 1) so #312's scope is closed.

Relation: #283 (vue 3.6 rc2 upgrade) is a runtime-dependency task for
the app itself, unrelated to SFC editing support — keep them distinct;
note any true overlap in the map.

## Acceptance

The map lands as `project.vue-integration-map.md` in the task folder
(record commit only, no src changes), with every claim about current
behaviour backed by a driven quote and every ecosystem claim cited.
The user reviews the map BEFORE #312 dispatches.

## User's follow-up (verbatim, GOVERNS — added 2026-07-29)

> also full lsp support must be there, etc, so it's not a trivial one
> but will test our plugability for these kinds of features, so it must
> be cleanly pluggable as well

Map consequence: the map MUST include a **pluggability section** — Vue
support ships as a clean plugin through the existing plugin records
(runtime plugin seams, per-workspace LspWorkspaceProvider lifecycle, no
core special-casing for .vue anywhere). The map names every seam the
plugin attaches to and flags any seam that would force a core hack —
those seam gaps become explicit pre-work items in the phasing. Full LSP
support is in scope for #312's end state, phased per the map.
