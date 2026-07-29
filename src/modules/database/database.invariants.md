# Database — Module Invariants

Load-bearing rules for database provider exchange, bounded queries, lazy schema discovery,
and pane-owned connection lifetime. This contract governs `src/modules/database/`. It stands
on `project.invariants.md`, especially *Cost tracks the actively observed set*, and on
`src/modules/plugins/plugins.invariants.md`.

## Reality-based invariants

### Database answers can exceed the view

**Invariant:** If a database query can produce more rows than the pane can use, then the
provider must stop reading at the consumer's row limit and state whether more rows exist.

**Scope:** `DatabaseConnection.query`, SQLite statement iteration, and query result transport.
Schema descriptions use a separate lazy parent request.

**Renegotiable at:** The database API. The bound remains required if results move to a paged
or streaming transport.

**Mechanism:** A result set can exceed terminal memory and can be infinite in practical use.
The connection accepts `maximumRowCount`, iterates only through the first excluded row, and
returns `hasMoreRows`.

**Generates:** The bounded query argument; `hasMoreRows`; 20-row preview pages; no use of eager
`all()` for user query results; lazy `describe(parentReference)`.

**Evidence:** `src/modules/database/DatabaseProvider.interface.ts`;
`src/modules/database/SqliteDatabaseConnection.ts`;
`src/modules/database/DatabaseConsumerWorkspace.ts`;
`src/modules/database/SqliteDatabaseConnection.test.ts`;
`scripts/harness/smoke-database-harness.ts`.

**Impossible if true:** A user query materialized in full before the row limit is applied; a
truncated result that claims it is complete.

**Verification:** `bun test src/modules/database/SqliteDatabaseConnection.test.ts && bun
scripts/harness/smoke-database-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

## Chosen invariants

### Database files are user selected

**Invariant:** If the SQLite provider opens a file connection, then the user selected that path
through `Database: Connect`. The pane states the path, lifecycle state, schema, rows, or exact
connection error.

**Scope:** The database Command Palette actions, the path field, SQLite file connections, schema
navigation, row preview, reconnect, disconnect, and in-pane errors. PostgreSQL and MySQL are outside
this SQLite provider.

**Mechanism:** `DatabaseConsumerPlugin` registers connect, reconnect, and disconnect commands.
`DatabasePaneContent` edits the path with `TextInputModel` and `TextFieldPainter`.
`DatabaseConsumerWorkspace` resolves relative paths from the workspace, owns one observed
connection, asks for tables, columns, and indexes lazily, and keeps failures in reactive pane state.
`SqliteDatabaseProvider` rejects missing paths before SQLite can create an accidental empty file.

**Generates:** A user-selected file instead of the provider-seam memory proof; explicit open, close,
and reconnect actions; tables, columns, indexes, and pages in one pane; visible bad-path, locked-file,
and not-a-database failures. PostgreSQL and MySQL can implement the consumer-owned
`DatabaseProvider` seam without host changes.

**Rejected alternatives:** A fixed fixture path or `:memory:` connection on pane open — proves the
provider but cannot browse the user's database. A database path in settings — adds persistence and
stale-path policy when the Command Palette already supplies the direct gesture.

**Evidence:** `src/modules/database/DatabaseConsumerPlugin.ts`;
`src/modules/database/DatabasePaneContent.ts`;
`src/modules/database/DatabaseConsumerWorkspace.ts`;
`src/modules/database/SqliteDatabaseProvider.ts`;
`scripts/harness/smoke-database-harness.ts`.

**Impossible if true:** Opening the pane creates a proof table; a connection opens a path the user
did not choose; a corrupt file leaves a blank pane; disconnect retains an open connection; reconnect
silently changes the selected path; a password or network secret is written to settings.

**Verification:** `bun scripts/harness/smoke-database-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### Database providers meet through the host registry

**Invariant:** If a database consumer needs a connection, then it resolves the
consumer-owned `DatabaseProvider` interface from the workspace registry. A provider plugin
registers an implementation independently. Neither plugin imports the other's concrete class.

**Scope:** `DatabaseProvider.interface.ts`, `DatabaseProviderPlugin`,
`DatabaseConsumerPlugin`, and `DatabaseConsumerWorkspace`.

**Mechanism:** Stands on *Provider rendezvous is host carried*. The SQLite plugin registers
under `database`. The consumer resolves that identifier, calls the neutral connection API,
and reacts to registry revisions.

**Generates:** Separate provider and consumer manifest rows; SQLite substitution by registry
registration; a fake provider test that changes no consumer code.

**Rejected alternatives:** Constructing SQLite in the consumer — prevents provider
substitution and merges two plugin lifetimes. Adding database methods to `Workspace` — makes
the host own database vocabulary.

**Evidence:** `src/modules/database/DatabaseProvider.interface.ts`;
`src/modules/database/DatabaseProviderPlugin.ts`;
`src/modules/database/DatabaseConsumerWorkspace.ts`;
`src/modules/database/DatabaseConsumerWorkspace.test.ts`.

**Impossible if true:** `DatabaseConsumerWorkspace` importing `SqliteDatabaseProvider`; a
database provider remaining after its plugin is disposed; a fake requiring a consumer edit.

**Verification:** `bun test src/modules/database/DatabaseProviderPlugin.test.ts
src/modules/database/DatabaseConsumerWorkspace.test.ts`; and `bun
scripts/harness/smoke-plugin-manifest-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### Database connection cost tracks observation

**Invariant:** If the database pane is hidden, belongs to an inactive workspace, or its
workspace is suspended, then the consumer owns no database connection and performs no query
or schema request.

**Scope:** `DatabaseConsumerWorkspace`, the pane-observation predicate in
`DatabaseConsumerPlugin`, and workspace suspend, resume, and disposal.

**Mechanism:** One observation watch starts refresh only for the active visible database pane.
Every hidden, suspended, provider-changed, or disposed transition advances the request
generation and disposes the current connection. A late connection is disposed before it can
publish.

**Generates:** Lazy connection creation; connection disposal on every loss of observation;
generation guards; idle state while hidden.

**Rejected alternatives:** Keeping a connection per workspace while the pane is hidden —
pays resource cost for an unobserved feature. Opening a connection in pane rendering — puts an
effect in paint and cannot guard late answers.

**Evidence:** `src/modules/database/DatabaseConsumerWorkspace.ts`;
`src/modules/database/DatabaseConsumerWorkspace.test.ts`;
`src/modules/database/DatabaseConsumerPlugin.ts`.

**Impossible if true:** A hidden database pane retaining a connection; a response from an old
provider painting after replacement; a suspended workspace issuing a schema request.

**Verification:** `bun test src/modules/database/DatabaseConsumerWorkspace.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-29
