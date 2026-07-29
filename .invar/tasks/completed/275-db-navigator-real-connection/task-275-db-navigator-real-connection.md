# 275 — DB navigator connects to a real database

State: COMPLETED — f21d0a12 — DB navigator opens user-selected SQLite: schema walk + bounded row pages
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: USER-DIRECTED (2026-07-29 09:0x)

## Outline

User: "DB navigator extension should be able to connect to real db."

#245 opened the provider seam and proved it with SQLite + a fake +
a consumer. This task takes the database plugin from proof to real use:

1. **Real connection.** Bun ships `bun:sqlite` natively — a real SQLite
   file database is the first-class target (open a path, browse schema:
   tables, columns, indexes; row preview with a bounded page — never an
   unbounded SELECT). If the #245 proof already used bun:sqlite, the gap
   is the UX: connecting to a USER-chosen database file from inside the
   app (palette command + file picker / connection setting), not a
   fixture path.
2. **Connection lifecycle.** Open/close/reconnect; errors stated in-pane
   (bad path, locked file, not-a-database) — degrade honestly, never
   blank. No secrets in settings files for the SQLite arm (paths only).
   Postgres/MySQL need network drivers — OUT of scope unless trivially
   available; name the seam they'd plug into instead.
3. **Provider seam honored.** The host phone book (ProviderRegistry) stays
   type-blind; interfaces consumer-owned; the census still counts ONE
   rendezvous. Uninstall symmetry per the manifest smoke convention.

Verify by driving: create a real .sqlite file with tables in the smoke,
connect through the user's own gesture, walk the schema, read a row page,
disconnect. Positive control: a corrupted file must show the stated error,
not a blank pane.

## Invariants in scope

- The provider seam records from #245 (plugins.invariants.md rendezvous);
  the database plugin's own record (author or extend); settings records if
  a connection setting is added.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- User message 2026-07-29 09:0x; #245 completed report + census.
