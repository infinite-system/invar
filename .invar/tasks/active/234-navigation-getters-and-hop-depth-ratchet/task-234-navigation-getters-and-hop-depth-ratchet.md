# 234 — navigation getters, owner shortcuts, and a hop-depth ratchet on census.sh

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Priority: architecture-hygiene

## Outline

User-identified pattern 2026-07-29, from `scripts/census.sh`'s finding:
deepest observed chain is 6 hops
(`this.deps.workspaceSet.active.editor.document.lineCount`).

The adopted rules (discussion on record this session):

1. A deep path read more than twice inside a class becomes a GETTER — never a
   captured local. A getter re-walks the live path per access, so reactivity
   tracking and freshness are identical to the long spelling; an alias local
   is what the no-alias rule forbids, and it stays forbidden.
2. A deep path spelled across CLASSES becomes a published shortcut on the
   owner one hop in (e.g. `workspaceSet.activeEditor`,
   `workspaceSet.activeDocument`) — N private getters for one walk are N
   copies of one generator.
3. Name the concept, not the route (`activeEditor`, not
   `workspaceSetActiveEditor`).
4. `census.sh` grows a hop-depth ratchet: deepest-observed may only shrink,
   report-only first (like the text-input census), with a positive control
   (plant a 7-hop chain, require the report to name it).

Constraint from the capstone: #218 made `Workspace.editor` return the
`SourceTextView` seam. Any published shortcut exposes the SEAM type, never
`Editor` — a convenience shortcut must not re-couple what #218/#219/#220
decoupled. Census first, conversions second: enumerate the >3-hop chains, rank
by spell-count, convert the top cluster, leave the tail to attrition under the
ratchet.

## Invariants in scope

- *Seams are drawn at the shared generator* (`project.invariants.md`) — rule 2
  above is its navigation corollary.
- The ivue reactivity conventions (`.claude/skills/ivue/`) — the getter-vs-
  alias distinction must be stated in whatever convention text this adds.

## Bycatch expected

Per AGENTS.md's taxonomy, all seven categories — distillation possibilities
especially: the hop census will surface repeated walks that are shared
generators in hiding. The READY report carries `## Bycatch` even if it reads
`None observed`.

## Sources

- User discussion 2026-07-29 (census.sh 6-hop finding, the getter question).
- `scripts/census.sh` output; `feedback-no-member-aliases` (the alias rule
  this refines, not repeals).
