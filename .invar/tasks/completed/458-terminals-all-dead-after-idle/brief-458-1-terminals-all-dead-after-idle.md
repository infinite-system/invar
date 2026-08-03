# Brief 458-1 — every terminal died at once after idling: find the shared stage

## In plain words

The user left Invar idle. Later every terminal in every workspace was
blank, even brand-new ones, while the shells behind them stayed alive.
Five explanations are already disproven. Find the shared thing that
can silence old AND new terminals at once, reproduce it, and name it.

## Reproduce by DRIVING first

This is a diagnosis task. Read the task file FULLY first — it carries
the live-incident evidence and five eliminated candidates. Do not
re-derive them. Then design the smallest experiment that separates the
remaining candidates, and run it by driving the real app (drive-pty
skill: warm headless server in your worktree, GraphClient waits).

## The shape of the suspect

The symptom crosses instances and arrives with IDLE time. Whatever
failed is SHARED by every terminal: candidates include the single
output-pump / render-feed layer between OpenPty streams and the grid,
a shared timer or reaper that stops consuming after quiet, an event
subscription that is dropped once and never re-established, or a
shared resource (epoll set, stream multiplexer) wedged by one member.
Rank rivals; brief says candidates, not one confident cause. Probe
before belief: for each rival name the observation that separates it,
and say plainly if a number comes out zero.

## Experiments you may build

- A long-idle harness run: boot the app, open 2+ workspaces with
  terminals, force the idle conditions (fake timers if a real hour is
  the trigger — but verify time-based hypotheses with real evidence),
  then type into every terminal and assert echo.
- Instrument the shared read/pump path with counters exposed through
  the graph channel (GraphChannel getters) so you can WATCH liveness.

## Deliverable

The mechanism, named and reproduced — or the ranked shortlist with
each rival's separating observation attempted and its result. A fix
only if the mechanism is proven; a reproduced mechanism ratchets into
a gated smoke.

## Invariants in scope

- Contracts governing terminal/PTY modules (check src/modules/terminal
  and system contracts). Answer record by record; name misses.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy. Include the section even if
it reads: None observed.

## Instrument feedback

Report EASY / CONFUSING / MISSING about the drive layer; asks get
converted.

## Rules

- Never run scripts/merge-gate.sh; the conductor gates and lands.
- Commit on your branch as you go. READY report in the task folder.
