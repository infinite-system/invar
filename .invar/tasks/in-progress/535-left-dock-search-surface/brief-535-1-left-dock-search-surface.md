# Brief 535-1 — the left-dock Search surface (Find/Replace milestone 4)

## In plain words

Build the Search panel the user can see: an activity-bar icon, the
left-dock surface with query and filter inputs, live streaming results
as a tree with previews, and Search commands with their own chords.
Everything composes from the ui-design chapters. This is the visible
face of milestones 1-3.

## The deliverable, twice

CODE: the search plugin/contributor, activity item, settings order
migration, four TextInputModel fields (query, replace, include,
exclude), three toggles (Aa ab .*), virtual result tree with previews,
dismissal, selection, copy, scroll, Search commands with distinct
chords.
VISUAL (what the user must SEE, and what the conductor will drive
before landing): a Search icon in the activity bar; clicking it (or the
chord) opens the left-dock panel; typing a query streams results
grouped by file with match previews; clicking a result opens the file
at the match; the three toggles are visible buttons per the ui-design
button chapter; include/exclude fields behave per the shared input
model; on this machine (no ripgrep) the panel shows the honest
"Install ripgrep, make rg available in PATH, and restart Invar."
message — NOT an empty result list.

## Source of truth

[project-find-replace-design.md](../../../../project-find-replace-design.md)
sections 4 and 13 (Milestone 4), 14. Compose from the landed backend
(#534: WorkspaceSearchWorkspace per workspace, honest unavailable
state) — no second engine, no bypass of its cap/cancel/generation
semantics. Dialogs/buttons/inputs/scroll per
[.claude/skills/ui-design/SKILL.md](../../../../.claude/skills/ui-design/SKILL.md).

## Scope (Milestone 4 verbatim)

- Add the contributor, activity item, and settings order migration.
- Add all four `TextInputModel` fields and three toggles.
- Add the virtual result tree, previews, dismissal, selection, copy,
  and scroll.
- Add Search commands and distinct chords.
- Drive mouse and keyboard paths at small and large scale.

## The bar

DRIVE ADVERSARIALLY per your fundamentals: drive every path with mouse
AND keyboard at 10 and 100,000 lines; hover states and tooltips on
every new control (the ↥ lesson: a control with no observable effect on
hover AND click is a defect); the unavailable-state message must be
DRIVEN, not assumed; result-tree scrolling uses the shared momentum
(chapter 5) and copy (chapter 6); no logic in template-position
expressions; neighbor sweep (activity bar order, file tree, Quick Open,
find bar) after your changes. Both polarities on every new assertion.

## Invariants in scope

- [search.invariants.md](../../../../src/modules/search/search.invariants.md) —
  record by record; "Search results are click-set and highlight-shown"
  now gains its workspace surface — answer whether it refines.
- "Activity bar order is one persisted sequence"
  ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)) — the
  design requires a fixed Search slot + settings migration; this record
  is under known contract pressure (#515 report) — implement per design,
  declare the refinement in your report, PROPOSE the wording, do not
  rewrite the record silently.
- ui-design compliance is driven, not claimed.
- The design's four proposed records remain proposals.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
