# Brief — #222: provider-seam analysis and convention (ANALYSIS ONLY)

Read first:
1. [.invar/tasks/active/222-provider-seam-analysis-and-convention/task-222-provider-seam-analysis-and-convention.md](task-222-provider-seam-analysis-and-convention.md)
   — it carries the full deliverable list and the evidence gathered so far.
2. `report-122-...md` and `report-218-...md` in their completed folders — the
   two folder-lies findings this rule generalises.
3. `src/modules/narration/TtsFactory.ts` — the pattern already alive.

## Scope discipline

You produce DOCUMENTS and PROPOSED diffs. You merge no production code. Your
deliverables land in your task folder:

1. [analysis-222-classification.md](analysis-222-classification.md) — every namespace in `src/modules/system/`
   and `src/modules/storage/` classified pure or effectful, with the criterion
   stated once and applied uniformly. Census by `bun scripts/ast-query.ts`
   (parse, do not grep): per-namespace external direct-use counts, and which
   existing getters already wrap what.
2. [analysis-222-convention.md](analysis-222-convention.md) — the convention text ready for [AGENTS.md](../../../../AGENTS.md)
   (getter for effectful, direct for pure, slot as global default,
   interface-honesty requirement), plus the conventions-gate rule design with
   its positive control, plus the migration cost table.
3. [analysis-222-datastore-interface.md](analysis-222-datastore-interface.md) — the `DataStore` seam sketch for
   #223, derived from what a schema tree and a query pane ASK, not from any
   engine's features. Name the impossibilities a `datastore.invariants.md`
   would record. State where per-connection provider selection sits (the
   getter) and what the slot default means for it.
4. The MINIMAL conversion set for #223 with reasons, and the deferred rest
   with reasons. The user judged a 53-file sweep excessive; your job is to
   prove what the smallest honest first step is.

The interface-honesty tell binds everything: if a provider must suppress the
seam's core to fit, the interface is wrong — name where that risk is highest.

## Verification

Your census numbers must be reproducible: quote the exact ast-query
invocations. Where you claim a getter exists or a namespace is pure, cite file
and line. A claim without a path is a hypothesis; label it as one.

No production commits. Commit your documents in the task folder with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose per
[.claude/skills/ste-expression/SKILL.md](../../../../.claude/skills/ste-expression/SKILL.md), flavored. Report bycatch explicitly.
