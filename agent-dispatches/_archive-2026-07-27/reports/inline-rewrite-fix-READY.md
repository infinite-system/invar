# Inline rewrite plugin fix — READY

Branch: `fix-inline-rewrite-plugin`

Commits:

- `eb0adba29a8e651e86ab8b57d2ac36e18cbf5358` —
  `fix: extract and stabilize inline rewrite plugin`
- `2eeb0cc` — `style: preserve inline rewrite line width`

The second commit keeps the required 80-column wrapping stable across the
repository's pre-commit Prettier hook. The worktree is clean.

## Result

- Inline rewrite is now an `InlineRewriteContributor` installed by
  `DefaultPlugins`.
- The contributor owns its setting, commands, keybindings, guard, status
  projection, trigger, presentation, and per-workspace controllers.
- The host editor exposes only a generic `EditorContributions` seam and has no
  inline-rewrite vocabulary.
- A proposal is appended beside the real source text. It never replaces or
  occludes source before explicit accept, and the native caret remains visible.
- Stale responses are dropped by request generation and document revision. A
  cancelled response cannot clear a newer typed region.
- Setting-off unregisters editor observation and disposes every controller,
  timer, request, and provider. Extensions disable additionally removes the
  setting heading, commands, binding layer, guard, and status projection.
- Git HEAD refresh retains the last applied text while a refresh is in flight.
  An identical result does not advance decoration revision, eliminating gutter
  disappearance/reappearance frames.

## Reproduction evidence

All reproductions used the real PTY driver, a tracked dirty file with live git
gutter marks, and the deterministic delayed rewrite provider.

### Before the fix

1. Typed text: failed 3/3, including one loaded run. On the first proposal
   frame, the proposed row replaced the source row and the typed semicolon was
   no longer visible.
2. Enabled idle quiescence: failed 3/3. Settled frame counts changed `6 → 12`,
   `6 → 10`, and loaded `6 → 10`.
3. Setting disabled: failed 3/3. Settled frame counts changed `4 → 8`,
   `4 → 6`, and loaded `4 → 6`, while provider request count remained zero.
   This isolated the remaining churn to periodic HEAD refresh temporarily
   clearing the live gutter state.

### After the fix

1. Typed text: passed 3/3, including one loaded run. The harness captured the
   first completed frame after each of five continuously typed characters and
   found the accumulated source in every frame. After the delayed/stale
   response race, the full `const value = calculate();typed` source remained
   visible beside the proposal.
2. Enabled idle quiescence: passed 3/3 with `6 → 6`, `7 → 7`, and loaded
   `6 → 6` over the settled observation windows.
3. Setting disabled: passed 3/3 with `4 → 4`, `4 → 4`, and loaded `4 → 4`,
   with zero provider requests.
4. Plugin disabled through Extensions: passed with zero provider requests and
   `6 → 6` settled frames.
5. Extensions disable/re-enable restored the setting schema, commands,
   keybinding layer, guard, workspace contribution, and provider request path.

## Verification

All commands exited 0:

- `bun install --frozen-lockfile`
- `bunx tsc --noEmit`
- `bun test` — 1,603 pass, 0 fail, 27,031 expectations across 246 files
- `bash scripts/conventions-gate.sh` — PASS
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — 856 annotations, 45 lattice links, 0 problems
- `bun scripts/check-coverage-ratchet.ts` — 303 files, no undeclared decrease
- `bun scripts/check-reactive-observation.ts` — positive control passed,
  0 candidates
- `bash scripts/behavioral-contracts.sh` — ALL-PASS
- `bun scripts/harness/smoke-plugin-manifest-harness.ts` — inline rewrite
  uninstall/reinstall PASS
- `bun scripts/harness/smoke-gutter-diff-harness.ts` — ALL-PASS
- `bun scripts/harness/smoke-editor-harness.ts` — PASS
- `bun scripts/harness/smoke-wrap-harness.ts` — PASS
- Host-boundary AST identifier censuses for `inlineRewrite` under app, editor,
  workspace, UI, and keybindings — 0 matches in every path
- `git diff --check` — clean

