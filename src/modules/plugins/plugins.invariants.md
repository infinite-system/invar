# Plugins — Module Invariants

Load-bearing rules for provider exchange between peer plugins. This contract governs
`src/modules/plugins/ProviderRegistry.ts` and every plugin that publishes or resolves a
capability through it. It stands on `project.invariants.md`, especially *Plugin boundaries
grant one authority* and *Seams are drawn at the shared generator*.

## Reality-based invariants

### Peer plugins can have different lifetimes

**Invariant:** If two plugins cooperate, then either plugin can be absent, disabled, or
reinstalled while the other plugin and its workspace remain alive.

**Scope:** Application contributor installation, per-workspace attachment, Extensions
disable, and Extensions reinstall.

**Renegotiable at:** The plugin model. This changes only if plugins stop being independent
installable contributions.

**Mechanism:** The manifest activates each contributor separately. The Extensions pane can
dispose and reconstruct one contributor without reconstructing its peers or the workspace.

**Generates:** Reversible registrations; explicit absent-capability states; consumers that
re-resolve after provider changes.

**Evidence:** `src/modules/app/ApplicationContributions.ts`;
`src/modules/plugins/ExtensionsPlugin.ts`;
`scripts/harness/smoke-plugin-manifest-harness.ts`.

**Impossible if true:** A peer consumer holding a provider after its plugin is disposed; a
provider reinstall that requires a workspace restart.

**Verification:** `bun scripts/harness/smoke-plugin-manifest-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

## Chosen invariants

### Provider rendezvous is host carried

**Invariant:** If one workspace plugin provides a capability to another, then the workspace's
single `ProviderRegistry` carries their rendezvous by capability identifier. The registry is
generic and type-blind. The consumer owns the provider interface. Registration returns the
withdrawal operation, and a registry revision causes live consumers to re-resolve.

**Scope:** `ProviderRegistry`, the registry instance on each `Workspace`, provider
registration, consumer resolution, and plugin disposal. The provider's domain behavior stays
outside the registry.

**Components:**
- *One host registry* — every workspace owns one registry and every peer provider uses it.
- *Consumer-owned type* — the registry stores `unknown`; the consumer supplies the generic
  type only when it resolves its own interface.
- *Last registration wins* — a later provider can substitute for an earlier provider without
  changing the consumer. Withdrawal reveals the earlier provider again.
- *Reactive withdrawal* — register, withdraw, and dispose advance the revision.

**Mechanism:** The host owns only identifier-to-value storage and lifetime. Providers register
when their workspace contribution attaches and call the returned disposer when it detaches.
Consumers watch the revision and resolve their own interface from the same workspace.

**Generates:** `ProviderRegistry`; `Workspace.providers`; one registration route for legacy
`WorkspaceContribution.providers`; structure, inline rewrite, and database provider wiring;
the structural rendezvous census.

**Rejected alternatives:** A registry inside each consumer module — duplicates the same
identifier, lifetime, and reactivity generator. A consumer that imports and constructs a peer
provider — fixes the implementation edge and prevents substitution. A typed union in the host
— makes the host name every consumer domain.

**Evidence:** `src/modules/plugins/ProviderRegistry.ts`;
`src/modules/workspace/Workspace.ts`;
`src/modules/lsp/LspWorkspaceProvider.ts`;
`src/modules/structure/StructureOutline.ts`;
`src/modules/inline-rewrite/InlineRewriteContributor.ts`;
`src/modules/database/DatabaseProviderPlugin.ts`;
`src/modules/database/DatabaseConsumerWorkspace.ts`;
`.invar/tasks/active/245-provider-seam-open-or-bless-decision/census-245-provider-rendezvous.ts`.

**Impossible if true:** A second provider registry; a peer consumer constructing a concrete
provider from another module; an uninstalled provider still resolving; the host importing a
consumer-owned provider interface.

**Verification:** `bun
.invar/tasks/active/245-provider-seam-open-or-bless-decision/census-245-provider-rendezvous.ts
--require-one`; `bun test src/modules/plugins/ProviderRegistry.test.ts
src/modules/structure/StructureOutline.test.ts
src/modules/inline-rewrite/InlineRewriteContributor.test.ts
src/modules/database/DatabaseConsumerWorkspace.test.ts`; and `bun
scripts/harness/smoke-plugin-manifest-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29
