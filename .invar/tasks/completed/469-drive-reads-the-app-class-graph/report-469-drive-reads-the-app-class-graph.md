# Report #469 — drive reads the app class graph

Executor: the conductor directly (user: "no, don't dispatch").

## In plain words

A drive can now ask the live app for ANY state by path, not only what somebody
pre-published. `await app.get('panelHost.panelListWidth')` answers from the
running app's own object graph; `app.waitFor('panelHost.visible', true)` waits
on a graph condition sampled only at frame-settle. A path that does not
resolve fails loudly: it names the node where the walk died, suggests near
matches, and lists what was addressable there. Read-only by construction.

## What was built

1. **`src/modules/system/GraphChannel.ts`** — the in-app resolver and servicer.
   Walks a dotted/indexed path over the live ivue graph; `Ref`/`Computed`
   unwrap IN the resolver (a path never contains `.value`). Gated by the same
   enablement as `StatusChannel` (`TUI_OBSERVE=1` or `TUI_STATUS_PATH`), so a
   shipped binary never exposes its graph. File protocol beside the status
   file: `<status>.graph-request.json` in, `<status>.graph-response.json` out,
   both atomic write+rename. A request id is serviced once; ids are time-based
   so a stale file from a previous run sharing `--home` cannot shadow a fresh
   one.
2. **Root = `statusProjectionPorts`** (Bootstrap). The ports object already
   names every subsystem the projection reads (`panelHost`, `view`,
   `workspaceSet`, `settings`, …), so it IS the path namespace. No second
   registry was invented.
3. **`DriveSession.get(path)`** — mode `now`: answered from the app's next
   event-loop poll. **`DriveSession.waitFor(path, value)`** — mode `settle`:
   parked in the app and answered only at the frame-settle boundary, and the
   servicer calls `requestRender()` on receipt so an idle app still produces
   the settle (no pre-satisfied hang). Both stay PRIMITIVE: path strings, no
   app verbs, per the user's standing rule.

## The torn-read verdict (the disagreement the brief posed)

Both were partly right; the mechanism splits the claim in two:

- **A memory-level tear is impossible.** The app is single-threaded
  JavaScript; the resolver runs as one event-loop task, so a `now` read always
  observes a consistent state — never a value mid-assignment.
- **A between-frames transient IS observable.** A `now` read can run between
  two awaits of an in-flight workflow and see a state no completed frame ever
  had. For a one-shot question that is acceptable (the state genuinely existed).
  For a CONDITION it is a flake generator — exactly the conductor's caution.

So the safe sampling point is named and built in: **frame settle**, the same
boundary `StatusChannel.settle` publishes at. `waitFor` samples only there;
`get` documents its `now` semantics. The status projection SURVIVES and stays
the atomic bulk observation; graph reads remove the publish tax for questions.

## Verification (both arms, driven)

- Unit: `bun test src/modules/system/GraphChannel.test.ts` — 11 pass. Present
  arm (live value, tracks change, ref+computed unwrap, indexed walk), absent
  arm (dead node named, keys listed, throwing getter attributed, walking past
  a primitive), file protocol (now round-trip, settle parking + render
  request, replay ignored), inert when unobserved.
- Driven, real PTY (`bun scripts/harness/DriveSession.ts --script …`):
  - `panelHost.panelListWidth` → `20` — a value the projection does NOT
    publish; this is the question it could not answer before today.
  - `panelHost.spaces[0].kind` → `"terminal"`, `panelHost.activeSpaceId` →
    `"terminal-space-1"`.
  - Typo `panelListWdith` → loud throw: `walk died at: panelHost`, `did you
    mean: panelListExpanded, panelListVisible, panelListWidth…`.
  - `waitFor('panelHost.visible', true)` settled through a real frame.
- `bunx tsc --noEmit` clean; `scripts/conventions-gate.sh` PASS; invariant
  checker `--all` and `--refs` exit 0.

## On `set` (the read-only rule)

Held. No set shape exists in the protocol — `readRequest` parses only
`{id, path, mode}`, so a write cannot even be requested. Nothing in this work
needed setting; the rule cost nothing and the record below fixes it.

## Proposed record — WRITTEN (needs your confirmation at landing)

`Graph observation reads and never mutates` in
`src/modules/system/system.invariants.md`: no write path in the protocol,
discovery lists classify by descriptor without evaluating, class instances
serialize as name-plus-keys so only path-named getters ever run. Annotated at
`GraphChannel.ts`.

## Invariants in scope — answered record by record

- `Harness waits observe conditions not frame ordinals` — upheld: `waitFor`
  is a condition with a deadline, never a sleep.
- `Every wait names itself` — upheld: step descriptions and timeout errors
  carry the path, the wanted value, and the last seen value.
- `Async-published state is always awaited` — upheld: responses are awaited
  by id match, never read blind.
- `Blocking gate verdicts use ordering and counts` — untouched: nothing here
  enters the gate's blocking tier.
- `Observability never crashes the app` — upheld and extended: every
  GraphChannel IO path swallows failures; annotated.
- MISSED by the brief's list: `Atomicity is claimed only for self-generated
  output` (harness contract) — relevant because the request/response files
  are self-generated on both sides; both use write-temp+rename, so the claim
  holds. Finding about the conductor's map: minor, same contract file.

## Bycatch

- `StatusChannel.observing` did not exist — the enablement was private and
  would have been duplicated; exposed it as the one shared flag (in-scope
  change, not strictly bycatch).
- On ivue-transformed classes, engine-bound METHODS surface as prototype
  getters, so they appear in the addressable-keys list (e.g. `activate`).
  Cosmetic noise in miss messages; filtering would require evaluating
  properties, which the read-only record forbids. Accepted and documented.
- None otherwise observed.

## Addendum — set added by user decision (2026-08-02, same day)

Mid-landing the user re-chose the read-only boundary: "maybe we should
actually allow setting a graph value too, just so agents can quickly confirm
something". Built as `app.set(path, value)`: a SEPARATE explicit request shape
(`set: {value}`), so reads still cannot mutate — one shared walk serves both
and the read path contains no assignment. Ref targets write reactively; plain
fields answer `reactive: false` so the agent knows why nothing repainted.
Every failed set answers as a loud error (try/catch per the user's note),
never a crash — driven proof: a bad set threw with the dead node named and
the app kept answering. The record was refined, not deleted: the boundary
moved from "no writes" to "no writes through reads, no writes in
verification". 16 unit tests, full suite 2335 pass.
