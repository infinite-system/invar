# 222 — provider-seam analysis: where the getter seam is owed, and the convention text

State: COMPLETED — merged docs-only — classification (9 effectful, 2 pure), convention 12 + gate rule with 5 controls, DataStore cursor seam, minimal set 3 files; corrected the brief twice; bycatch filed as #224-#226
Created: 2026-07-29
Engine: claude
Environment: linux
Model: opus-5
Effort: high
Priority: architecture-hygiene
Assignment note: Analysis only — a design document and proposed convention text, no production code. Precedes #223.

## Outline

The user adopted the effect-seam rule in principle (2026-07-29 discussion):
access to effectful capabilities goes through a getter (per-region policy,
test doubles); pure generators are called as `X.Class` directly; the `let
Class` slot stays the global default. A full ~53-file conversion was judged
excessive up front. This task produces the analysis that makes the later
revamp (#223) narrow and correct.

Evidence base, already gathered shallowly:
- Direct `X.Class` production call sites: 752.
- Getter-wrapped: ~65, clustered at effect boundaries (Processes, Files,
  GitCommands, VoiceDiscovery, TTS backends) — agents invented the pattern
  under test pressure; TtsFactory is a settings-driven provider choice already.
- External direct users of effectful namespaces: Files 22 files, Logging 11,
  Clipboard 8, Processes 6, Environment 4, Clock 2.
- #218 added `SourceTextViewProvider` — the same pattern, invented again.

## Deliverables

1. **The classification**: every `src/modules/system/` + `storage/` namespace
   marked pure or effectful, with the criterion written down (does it touch
   process, fs, network, clock, audio, terminal). TextSegmentation, Momentum,
   UndoStore are pure — the folder does not decide, the effect does.
2. **The convention text**, ready to paste as AGENTS.md convention 12: getter
   for effectful, direct for pure, slot as global default, and the
   interface-honesty requirement (no provider may have to suppress the seam's
   core — the tell from convention 2).
3. **The gate rule design**: how conventions-gate flags direct external use of
   the enumerated effectful namespaces, with a positive control.
4. **The minimal conversion set**: which namespaces #223's trial actually
   needs (likely Files + Processes + Clock), ranked; the rest deferred with
   reasons. NOT a 53-file sweep.
5. **The trial seam shape** for #223: the `DataStore` provider interface
   sketch — what a schema/query consumer asks for, derived from consumer needs,
   not from any engine's feature list.

Use `bun scripts/ast-query.ts` for the census (parse, do not grep). The
deliverable is a document in the task folder plus proposed diffs, not merged
code.

## Sources

- Session discussion 2026-07-29 (user adoption, VFS parallel, SourceControl
  and database examples).
- `report-122-...md` and `report-218-...md` — the two folder-lies findings.
