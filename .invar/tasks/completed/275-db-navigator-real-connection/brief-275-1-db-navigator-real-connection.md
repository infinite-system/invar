# Brief — #275: the DB navigator connects to a real database (user-directed)

Read first: `.invar/tasks/in-progress/275-db-navigator-real-connection/task-275-*.md`.

One paragraph: #245 opened the provider seam with SQLite + fake + consumer
as PROOF. The user wants real use: connect to a USER-CHOSEN real database
from inside the app. bun:sqlite is the first-class target — open a real
.sqlite file (palette command + path input through the shared single-line
field painter, or a connection setting — argue which), browse schema
(tables, columns, indexes), bounded row preview (paged, never an unbounded
SELECT), disconnect/reconnect. Errors state themselves in-pane (bad path,
locked, not-a-database) — never blank. Paths only in settings, no secrets.
Network engines (Postgres/MySQL) are OUT of scope — name the seam they
would plug into.

The provider seam stays honored: host ProviderRegistry type-blind,
interfaces consumer-owned, census still counts ONE rendezvous
(`bun .invar/tasks/completed/245-*/census-245-provider-rendezvous.ts
--require-one` stays green). Uninstall symmetry per the manifest smoke.

Verify by DRIVING: the smoke creates a real sqlite file with tables/rows,
connects through the user's own gesture, walks schema, reads a page,
disconnects. Positive controls: a corrupted file shows the stated error
(not blank); the paged preview never grows past its bound on a large
table.

## Invariants in scope

- [plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md) rendezvous records (#245/#238's components); the
  database plugin's record (author or extend, argued); settings records
  if a key is added.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## End state (mechanical)

READY report in the task folder: the gesture, schema walk + paged preview
driven with evidence, both positive controls quoted, census green, green
`bun test` + manifest/db smokes. The conductor gates at landing.
