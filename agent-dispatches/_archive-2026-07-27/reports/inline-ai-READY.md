# Inline AI rewrite — READY

Branch: `feat-inline-ai`

Commit: `139990dffd13da03aa2c8c62dd1e9448d8a5a657`

## Outcome

- Added `RewriteProvider` beside `LanguageProvider`, with document text,
  recent-edit region, cursor, language id, and ordered rewrite candidates.
- Added a swappable Codex CLI backend using `gpt-5.3-codex-spark` at low
  effort, JSONL response framing, a structured output schema, ephemeral
  sessions, read-only sandboxing, stdin prompts, detached processes, process
  cancellation, and one-child ownership.
- Added editor-owned 1,750 ms debounce, contiguous recent-region tracking,
  dirty/focus/overlay guards, request-now, revision stale-drop, silent error
  counting, candidate cycling, and atomic acceptance.
- Added distinct dim/italic rewrite projection with dedicated dark/light theme
  tokens and a compact keybinding-derived hint line.
- Added contributed schema setting `inlineRewrite.enabled`; it defaults on
  only when `codex` is available.
- Added status projection for enabled/visible/in-flight/request/error/candidate
  state.
- Added deterministic mock-provider PTY coverage to the quiet-serial gate pool.
- Added the opt-in real-Codex latency instrument and documented it in
  `project.tools.md`.

Keys:

- Request now: `Ctrl+Shift+R`
- Accept: `Ctrl+Alt+Right`
- Reject: `Escape` while a proposal is visible
- Previous/next variation: `Ctrl+Alt+Up` / `Ctrl+Alt+Down`
- `Tab` remains editor indentation.

## Verification

- `bun install --frozen-lockfile`: exit 0
- `bash scripts/conventions-gate.sh`: exit 0
- invariant checker `--all`: exit 0
- invariant checker `--all --refs`: exit 0, 834 annotations resolved,
  0 problems
- `bun scripts/check-coverage-ratchet.ts`: exit 0, no undeclared decrease
- `bun scripts/check-reactive-observation.ts`: exit 0, positive control green,
  0 new report-only candidates
- `bun scripts/check-harness-wait-observation.ts`: exit 0, no new candidate
  attributed to the inline rewrite paths
- full `bun test`: exit 0, 1,566 pass, 0 fail, 17,008 expectations
- `bash scripts/behavioral-contracts.sh`: exit 0, ALL-PASS
- deterministic inline rewrite smoke: three final runs, all exit 0
  - two machine-wide quiet-exclusive runs
  - one deliberate CPU-loaded run
- post-commit deterministic smoke: exit 0
- enabled in-flight idle check: frame `18 -> 18` over one second
- stale mock response that ignores cancellation: arrived and painted nothing
- real-Codex PTY drive: exit 0
  - model: `gpt-5.3-codex-spark`
  - reasoning effort: low
  - boundary: request-now PTY chord write to visible proposal status
  - latency: `5,439.8 ms`
  - injected 350 ms positive-control measurement: `1,607.9 ms`

The required invariants are recorded:

- `Inline rewrite owns at most one in-flight request`
- `Inline rewrite responses are revision-stamped and stale results discarded`
- `An inline rewrite proposal never consumes an ordinary edit keystroke`

## Handoff state

- Worktree clean.
- No TASK file tracked.
- No latency artifact tracked.
- `scripts/merge-gate.sh` was not run, as instructed.
- Nothing was pushed, merged, tagged, deleted, or amended.

## Merge with origin/main at 49c6a5e

Merged `origin/main` (`49c6a5ebab886d9d99a22f58d1db690613b52338`) into
`feat-inline-ai` after the branch forked from `d61124d`.

Merge commit: `5313b4f95caf492dfafc0f8c574d82f6500b8e8d`.

### Conflicts and resolutions

- `project.coverage-deltas.md` — both branches appended rows at the end of the
  coverage table. Resolved manually by retaining all seven inline-rewrite
  coverage rows from `feat-inline-ai` and the diff-scrollbar stabilization row
  from `origin/main`. No coverage claim or count from either side was removed.
- No source file had a textual conflict. The merged tree retains the complete
  inline-rewrite implementation and main's comparison-revision-scoped
  `DiffView.contentWidth`, including its extended scrollbar smoke coverage and
  refined diff invariant.

### Post-merge verification exit codes

- Initial `bun install --frozen-lockfile`: exit 127 because Bun was installed at
  `/home/parallels/.bun/bin/bun` but absent from the execution shell's `PATH`.
- `bun install --frozen-lockfile` rerun with that installation added to `PATH`:
  exit 0.
- `bunx tsc --noEmit`: exit 0.
- `bun test`: exit 0 — 1,566 pass, 0 fail, 17,008 expectations.
- `bash scripts/conventions-gate.sh`: exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  exit 0 — 834 annotations resolved, 45 lattice links resolved, 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: exit 0 — 296 files inspected, no
  undeclared decrease against `d61124d`.
- `bash scripts/behavioral-contracts.sh`: exit 0 — `ALL-PASS`.
- `bun scripts/harness/smoke-inline-rewrite-harness.ts`, run 1: exit 0 —
  `ALL-PASS`.
- `bun scripts/harness/smoke-inline-rewrite-harness.ts`, run 2: exit 0 —
  `ALL-PASS`.
- `bun scripts/harness/smoke-inline-rewrite-harness.ts`, run 3: exit 0 —
  `ALL-PASS`.

`scripts/merge-gate.sh` was not run. Nothing was pushed.
