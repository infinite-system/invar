# 555 — iv-harness warm graph server

Priority: user-directed
State: COMPLETED — a1111764 — iv-harness M2 landed: warm graph server — serve/attach/waitFor with disposable-cache contract; driving caught and fixed the GET-stop bug.
Engine: claude
Environment: linux
Model: fable-5
Effort: high
Assignment note: conductor self-do — user order 2026-08-14 ("do M2
yourself, after done m2 we review it and then do m3").

## In plain words

Today every graph question boots a fresh process that reads the disk
and exits. This task boots the graph ONCE per checkout: it watches the
files, and every agent, conductor, or observer taps the same warm
process. Ask-and-exit still works when no server is up.

## The shape (settled with the user 2026-08-14)

- `bun iv-harness/cli.ts --serve` boots once, arms fs-watchers (task
  folders, gates registry + registered logs, heartbeat), listens on a
  CHECKOUT-KEYED rendezvous dir (the DriveSession --serve/--attach
  convention: a worktree agent gets its own server, never crosses
  another's). Unix domain socket + manifest with pid.
- `get`/`ls` AUTO-ATTACH when a live server exists, fall back to the
  cold one-shot when not — the CLI contract does not change.
- NEW verb `waitFor <path> <json-value> [--timeout]` — a parked graph
  condition evaluated on watcher events (the wait-is-a-condition law);
  degrades to local polling without a server.
- Reactivity is ivue: per-domain version signals (keyed version-signal
  pattern), $watch in the server's own scope, $stopEffects on dispose
  (outliving-instance discipline).
- THE SAFETY INVARIANT: disk stays the store; the server is a
  DISPOSABLE projection cache — killable at any instant with zero loss,
  clients never depend on its uptime for correctness. New contract
  record + test.

## Measured baseline (why warm, honestly)

Cold one-shot: 43ms wall, ~64MB transient RSS — cheap. The real driver
is M2's watchers REQUIRE a resident process (a process that exits
cannot watch), and one shared server beats N private copies.

## The deliverable, twice

CODE: server module + attach path + waitFor, colocated tests green,
grammar ratchet includes the new module, self-test extended.
VISUAL: no app change; the visible artifact is `--serve` + instant
attached queries + a waitFor resolving when a file lands.

## Invariants in scope

- [iv-harness.invariants.md](../../../../iv-harness/iv-harness.invariants.md) — all four records bind; "Disk is the
  store" gains the server-as-disposable-cache corollary (new record).
- project.invariants.md greenfield floor.

## Bycatch expected

Report per AGENTS.md taxonomy, even when None observed.
