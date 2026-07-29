# 245 — DECISION: open the host provider registry, or bless the consumer-owned rendezvous?

State: ACTIVE
Created: 2026-07-29
Engine: user
Environment: any
Model: n/a
Effort: n/a
Priority: architecture-decision

## Outline

The headline finding of #35 (the proof task). The host's provider registry is
closed to peers: `Workspace.provider(identifier)` and the `contributions`
list are `protected`. A plugin consuming another plugin's provider has no
public path. #35 needed exactly that (structure pane consumes the LSP
provider) and routed around it with the `RewriteProvider.interface`
precedent: the CONSUMER owns the interface
(`src/modules/structure/StructureSource.interface.ts` +
`StructureSources.ts`, a consumer-owned per-workspace reactive registry;
`LspWorkspaceProvider` registers on attach, withdraws on dispose).

The cost, named honestly in the report: the tree now holds TWO provider
rendezvous — the host's protected one and the consumer-owned one. Two
registries answering "who provides X" is generator drift in the making.

The decision (yours):

1. OPEN the host registry as a public generic seam — one rendezvous, host
   edit, #222/#223 territory.
2. BLESS the consumer-owned pattern as the convention for peer-plugin
   consumption — record it, and the host registry stays host-only.

#223 (database plugin proves the provider seam) is the natural proving
ground for whichever you choose; #222's analysis already maps the seam.

## Invariants in scope

- `src/modules/plugins/` convention records; `structure.invariants.md`;
  the #222 analysis documents.

## Bycatch expected

n/a — decision task.

## Sources

- `report-35-structure-navigator-plugin-pane.md`, "The seam finding" and the
  first Bycatch item.
