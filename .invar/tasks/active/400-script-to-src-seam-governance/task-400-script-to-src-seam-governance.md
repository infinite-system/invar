# #400 — the scripts-to-src production seam is ungoverned

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low

## Origin — #387 bycatch 7; proven by today's build break

scripts/tasks/tasks-status.ts is a production dependency of
src/modules/tasks-dashboard. An export removed script-side took the whole
app down (the #380 x #348 cross-branch break); only a boot caught it.
Nothing gates that seam. Options to evaluate: a conventions-gate rule
(scripts files imported from src must typecheck against src consumers —
tsc already covers this ON ONE TREE; the gap is cross-branch), a record in
the dashboard contract naming the seam, and/or moving the shared tables
into src with the CLI importing FROM src (seam at the shared generator).
Propose, do not force.
