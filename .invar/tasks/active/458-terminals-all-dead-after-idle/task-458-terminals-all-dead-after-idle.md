# #458 — every terminal in every workspace went blank at once after idling

Priority: user-directed
State: ACTIVE
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high

## In plain words

The user left Invar sitting idle. One terminal showed a blinking cursor
and no prompt. Then every terminal was dead, in every workspace,
including brand-new ones. One accepted a single letter and froze. The
shell behind the dead pane was still alive and healthy.

#452 landed two real fixes. **Neither one explains this.** This task
exists so that fact does not get lost behind a green gate.

## Why this is its own task

#452 is COMPLETED. It confirmed and fixed a database id collision and a
PTY read-stream defect, and it says plainly in its own report:

> The exact idle event that closed the user's streams is still unknown.
> A newly created terminal should have owned a fresh `OpenPty`, so this
> candidate also does not fully explain why every old and new terminal
> appeared blank at once. The original incident remains unproven.

A completed task cannot carry an open question. Closing #452 without
this folder would have quietly converted "we do not know" into "fixed",
which is the exact move the conductor is supposed to refuse.

## The evidence, from the live broken state

- The shell was ALIVE:
  `3555523 /bin/bash --rcfile /tmp/invar-terminal-rc-TkrYDM/bashrc -i`
- Not resource starvation: 61 of 4096 PTYs, file descriptors far under
  the limit, 17.8 GB available.
- The UI stayed responsive. The user switched workspaces while every
  terminal was dead.
- Trigger was IDLING. No gesture the user can name.

## Already eliminated — do not re-derive

- Whole-runtime blocking deadlock. A blocked event loop would freeze
  the UI; the UI was responsive.
- PTY or file-descriptor exhaustion. Measured, far under limits.
- Dead child process. The shell was alive.
- Pane identity collision (#452). Fixed, and it does not explain new
  panes also being dead.
- OpenPty normal-close without restart (#452). Fixed, and a newly
  created terminal owns a fresh `OpenPty`, so it cannot explain the
  new ones.

Five candidates are dead. That is the value this folder carries.

## What makes this hard, stated honestly

The symptom crosses INSTANCES. Whatever failed is shared by every
terminal, old and new, across workspaces — so look at what they have in
common rather than at any one pane: a shared allocator, a shared reader
or scheduler, a shared registry, a shared timer, a shared write queue,
or a process-wide resource that degrades over time.

"After idling" points at something that changes with TIME, not with
input: a timer that stops rearming, a keepalive, a watchdog, a cached
handle that expires, a scheduler starved by an idle path.

## What to do

This is an EXPERIMENT, not a diagnosis. There is no leading candidate.

- Enumerate the shared state on the terminal read path — anything
  process-wide or plugin-wide that every pane depends on. That
  enumeration is itself a deliverable, even if it finds nothing.
- Look for anything that changes only with elapsed time.
- Try to reproduce with a long idle: many hours, several workspaces,
  several terminals, then attempt input on both an old and a new pane.
  Say plainly if you cannot reproduce it.
- If you cannot reproduce it, the deliverable becomes DIAGNOSABILITY:
  what would Invar have to record for the next occurrence to be
  readable after the fact? Propose it and build it. A defect that
  cannot be caught in the act needs an instrument that catches it.

**An honest unknown is worth more than a story that fits.** Do not
manufacture a fix for a bug that does not reproduce — it ships a no-op
and closes the question falsely.

## Invariants in scope

- [The terminal contract](../../../../src/modules/terminal/terminal.invariants.md)
  — including the record #452 proposed, `A live PTY retains one master
  read path`, which is still `proposed` and should be judged here.
- [The UI contract](../../../../src/modules/ui/ui.invariants.md) —
  `A pane runtime owns its processes`.
- [The system contract](../../../../src/modules/system/system.invariants.md).
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.
