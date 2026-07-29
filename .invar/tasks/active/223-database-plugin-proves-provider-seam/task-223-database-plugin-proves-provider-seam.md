# 223 — a database plugin proves the provider seam (sqlite first, pg second)

State: ACTIVE
Created: 2026-07-29
Engine: claude
Environment: linux
Model: opus-5
Effort: high
Priority: architecture-hygiene
Assignment note: The revamp, tried on a citizen that needs it. Strictly after #222 (uses its convention + interface sketch).

## Outline

The provider-seam revamp, scoped to a plugin that genuinely needs multiple
providers instead of a repo-wide sweep. A database layer: one `DataStore`
interface, engines as swappable providers, per-connection selection through
the getter seam (the user's SourceControl example, made real).

Why this citizen (user-chosen 2026-07-29):
- **Greenfield consumer.** A schema tree and query pane are new surfaces, so
  the seam is tested clean, with no retrofit archaeology.
- **Genuinely divergent providers.** Dialects and transports differ, which
  stress-tests interface honesty — the seam fails loudly if pg or sqlite must
  fake the other's semantics.
- **Three transports in principle**: sqlite is an in-process FILE (openable
  from the file tree — a real feature on day one, no server); pg is network.
  mysql adds no new structure and waits.

Order:
1. sqlite provider + schema/query pane, through #222's `DataStore` interface.
   This proves the seam SHAPE. The pane is a contributor per #103's taxonomy;
   the provider registers like the LSP one.
2. pg provider. This proves the SWAP: per-connection provider selection at the
   getter, slot as default, two connections with two providers live at once.
3. Convert only the effectful namespaces this plugin consumes (per #222's
   minimal set — likely Files, Processes, Clock), each with the gate rule and
   its positive control.

Constraints: uninstall symmetry from day one (Wave B's releasePane precedent);
the interface derives from what the pane asks, never from an engine's feature
list; a `datastore.invariants.md` records the seam's impossibilities; drive
the real path at both scales where documents are involved.

## Sources

- #222's deliverables (convention text, interface sketch, minimal set).
- Session discussion 2026-07-29.
