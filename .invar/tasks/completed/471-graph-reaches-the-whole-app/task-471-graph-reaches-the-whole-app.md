# Task 471 — the graph reaches the whole app

Priority: user-directed
State: COMPLETED — 1d03a604 — Landed: composition-rooted graph, automatic contributor reach, shortcut getters; 26 census facts now migratable. Bycatch converted: #475 filed (Quick Open focus), attach exit-code bug + PTY gaps accumulated in #473, reach-completeness record proposed for the user.
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high

## Ordering

PRECEDES #470. The wait-defect repairs migrate waits onto graph paths; doing
that before the graph is complete would leave the contributor-backed waits
(file tree, git counts) unmigratable and invite a second pass. Complete the
reach first, then migrate once.

## The user's direction, verbatim (2026-08-02)

"yes, everything should be in the graph, and even things like
workspaceSet.active.editor.blabla, should be converted to shortcuts like
workspaceSet.activeEditor, to reduce the chains between things"

## The two moves

1. **Root the channel at the app's real composition root.** The current root
   is `statusProjectionPorts` (Bootstrap ~1402) — a CURATED list, which
   rebuilds the publish tax at root granularity: a contributor missing from
   the ports object is unobservable. Census evidence: file-tree rows come from
   FileTreeContributor.ts:138 and git counts from GitPlugin.ts:460, and both
   instances exist ONLY as Bootstrap locals — reachable by closure capture,
   not by any object graph. Making the graph complete and making the app's
   composition explicit are the same work: those locals become owned members
   of a composition object, and the channel roots there. No membership
   decisions anywhere — every membership decision is a future gap.
2. **Chain-shortening as REAL getters on the classes, never aliases in the
   channel.** `get activeEditor()` on WorkspaceSet is domain code every
   consumer benefits from; an alias table in the channel forks the observation
   vocabulary from the code vocabulary and the instrument starts lying about
   the app's shape. ivue plain getters cost zero bytes, so the discipline is
   free. Candidate set to propose during implementation: workspaceSet
   .activeEditor / .activeDocument, panelHost.focusedContent (exists),
   plus whatever the #470 migration actually needs — grow from real demand,
   not speculation.

## Boundaries

- Reach-completeness must NOT become mass evaluation: the resolver keeps
  evaluating only the getters a path names (the read-only record's mechanism).
- The enablement gate is unchanged: inert in a shipped binary.
- `Graph observation reads and never mutates` (system.invariants.md) governs;
  widening the roots widens what that record covers.

## Verification

Both arms: a contributor-backed value (a file-tree row count, a git changed
count) resolves through the graph AND tracks a live change; the old
unreachable paths' loud-miss now names real nodes. The #470 census's
"no model path — contributor state" findings become migratable — re-check
each one against the widened graph.
