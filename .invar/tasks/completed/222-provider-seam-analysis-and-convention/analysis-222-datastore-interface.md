# 222 — the `DataStore` seam for #223, derived from what the panes ask

Two consumers drive this sketch: a schema TREE and a query PANE. I read no engine feature list
while writing it. The engines appear only at the end, where I name the risk of a dishonest
interface.

The method is #218's. Write what the consumer asks for. Then check that no provider has to
suppress it.

## What a schema tree asks

The model in this repo is `src/modules/filetree/FileTree.ts`. Read it before writing the tree.
Its properties are already the answer:

- Children are read only when a node is expanded (`FileTree.ts:19`, the listings cache).
- The visible list is a flattened plain getter over expansion state, not a reactive node per
  item.
- It cites *Cost tracks the actively observed set* (`project.invariants.md`) at
  `src/modules/filetree/FileTree.ts:11`.

A schema tree asks the same four questions and no others:

1. What are the roots of this connection?
2. What are the children of THIS node, when the user expands it?
3. What do I paint on this row: a name, a kind, and an optional detail?
4. May this node have children, so I can draw the twisty before I ask?

It never asks for the whole schema. A database with 4,000 tables must cost the same as one with
4, which is the invariant this editor is named for.

## What a query pane asks

1. Run this text. Tell me when it is running, and let me stop it.
2. Give me the column headings.
3. Give me the rows for the range I am painting, not all of them.
4. If it failed, give me a message and, if you have one, a position in my text.
5. Tell me what it changed when there are no rows to show.

Point 3 is load-bearing. A pane that paints 40 rows must not hold 1,000,000. The seam is a
CURSOR, not an array. This is the single decision that makes the whole design either honest or
useless at scale.

## The sketch

`src/modules/datastore/DataStore.interface.ts`. Names are full and descriptive per the naming
convention. `Ref` types come from vue, as everywhere else in the tree.

```ts
/** What the host knows about a place to connect. sqlite is a FILE, pg is a NETWORK ENDPOINT, so
 *  the descriptor is a discriminated record, never a URL string every provider re-parses. */
export interface DataStoreDescriptor {
  /** Stable identity inside the workspace, allocated by the host. */
  readonly identifier: string;
  /** User-facing name shown on the tree root and the pane heading. */
  readonly label: string;
  /** Which provider claimed it, resolved once at connect time. */
  readonly providerIdentifier: string;
  /** An absolute path for a file-backed store, else null. */
  readonly filePath: string | null;
  /** A connection string for a network-backed store, else null. */
  readonly endpoint: string | null;
}

/** One live connection. A resource with a lifetime, so it has one owner and one dispose. */
export interface DataStoreConnection {
  readonly descriptor: DataStoreDescriptor;
  /** 'connecting' | 'ready' | 'failed' — the pane paints from this and never guesses. */
  readonly state: Readonly<Ref<DataStoreConnectionState>>;
  /** The failure text when state is 'failed'. Null otherwise. */
  readonly failure: Readonly<Ref<string | null>>;

  // --- the schema tree's four questions ---------------------------------
  /** The top nodes. A pg connection returns its schemas. A sqlite file returns its one database. */
  roots(): Promise<readonly DataStoreNode[]>;
  /** Children of one node, read when the user expands it and never before. */
  children(node: DataStoreNode): Promise<readonly DataStoreNode[]>;

  // --- the query pane's five questions -----------------------------------
  /** Start one statement. Resolves when the first rows are available, not when all are. */
  execute(statementText: string): Promise<DataStoreResult>;

  /** Release the connection and every cursor it opened. */
  dispose(): void;
}

/** One row of the schema tree. Recursive by construction: the DEPTH is not fixed, because pg
 *  nests database → schema → table → column and sqlite nests file → table → column. A fixed
 *  three-level shape would make one of them invent a level. */
export interface DataStoreNode {
  /** Stable reference the provider understands. Opaque to the tree and to the host. */
  readonly reference: string;
  /** What the row says. */
  readonly name: string;
  /** 'schema' | 'table' | 'view' | 'column' | 'index' | 'other' — chooses the glyph only. */
  readonly kind: DataStoreNodeKind;
  /** Optional right-hand detail: a column's engine type, a table's row estimate. Free text. */
  readonly detail: string | null;
  /** True when the tree may draw a twisty. False ends the branch with no round trip. */
  readonly mayHaveChildren: boolean;
}

/** The result of one statement. A CURSOR, never an array. */
export interface DataStoreResult {
  /** Column headings, in order. */
  readonly columns: readonly DataStoreColumn[];
  /** Rows known so far. Grows as `fetchThrough` pulls more. -1 is never returned. */
  readonly loadedRowCount: Readonly<Ref<number>>;
  /** The total when the provider knows it, else null. pg knows after the last row. sqlite knows
   *  only by counting, so null is the honest answer while a cursor is open. */
  readonly totalRowCount: Readonly<Ref<number | null>>;
  /** True while more rows may arrive. */
  readonly hasMore: Readonly<Ref<boolean>>;
  /** Rows in [firstRowIndex, lastRowIndex]. Already-loaded rows return without a round trip. */
  rows(firstRowIndex: number, lastRowIndex: number): readonly DataStoreRow[];
  /** Ensure rows up to this index are loaded. The pane calls it for the range it is about to
   *  paint. Resolves when they are, or when the result ended first. */
  fetchThrough(rowIndex: number): Promise<void>;
  /** Rows affected when there is no row set (INSERT, UPDATE, DDL). Null when the statement
   *  returned rows. */
  readonly affectedRowCount: number | null;
  /** Stop the statement. Both providers must implement it for real. See the risk list. */
  cancel(): void;
  /** Release the cursor. */
  dispose(): void;
}

export interface DataStoreColumn {
  readonly name: string;
  /** The engine's own type name, VERBATIM, for display. `integer`, `text`, `jsonb`, `BLOB`.
   *  Never mapped to a shared enum. See the risk list. */
  readonly engineTypeName: string;
  /** The only shared fact the pane needs: right-align numbers, left-align everything else. */
  readonly alignsRight: boolean;
}

/** One row, already rendered to display strings by the provider. The pane paints cells and does
 *  no value conversion, so a NULL, a blob, and a JSON document each look right without the pane
 *  learning any engine's value model. */
export interface DataStoreRow {
  readonly cells: readonly string[];
}

/** A statement failure with an optional caret into the user's own text. */
export interface DataStoreFailure {
  readonly message: string;
  /** Zero-based offset into the statement text, when the engine reports one. */
  readonly offset: number | null;
}
```

