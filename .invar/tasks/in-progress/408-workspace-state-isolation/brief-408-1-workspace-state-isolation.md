# Brief #408 round 1 — workspace state isolation

Read the task file in this folder first (user verbatim + four-step
shape). Key discipline:

- CENSUS BY ENUMERATION, not memory: walk the settings schema, the
  workspace cold-state serialization, and every module holding UI state;
  produce the classification table (state, current scope, correct scope,
  leak?) in the report even for non-leaking rows — partial coverage
  presenting as total is the failure mode.
- Reproduce every claimed leak by DRIVING (A-B-A workspace switches),
  fixture workspaces only.
- DO NOT EDIT the panel-model files task 404 is rebuilding
  (PanelHost, PanelTabBar, panel persistence) — report those leaks for
  404 to inherit; fix everything else at the workspace cold-state seam.
- Contract arms per fixed state class with positive controls.
- Commit BEFORE READY; report into the main checkout's in-progress
  folder; header carries commit hash + GATE_EXIT read from the hook.

## Invariants in scope

- Each workspace owns one panel world — [src/modules/workspace/workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md) — the anchor record; likely REFINES to enumerate the scoped set.
- The other workspace persistence records in the same contract — answer each.
- Layout slots derive from one configuration — [src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md) — dock widths per workspace must still flow through the one resolve.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; carry the section even when it reads None
observed.
