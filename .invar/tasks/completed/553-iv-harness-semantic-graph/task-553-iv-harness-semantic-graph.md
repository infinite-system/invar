# 553 — iv-harness semantic graph

Priority: user-directed
State: COMPLETED — 9c151355 — iv-harness M1 landed: process graph (tasks/gates/lanes/fleet) queryable by path; own module tree + invariants contract; both-arms self-test; first real catch was the dead post-reboot fleet-watch heartbeat.
Engine: claude
Environment: linux
Model: fable-5
Effort: high
Assignment note: conductor self-do — user's explicit order 2026-08-14
("file it and do it yourself; you and me are the observers right now").

## In plain words

The app is a graph any agent can query. The system that BUILDS the app
(tasks, gates, worktrees, steers, fleet scripts) is not — it is text
files and shell scripts that every reader re-parses by hand. This task
gives the development process its own queryable graph, so "which gate
ran, what did it say, who steered what" becomes a path query instead of
a grep.

## The reduction (spec seed, agreed with the user 2026-08-14)

Source: the Invariant Engineering paper (Geometry of Software, §11-§18)
+ this session's conductor evidence. The harness is the last
unconverted module of the project — the app obeys the one-graph
doctrine (340+ ivue classes, GraphChannel), the harness is capability
islands with textual exhaust.

Three structural decisions, held firm:

1. SEPARATE ROOT, ONE-WAY ARROW. `iv-harness` is its own package root,
   powered by ivue (the package), NEVER importing from the app
   (src/). The process domain (Task, Gate, Lane, Steer) is
   language-independent by construction — that is what makes the graph
   portable to any repo in any language. Code-level semantics come
   later via per-language adapters (TS semantic projection; LSP as the
   language-neutral source).
2. DISK IS THE STORE, THE GRAPH IS A PROJECTION. Task folders, git,
   gate logs stay the durable truth. The Reactive layer re-derives
   from disk; crash loses nothing. If the graph ever becomes the
   authority and disk the cache, fleet state dies with a process.
3. WRAP FIRST, ABSORB LATER, NEVER DUPLICATE. A Static capability
   class per script shells out to the existing script and parses its
   output into structured results; bash stays the implementation until
   a real touch moves the logic wholesale (script becomes a bun shim).
   Logic in both places is the forbidden state.

## Milestones

M1 (this task): package skeleton `iv-harness/` + process-domain nodes
  (Task, Gate, Lane/Worktree, Steer, Heartbeat) as ivue classes over
  disk + path-query CLI (`bun iv-harness/cli.ts get tasks.inProgress`)
  + `iv-harness.invariants.md` with the three decisions as records +
  self-test.
M2 (follow-up task): watch mode — fs-watchers bumping keyed version
  signals; a long-lived Observer process subscribes instead of polling.
M3 (follow-up task): script absorption per the ladder; structured
  TaskReport fields become graph-born nodes.

## The deliverable, twice

CODE: `bun iv-harness/cli.ts get <path>` answers process-graph queries
from disk state; self-test green; invariants contract checked.
VISUAL: no app change. The visible artifact is the CLI's output —
the conductor's sweep queries answered structurally.

## Invariants in scope

- project.invariants.md — greenfield floor: new root module, no
  forbidden capability re-introduction; ivue file grammar applies to
  iv-harness/ sources.
- NEW: iv-harness.invariants.md (written by this task) — the three
  decisions above as its first records.

## Bycatch expected

Report per AGENTS.md taxonomy, even when None observed.
