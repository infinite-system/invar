# Icon uniformity — READY

Branch: `fix-icon-uniformity`

Base: `1563456`

Commit: `966c5d1b1169304bb47ff12dfa7a002a04e248a8`

Working tree: clean

## Outcome

- The exhaustive pre-change `ThemeIcons` census found exactly two offenders:
  `unicode.symbol.lockfile` (`🔒`, app 2 / terminal 1) and
  `unicode.symbol.image` (`🖼`, app 2 / terminal 1).
- Lock files now use `⚿` (U+26BF SQUARED KEY), measured 1 / rendered 1.
- Images now use `▞` (U+259E QUADRANT UPPER RIGHT AND LOWER LEFT),
  measured 1 / rendered 1.
- Both replacements are solid, one-cell, outside the Geometric Shapes block,
  absent from the reserved and activity-row mark sets, and uniquely owned by
  their symbol classes.
- The permanent test enumerates every public `ThemeIcons` vocabulary surface
  at all three tiers and reports every app/terminal disagreement or
  terminal-rendered double-cell glyph. The exception list is gone and the
  `漢` 2-cell positive control remains. The post-change offender list is empty.
- The real PTY fixture contains `bun.lock`, an image, and ordinary files. It
  asserts one shared filename column in both the file tree and breadcrumb
  popup.
- The theme contract now records width agreement and one-cell rendering as a
  closed class with no per-glyph exceptions. The coverage declarations were
  appended, not rewritten.
- Bare outgoing-token sweeps found no `🔒`, `🖼`, or
  `knownWidthDisagreements` occurrences under `src` or `scripts`.

## Verification

Every listed command completed with exit code 0:

- `bun install --frozen-lockfile`
- `bun test src/modules/theme/ThemeIcons.test.ts
  src/modules/ui/BoundedListPopup.test.ts`
  - 33 pass, 0 fail, 312 expectations
- `bunx tsc --noEmit`
- `bun test`
  - 1,588 pass, 0 fail, 16,977 expectations
- `bash scripts/conventions-gate.sh`
- `bash scripts/behavioral-contracts.sh`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  - 853 annotations and 45 lattice links resolved, 0 problems
- `bun scripts/check-reactive-observation.ts`
  - positive control green, 0 candidates
- `bun scripts/check-harness-wait-observation.ts`
  - report-only census completed; 47 existing candidates
- `bun scripts/check-coverage-ratchet.ts`
  - 303 files inspected, no undeclared decrease against `1563456`
- `bun scripts/harness/smoke-bounded-list-popup-harness.ts`
  - three required consecutive drives: exit 0 each, `ALL-PASS` each
  - one additional post-commit drive: exit 0, `ALL-PASS`
- Loaded run: full `bun test` and the bounded-list PTY smoke ran
  concurrently; both exited 0.
- `git diff --check`

The implicated theme, UI geometry, file-tree, terminal-width, and harness
invariants are upheld or strengthened. `scripts/merge-gate.sh` was not run.
No push, merge, tag, branch deletion, or TASK-file addition was performed.