And the provider seam, shaped after `src/modules/lsp/LanguageServerProvider.interface.ts`, which
is nineteen lines and does exactly this job:

```ts
export interface DataStoreProvider {
  /** 'sqlite', 'postgres'. Stable, and what a descriptor names. */
  readonly identifier: string;
  /** Can this provider serve this descriptor? sqlite claims a path ending in .db / .sqlite /
   *  .sqlite3. postgres claims a postgres:// or postgresql:// endpoint. */
  supports(descriptor: DataStoreDescriptor): boolean;
  /** Open a connection. Rejects only on a programming error. A refused login resolves to a
   *  connection whose state is 'failed', because the pane must paint the failure. */
  connect(descriptor: DataStoreDescriptor): Promise<DataStoreConnection>;
}
```

## Where per-connection provider selection sits

**At the getter, inside a factory, exactly like `src/modules/narration/TtsFactory.ts`.** That file
is the pattern already alive: two provider getters at `:15` and `:19`, and one `createBackend` at
`:26` that reads `process.env.INVAR_TTS_BACKEND` to choose. `DataStoreFactory` is the same object
with a descriptor instead of an environment variable.

```ts
class $DataStoreFactory {
  protected get SqliteDataStoreProvider() {
    return SqliteDataStoreProvider.Class;
  }

  protected get PostgresDataStoreProvider() {
    return PostgresDataStoreProvider.Class;
  }

  protected get providers(): readonly DataStoreProvider[] {
    return [new this.SqliteDataStoreProvider(), new this.PostgresDataStoreProvider()];
  }

  connect(descriptor: DataStoreDescriptor): Promise<DataStoreConnection> {
    const provider = this.providers.find((candidate) => candidate.supports(descriptor));
    if (!provider) throw new Error(`No data-store provider claims ${descriptor.label}`);
    return provider.connect(descriptor);
  }
}

export namespace DataStoreFactory {
  export const $Class = Static($DataStoreFactory);
  export let Class = $Class;
}
```

Two connections on two engines are then live at once, with no shared mutable state between them.
The factory makes the choice once per descriptor. The connection object carries it.

**And the `Class` slot is the global default.** `DataStoreFactory.Class` is what an unqualified
connection uses. A kernel, a plugin, or a whole-app test installs a different factory there and
every connection that did not choose gets it. The slot answers "what does this process do by
default". The getter answers "what does THIS connection do". #223 step 2 must prove the swap
WITHOUT touching the slot. If it cannot, the seam is in the wrong place.

This is the same split the whole convention rests on. See `analysis-222-convention.md`.

## What `src/modules/datastore/datastore.invariants.md` should record

Five records. Names are declarative and unnumbered, per the contract schema.

