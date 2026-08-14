# iv-harness invariants

The process-graph module: the development process (tasks, gates, lanes,
fleet) as a queryable graph. Spec seed: task #553 and the Invariant
Engineering paper (one authority, many projections).

## Reality-based invariants

### Only the files arbitrate process state

**Invariant:** If process state is derived from files that multiple writers
change independently, then only the files themselves (task folders, git
refs, gate logs) can arbitrate what is true — any in-memory model can be
stale the moment it is read.

**Scope:** Every consumer of harness state: this module, the fleet scripts,
the conductor.

**Mechanism:** Multiple sessions, builders, and scripts write the task
folders and logs concurrently with no shared process; an in-memory copy has
no invalidation channel.

**Evidence:** The conductor doctrine's resume protocol (state reconstructed
from disk after every compaction); fleet-watch derives its watch set from
disk every cycle.

**Enforcement:** review-time — the constraint is the absence of any cache
field, which has no single code locus.

**Impossible if true:** A correct harness design in which a long-lived
in-memory store is the authority and disk is written as its cache.

**Verification:** Inspection: `HarnessGraph` getters call the domain
readers on every access; no domain class holds a cache field.

**Status:** provisional

**Last refined:** 2026-08-14

## Chosen invariants

### The harness graph never imports from the app

**Invariant:** If a file lives under `iv-harness/`, then it imports only
from `iv-harness/`, `ivue`, `vue`, and node built-ins — never from the
application's `src/`.

**Scope:** All source under `iv-harness/`. The reverse direction (the app
consuming iv-harness) is allowed.

**Mechanism:** The process domain (tasks, gates, lanes) is
language-independent; keeping the arrow one-way is what lets iv-harness run
against any repo in any language, and lets it extract to its own package by
a move, not a rewrite.

**Generates:** The `--root` CLI flag (any checkout is a valid subject); the
future per-language adapter seam.

**Evidence:** `iv-harness/src/modules/*/*.ts` import lists.

**Impossible if true:** An import specifier anywhere under `iv-harness/`
that resolves outside `iv-harness/` into the application tree (enough
`../` segments to escape the module root, or an absolute app path).

**Verification:** `grep -rnE "from '(\.\./){3,}|from '\.\./src/" iv-harness/`
returns nothing (three up-levels escape the module root from its deepest
files; `../src/` escapes from the top).

**Status:** provisional

**Last refined:** 2026-08-14

### Disk is the store and the graph is a projection

**Invariant:** If the graph answers a query, then the answer was re-derived
from disk state (task folders, git, gate logs, heartbeat) at query time —
the graph persists nothing and a crash loses nothing.

**Scope:** All of `iv-harness/`. Watch-mode caching (milestone 2) may
memoize between file-change events but never becomes the write path.

**Mechanism:** Domain classes are stateless `Static()` capability classes
taking explicit paths; the `HarnessGraph` root holds only its options.
Stands on: [Only the files arbitrate process state](#only-the-files-arbitrate-process-state).

**Rejected alternatives:** Long-lived graph daemon owning state — dies with
the process and forks authority from the files the rest of the fleet reads.

**Evidence:** `HarnessTaskRecords.listTasks`, `HarnessGateRuns.readRegistry`,
`HarnessLanes.listLanes`, `HarnessHeartbeat.read` — all read-only, all
per-call.

**Impossible if true:** A graph query whose answer survives deleting the
underlying file; any write to `.invar/` from this module.

**Verification:** `bun iv-harness/cli.ts --self-test` (fixture-planted
queries; empty-root arm); grep `iv-harness/` for `writeFileSync` outside
`cli.ts`'s self-test.

**Status:** provisional

**Last refined:** 2026-08-14

### A wrapped script keeps its logic in one place

**Invariant:** If a harness capability exists as a script, then its logic
lives either in the script (with iv-harness parsing its OUTPUT or artifact)
or wholly in a class (with the script as a thin shim) — never partially in
both.

**Scope:** Every fleet/tasks script this module touches (gate logs,
heartbeat, registries now; dispatch/land wrappers in milestone 3).

**Mechanism:** Duplicated guard logic drifts independently; the migration
ladder is wrap (parse output) → absorb wholesale (script becomes shim) —
the forbidden state is the same check implemented twice.

**Generates:** `HarnessGateRuns` reads the `GATE_EXIT=` sentinel land.sh
writes, rather than re-implementing gate verdict logic.

**Evidence:** `HarnessGateRuns.readGateLog` (sentinel parse only);
`HarnessHeartbeat.read` (mtime only — the same signal dispatch.sh checks).

**Impossible if true:** A class re-implementing a guard that its wrapped
script still enforces (two places answering the same question with
different code).

**Verification:** Review-time at each wrap/absorb step: diff the class
against the script for duplicated predicates.

**Status:** provisional

**Last refined:** 2026-08-14

### A graph server is a disposable cache

**Invariant:** If a warm graph server exists, then it only watches and
caches — killing it at any instant loses no state, and every client
falls back to the cold one-shot read with identical answers.

**Scope:** The `server` module and every client of the rendezvous
protocol (CLI attach, future Observer subscriptions). Remote access
goes THROUGH the server — the graph travels to the files (run --serve
where the repo lives, forward the socket), never the files to the
graph over a remote fs; synchronous derivation is load-bearing for
ivue getter composition.

**Mechanism:** Watchers only bump version signals; every answer
re-derives from disk at request time; the CLI attaches only through a
live-manifest check (pid answers signal 0) and silently falls back cold
when the manifest or socket is dead. Stands on:
[Disk is the store and the graph is a projection](#disk-is-the-store-and-the-graph-is-a-projection).

**Generates:** The `--serve`/attach convention (one server per checkout,
DriveSession's rendezvous pattern); the `waitFor` verb (a parked graph
condition evaluated on watcher events — a wait is a condition).

**Rejected alternatives:** Server-held state answering queries from
memory — forks authority from the files the rest of the fleet reads;
a reboot or crash would silently lose fleet truth.

**Evidence:** `HarnessServer.ts` (bump-only watchers, per-request
re-derive); `HarnessServer.test.ts` ("the server is a disposable cache:
killing it loses nothing").

**Impossible if true:** A query answerable only while the server lives;
a graph answer that differs between attached and cold for the same disk
state; a client that errors (rather than falls back) when the server
dies mid-session.

**Verification:** `bun test iv-harness/src/modules/server` — the
disposable-cache test kills the server and proves cold answers survive.

**Status:** provisional

**Last refined:** 2026-08-14
