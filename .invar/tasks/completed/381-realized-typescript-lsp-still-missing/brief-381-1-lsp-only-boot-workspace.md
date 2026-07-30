# Brief #381 round 1 — TS LSP works only in the launch workspace

Read the task file: original report (realized/blackline/blackline-app,
hover shows no tooltip) + the evidence update (works ONLY in the invar
workspace = launch workspace). Reopens #294 ("does not reproduce" —
that verdict was earned in a single-workspace fixture; the multi-
workspace case is the live one).

## Method — experiment, ranked candidates in the task file

1. Reproduce by driving: fixture with two workspaces, each a real TS
   project with its own tsconfig + typescript dependency; launch from
   workspace A; open a TS file in workspace B; hover. Also drive a
   SECOND LSP surface (diagnostics or go-to-definition) in B to separate
   LSP-dead from tooltip-dead.
2. Trace the language-service lifecycle: how many tsserver processes,
   rooted where, and where workspace B's hover request routes. The #393
   report observed exactly ONE live language service, active workspace
   only — reconcile with that design: if single-service-per-app is the
   intent, requests must re-root per workspace; if per-workspace
   services are the intent, spawn them.
3. Fix at the routing/rooting seam; workspace switch re-roots or
   re-targets. Idle cost stays bounded (do not spawn N idle tsservers —
   the #393 idle contracts must stay green; lazy spawn on first TS
   document, reap on workspace close).
4. Contract: hover + one more surface prove out in workspace B, both
   scales; positive control (break the rooting, prove red).
5. Commit BEFORE READY; report into the main checkout's in-progress
   folder; header carries commit hash + GATE_EXIT read from the hook.

## Invariants in scope

- Symbol structure is analyzer knowledge — [src/modules/structure/structure.invariants.md](../../../../src/modules/structure/structure.invariants.md).
- Each workspace owns one panel world + workspace persistence records — [src/modules/workspace/workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md) — the workspace-scoping model; your fix extends it to analyzer rooting (coordinate: #408 is auditing workspace scoping in parallel — do not edit workspace cold-state files; the analyzer seam is yours).
- Cost tracks the actively observed set — [project.invariants.md](../../../../project.invariants.md) — no N-idle-tsserver regression.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; carry the section even when it reads None
observed.
