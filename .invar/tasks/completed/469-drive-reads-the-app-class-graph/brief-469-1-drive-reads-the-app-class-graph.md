# Brief #469 round 1 — drive reads the app class graph

## In plain words

Today a drive can only observe what somebody remembered to publish into the
status file. The app is an ivue class graph and all of its state is reachable
by ordinary property access, so a drive should be able to ask for any of it by
path. Build that bridge.

## Read first

[task-469](task-469-drive-reads-the-app-class-graph.md) carries the user's
direction verbatim, the constraint, the shape to aim for, and the boundaries.
It is the specification. Do not re-derive it; do refute it if driving proves
it wrong.

Then read [DriveSession.ts](../../../../scripts/harness/DriveSession.ts) in
full — it is 24 hours old, it is the surface you are extending, and its
`resolvePath` is the segment walk you are mirroring over live objects.

## Where the seam already is

[StatusChannel.ts](../../../../src/modules/system/StatusChannel.ts) already
owns the observation channel: it is enabled by `TUI_OBSERVE=1` or the presence
of `TUI_STATUS_PATH`, and it writes the atomic status file. The graph bridge
belongs beside it, gated by the SAME enablement so a shipped binary never
exposes its object graph. Do not invent a second channel concept.

## What to build

1. **In-app resolver.** Walk a path from a named root against the live graph.
   ivue getters evaluate on read, so the walk returns live values. Unwrap
   `Ref`/`Computed` cells IN THE RESOLVER, never at the call site — a caller
   writing `.value` into a path string is the leak this exists to prevent.
2. **A request/response channel.** The app already writes a file atomically;
   reading a request file is the cheap symmetric move. A socket is acceptable
   if you can show it is simpler. Whatever you choose, the response must carry
   whether the path RESOLVED, distinct from resolving to undefined.
3. **`app.get(path)` and `app.waitFor(path, value)` on DriveSession**, with
   the same loud-miss discipline `show()` now has: name the node where the walk
   died and what WAS available there. A silent undefined is the defect this
   instrument exists to remove.

## The rule I want you to hold

READ ONLY. A `set` into the graph bypasses the user's own input path, which is
the premise of the entire harness. If you believe setting is needed, say so in
the report with your reasoning; do not ship it.

## The disagreement to settle by driving

The conductor claims the status projection must SURVIVE alongside this,
because it is published atomically at a frame boundary, so a wait on it cannot
observe a half-updated app — whereas a live graph read can catch the app
mid-update and return a value that never really existed (the torn-frame class
#457 removed from the gate). Therefore: graph reads for asking questions,
projection for waiting on conditions.

Test that claim rather than assuming it. If a graph read CAN return a torn
value, `waitFor` on a graph path is a flake generator and must be built to
sample only at a safe point — say which point and why. If it CANNOT, say what
makes it safe and the conductor's caution was wrong.

## Invariants in scope

- [harness contract](../../../../scripts/harness/harness.invariants.md) —
  `Harness waits observe conditions not frame ordinals`, `Every wait names
  itself`, `Async-published state is always awaited`, and #457's
  `Blocking gate verdicts use ordering and counts`.
- [system contract](../../../../src/modules/system/) if one governs
  StatusChannel — check, do not assume.
- **Propose the record this earns.** Something near "observation never mutates
  the observed app" is the invariant behind the read-only rule and is written
  nowhere.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## Verification

- Both arms: a resolving path returns the live value AND tracks a change the
  app makes; a non-resolving path fails loudly naming the dead node.
- Drive a question the projection CANNOT answer today. That is the whole point
  of the task — show one.
- `bun test` in FULL, `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`,
  invariant checker `--all --refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`. The conductor
  gates and lands.

## End state

A report in the task folder opening with `## In plain words`, carrying the
torn-read verdict with its evidence, the two arms, and the proposed record.