**A result set is larger than the pane and may be larger than memory** (reality). If a query
returns rows, then the count is bounded by the data and not by the display, so a pane that holds
every row is bounded by the query and not by the viewport. *Impossible if true:* a seam method
that returns `readonly DataStoreRow[]` for a whole result; a pane whose memory grows with the row
count rather than the viewport height; a scroll to row 500,000 that costs a re-run.

**Schema shape is discovered lazily** (chosen, standing on *Cost tracks the actively observed
set*). If the tree shows a node, then only its own row has been read, so an unexpanded subtree
costs nothing. *Impossible if true:* one round trip that reads every table and column at connect;
a connect time that grows with schema size.

**A statement is a failable external call that can outlive its pane** (chosen, standing on *An
async result can outlive the state it described* and *Language and git tools are separate failable
processes*). If a statement is running, then its result may arrive after the pane closed, the
connection dropped, or a newer statement started, so every result is revision-stamped and a stale
one is discarded. *Impossible if true:* a closed pane painting a late result; a second query's
rows appearing under the first query's headings.

**A column's type belongs to its engine** (reality). If a provider reports a column type, then it
is that engine's own type name, because no shared type lattice contains both sqlite's dynamic
storage classes and pg's static type system without one of them lying. *Impossible if true:* a
shared `DataType` enum; a sqlite column forced to declare a static type it does not have; a pg
`jsonb` column displayed as `text`.

**A connection is released with the plugin that opened it** (chosen, standing on the uninstall
symmetry Wave B set with `releasePane`). If the data-store plugin is disabled, then every
connection and every open cursor it created is closed. *Impossible if true:* a disabled plugin
holding a live socket or an open database file; a pane still painting rows from a connection
nobody owns.

## Where the interface-honesty risk is highest

Convention 2's tell: if a provider must SUPPRESS the seam's core to fit, the interface is wrong.
Four places where that will fire in #223, ranked by how likely they are to break the seam.

**1. The column type. Highest risk, and the design above already refuses it.** sqlite has dynamic
per-value typing and five storage classes. pg has hundreds of static types plus arrays, ranges,
and composites. Any shared `DataType` enum forces sqlite to invent static types it does not have,
or forces pg to flatten `jsonb`, `uuid`, and `timestamptz` into `text`. Both are suppression. The
sketch keeps `engineTypeName` as free display text and reduces the shared fact to one boolean the
pane actually needs. Watch for the pull to "just normalise it a bit". That is where the seam dies.

**2. The schema hierarchy depth.** pg nests database, schema, table, column. sqlite nests file,
table, column, with `main` and `temp` as attached databases rather than schemas. A tree interface
with three named levels makes the sqlite provider publish a fake schema node. The sketch answers
with a recursive `children(node)` and a `kind` that only picks a glyph. If #223 finds itself
adding `schemas()`, `tables(schema)`, `columns(table)`, stop. That is the fixed-depth shape
returning through the back door.

**3. Cancellation.** The pane needs it at scale, so `cancel()` is core, not peripheral. pg cancels
out of band on a second connection. sqlite interrupts in process. VERIFY BOTH CAN, in #223 step 1,
before the interface promises it. A provider whose `cancel()` is an empty method is the tell
firing on the seam's own core. If only one can cancel, the honest shape is a separate
`CancellableDataStore` sub-seam, not a no-op.

**4. Multi-statement text.** A user pastes three statements and a semicolon. If `execute` returns
ONE result, a provider that produces several must drop or merge them. Decide at step 1 and write
it in the record. The recommendation is one statement per `execute`, with the split above the
seam, because that keeps both providers honest and makes the pane's own model simple.

A fifth, weaker one, listed so it is not rediscovered: **transactions**. Neither pane asks for
them. Leave them out. Adding a `beginTransaction` to the seam because an engine offers one is the
"derived from the engine's feature list" mistake this whole method exists to avoid.

## Two host facts #223 can rely on

- A plugin publishes its own observability keys without a host edit. `StatusSnapshot` in
  `src/modules/system/StatusChannel.ts:97` ends with `[key: string]: unknown`, and a plugin
  registers through `context.statusProjectionContributions.register`
  (`src/modules/app/ApplicationContributor.interface.ts:50`). So the driving verification needs no
  change to a host file, and no direct `StatusChannel` use.
- The panes are ordinary citizens. A schema tree is a `PaneContent`
  (`src/modules/ui/PaneContent.interface.ts`). The connection owner is a `PaneRuntime`
  (`src/modules/ui/PaneRuntime.interface.ts`), whose `PaneRuntimeHostPort.releasePane` is the
  uninstall symmetry the fifth invariant record needs. The plugin itself is an
  `ApplicationContributor` plus a `WorkspaceContributor`, exactly as
  `src/modules/lsp/LspPlugin.ts` is.
