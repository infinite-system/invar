# 245 — open the provider seam: one host registry, consumer-owned interfaces, proven by the database plugin

State: COMPLETED — b2bd2e57 — one registry census-proven; SQLite+fake+consumer proof; both workarounds deleted
Created: 2026-07-29
Decided: 2026-07-29 by the user (converted from decision to build; #223 folded in)
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: user-directed

## Outline

USER DECISION: open the host's provider registry as a public seam. The shape
is the synthesis, not a naive opening:

1. **The host carries the phone book, not the conversations.** Promote the
   mechanism `StructureSources` proved (register / resolve / withdraw-on-
   dispose, reactive, per-workspace) into the host as THE one generic
   provider registry, keyed by capability identifier. `Workspace.provider`'s
   protected internals stay protected; the host gains one small public seam.
2. **Interfaces stay consumer-owned.** The consumer states what it asks in
   its own `*.interface.ts`; the provider implements it; neither plugin
   names the other's concrete class; typing lives at the edges. The host
   never learns anyone's types.
3. **Both existing workarounds migrate and die.** `StructureSources`
   (structure pane) and inline-rewrite's construct-your-own
   `RewriteProvider` rendezvous both move onto the host registry and are
   deleted. Two patterns collapse into one blessed mechanism — reduction,
   not addition. A census proves no other rendezvous remains.
4. **The database plugin proves the seam (folded #223).** Build the small
   database-layer plugin from #223's scope: a provider interface (connect /
   query / describe) with at least two swappable implementations (sqlite
   real; one fake for tests), consumed by a peer plugin through the NEW
   registry only. The proof mirrors #35's: the plugin lands with zero host
   edits BEYOND the registry seam this task itself introduces, and both
   plugins uninstall/reinstall symmetrically (#35's smoke arm is the rig to
   extend).

Read `#222`'s analysis documents first (provider-seam analysis, slot vs
getter convention) and [report-35-structure-navigator-plugin-pane.md](../35-structure-navigator-plugin-pane/report-35-structure-navigator-plugin-pane.md)'s seam
finding — the cost and the escape are both named there.

## Invariants in scope

- `src/modules/plugins/` records — the contribution contract gains the
  registry record: *a provider rendezvous is host-carried, interface-blind,
  and withdraws on dispose*.
- [structure.invariants.md](../../../../src/modules/structure/structure.invariants.md) — the pane's source citation moves to the host
  registry; its records must survive the migration.
- The lsp records ([lsp.invariants.md](../../../../src/modules/lsp/lsp.invariants.md)) — `LspWorkspaceProvider`'s
  registration clause updates; host-never-imports-LSP stays untouched.
- [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — untouched; a diff there is a finding.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories — generator drift especially:
you are collapsing two rendezvous into one; any third rendezvous your census
finds is the exact drift this task exists to kill. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- [report-35-structure-navigator-plugin-pane.md](../35-structure-navigator-plugin-pane/report-35-structure-navigator-plugin-pane.md) — the seam finding.
- `.invar/tasks/retired/223-database-plugin-proves-provider-seam/` — the
  folded scope (retired with a pointer here).
- #222's analysis documents in its completed folder.