The two required coverage-decrease declarations were appended to
`project.coverage-deltas.md`. The inline-rewrite contract now records
single-flight ownership, revision-based stale dropping, source preservation,
zero disabled observation, and contributor ownership, including both requested
impossibilities.

## Repository note

The supplied worktree began at
`0d49d339cd23f2a4ff5a6717026f74ffc1d0fc9a`, not the task text's stated
`3694b23`. That existing HEAD already contained unrelated scroll work. This
change does not modify `src/modules/agent`, Momentum, or render-loop files.
No merge gate, push, merge, tag, branch deletion, or worktree deletion was
performed.

## Merge with origin/main at 1baae42

Merge commit:

- `ac868f4da254b6495e6e0ca2ec952cb02337f4df` —
  `Merge origin/main into fix-inline-rewrite-plugin`
- Parents: inline-rewrite tip `2eeb0cc2f566a8bcdb25b9f129d00ad5953d7f1f`
  and authoritative main `1baae42c2324fc57d35ca6e2d2eb120501d7c189`

### Resolution

- Fetched `origin` and merged `origin/main` by hand.
- The only textual conflict was `project.coverage-deltas.md`. Its final form
  preserves both inline-rewrite coverage-decrease declarations and both
  AGENT-STATE INTERMITTENTS coverage-growth declarations.
- Main-only files (`project.handoff.md`, the agent-permissions smoke, and
  `AgentSession.ts` plus its test) are byte-identical to `origin/main`.
- The auto-merged editor retains main's document-rehydration fold-cache
  rebuild and `hasDocument` guard while preserving the generic
  `EditorContributions` seam used by inline rewrite.
- The resulting tree keeps the inline-rewrite contributor extraction,
  source-adjacent proposal presentation, identical-HEAD decoration-revision
  stability, and complete setting/plugin disable disposal.
- One focused idle reproduction initially reported `6 → 7` with no semantic
  status field changing. This was the app's authorized minute-clock repaint,
  not retained rewrite work. The harness now starts exact-zero measurements
  wholly between minute boundaries, preserving the stricter claim that inline
  rewrite itself contributes zero settled frames.

### Exact committed-tree verification

All required commands ran on merge commit `ac868f4` and exited 0:

- `bun install --frozen-lockfile` — exit `0`; 152 installs across 170 packages,
  no changes.
- `bunx tsc --noEmit` — exit `0`.
- `bun test` — exit `0`; 1,604 pass, 0 fail, 27,035 expectations across 246
  files.
- `bash scripts/conventions-gate.sh` — exit `0`; PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` —
  exit `0`; 856 annotations, 45 lattice links, 0 problems.
- `bun scripts/check-coverage-ratchet.ts` — exit `0`; 303 files, no undeclared
  decrease against `1baae42`.
- `bash scripts/behavioral-contracts.sh` run 1 — exit `0`; ALL-PASS, 100k
  editor/diff floor slowest 29.6 FPS.
- `bash scripts/behavioral-contracts.sh` run 2 — exit `0`; ALL-PASS, 100k
  editor/diff floor slowest 29.6 FPS.
- `bash scripts/behavioral-contracts.sh` run 3 — exit `0`; ALL-PASS, 100k
  editor/diff floor slowest 30.0 FPS.
- `INVAR_INLINE_REWRITE_REPRO=typed bun
  scripts/harness/smoke-inline-rewrite-harness.ts` runs 1, 2, and 3 — exits
  `0`, `0`, `0`; every typed character remained visible.
- `INVAR_INLINE_REWRITE_REPRO=idle bun
  scripts/harness/smoke-inline-rewrite-harness.ts` runs 1, 2, and 3 — exits
  `0`, `0`, `0`; settled frames `6 → 6`, `7 → 7`, and `6 → 6`.
- `INVAR_INLINE_REWRITE_REPRO=disabled bun
  scripts/harness/smoke-inline-rewrite-harness.ts` runs 1, 2, and 3 — exits
  `0`, `0`, `0`; zero provider requests and settled frames `4 → 4`, `5 → 5`,
  and `4 → 4`.
- Merge commit command with `SKIP_GATE=1` — exit `0`.

`scripts/merge-gate.sh` was not run. Nothing was pushed.
