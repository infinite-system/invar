# 251 — the gate ran 60 smokes on an EMPTY node_modules and reported 57 green

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: verification-integrity

## Outline

Found live 04:4x. The conductor hand-built a scratch merge worktree and
forgot `bun install`. `node_modules` had ZERO entries. The merge gate ran
anyway: Bun's auto-install-from-cache served imports transparently, so 57
steps passed — but provider BINARIES were never linked, so exactly the arms
needing a real language server failed (behavioral-contracts' plugin-manifest
drive, the completion smoke's boot). Two full gate runs produced
confident-looking timeout reds that cost an hour of interaction-bisecting;
the identical tree with a real install was green.

The defect class is partial-coverage-presenting-as-total, in the gate
itself: a gate whose dependency ground truth is absent must refuse to run,
not report a mostly-green lie.

The fix, in merge-gate.sh's preflight (guards go first):

1. Refuse when `node_modules` is missing or empty relative to the lockfile
   (cheap: bun.lock exists AND node_modules/.bin lacks the known provider
   binaries the smokes need — enumerate from one place, not a hardcoded
   scatter).
2. The refusal names the repair (`bun install --frozen-lockfile`) and exits
   a distinct code so a caller can auto-repair deliberately.
3. Positive control in the gate's own self-check style: run the preflight
   against a planted empty node_modules and quote the refusal; absent arm:
   a healthy tree passes preflight silently.

Changes to the verification apparatus need verification from OUTSIDE the
apparatus (project.conductor.md family 3 corollary): prove the guard on
both arms in a scratch tree before trusting any gate that carries it.

## Invariants in scope

- The gate's own preflight contract (merge-gate.sh header). If the harness
  records state a dependency-ground-truth rule, extend it; if none does,
  that gap is part of this task.

## Bycatch expected

Per AGENTS.md's taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- Conductor measurements 04:3x-04:4x: empty node_modules (0 entries) in
  /tmp/gate-batch-35-233; identical reversed-order tree green after
  `bun install --frozen-lockfile`; gate runs 1-2 red on the same two arms.
- dispatch.sh's own comment: "installing dependencies (not optional, not
  the builder's job to discover)" — the rule existed for builders and not
  for the gate's own tree.
