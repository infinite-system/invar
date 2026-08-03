# Task 469 — drive reads the app class graph

Priority: user-directed
State: COMPLETED — 7f72091a
Engine: claude
Environment: any
Model: fable-5
Effort: high

## The user's direction, verbatim (2026-08-02)

"also maybe you should be able to access the whole app graph, since our whole
app is just a class graph, do not rely on status projection"

## Why this matters

The status projection is a bottleneck BY CONSTRUCTION: a value is observable
only if someone pre-published it. That is why `panel.list.visible` does not
resolve — the state exists, nobody exported it. Every new surface pays a
publish tax before it can be driven, and a drive can only ask questions
somebody already anticipated.

The app is an ivue class graph. Its state is reachable from a root by ordinary
property access. Nothing about it is inherently unobservable.

## The one real constraint

The app runs in a SEPARATE PROCESS (the PTY child). The driver cannot touch
those objects in memory. So this needs a query bridge INSIDE the app:

- a debug channel the app already owns (it writes the status file; the same
  mechanism can read a request file, or take a unix socket);
- a resolver that walks a path from a named root against the live graph —
  the same segment walk `DriveSession.resolvePath` does, but over real objects
  instead of parsed JSON;
- ivue getters evaluate on read, so the walk returns LIVE values, and Ref
  cells need `.value` unwrapping in the resolver, not at the call site.

## Shape to aim for

    app.get('rootView.panelHost.spaces[0].label')
    app.waitFor('panelHost.resolvedCells.length', 0)

with the same loud-miss discipline as show(): an unresolvable path names where
the walk died and what WAS available at that node. A silent undefined is the
failure this instrument exists to remove.

## Boundaries

- READ ONLY to start. A `set` into the graph bypasses the user's own path,
  which is the premise of the whole harness — every existing gesture goes
  through real input. If setting is ever wanted, it is a separate decision
  with its own justification, not a free consequence of adding get.
- The bridge must be inert unless explicitly enabled (an env flag the harness
  sets), so a shipped binary never exposes its object graph.
- Keep the status projection: it stays the ATOMIC observation (it is what
  makes waits race-free). Graph reads are for questions nobody pre-published.

## Verification

Both arms: a path that resolves returns the live value AND changes when the
app changes; a path that does not resolve fails loudly, naming the node that
died. Drive a case the projection cannot answer today.
