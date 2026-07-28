# Code-aware wrap — READY

Commit: `7df0fc75bc00de96735ccf9ff6bf2074892b03bd`

Branch: `feat-code-aware-wrap`, based on `origin/main`

## Shared seam

The one break-opportunity generator is
`src/modules/editor/WrapBreakOpportunity.ts`. `EditorWrap` calls it with the
code profile; `AgentWordWrap` calls the same classifier and backward scan with
the prose profile. The editor's former `isBreakableAfter` predicate and the
agent's former local hyphen scan are gone.

The new project invariant is **Wrapped surfaces share one break generator**.
The editor and agent module records were refined to cite the shared seam, and
all reverse annotations resolve.

## Profiles and rationale

- Prose: break after whitespace and after `-`. Ordinary words stay whole;
  hyphenated compounds expose the user-requested break; an over-width token
  still falls back to a whole-grapheme hard break.
- Code: the prose set plus after `_`, `/`, `\`, `.`, `,`, `;`, and `:`; after
  `(`, `[`, and `{`; before `)`, `]`, and `}`; between ASCII lowercase and
  uppercase; and around contiguous runs of `=+*%<>!&|^?~`.
- Separators stay attached to the prefix so a continuation still shows the
  path or punctuation seam. Bracket direction follows source structure.
  Camel boundaries preserve identifier morphology. Operator runs may move as
  units from either side but are not split internally.

All positions are indices in the existing grapheme arrays. No boundary can
land inside a grapheme cluster or surrogate pair.

## Hot-path cost

`previousBreakOpportunity` scans backward only inside the already measured
fitting row. It accepts a `readonly string[]` and a scalar profile; there is no
innermost options object, substring, slice, or per-character boundary array.
The agent retains `TextSegmentation.words` for token runs, so the extraction
does not introduce per-character concatenation. Whitespace classification is
a direct code-point scan with no temporary collection.

## Driven evidence and controls

Before the implementation, the strengthened real-PTY wrap smoke exited `1`
because `repositoryecho` was split across observed editor rows.

The fixture now contains:

1. a long prose comment,
2. a long alternating dotted/slashed path,
3. a long camelCase identifier,
4. a no-whitespace operator expression.

For each logical line, the harness first proves from observed gutter/cell rows
that it occupies more than one visual row. It then proves every deliberately
indivisible fragment occurs whole in one observed row and that the final
visual row ends with the true logical-line suffix. The existing native-caret
alignment and wrap-off round-trip assertions remain.

Post-commit results:

- `bun scripts/harness/smoke-wrap-harness.ts`: exits `0`, `0`, `0`.
- `bun scripts/harness/smoke-agent-pane-ux-harness.ts`: exits `0`, `0`, `0`.
  This independently drove the prose/hyphen consumer, composer right gap, and
  native caret.

## Required verification

- `bunx tsc --noEmit`: exit `0`.
- `bun test`: exit `0` — 1,351 passed, 0 failed.
- `bun scripts/check-file-grammar.ts`: exit `0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: exit
  `0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: exit
  `0` — 697 annotations resolved, 0 problems.
- `bash scripts/conventions-gate.sh`: exit `0`.
- `bun scripts/check-coverage-ratchet.ts`: exit `0`.
- `git ls-files | grep '^TASK'`: no output (exit `1`, the expected no-match
  status).

The worktree is clean. No merge gate, push, merge, tag, or branch deletion was
performed.

## Unproved or deliberately outside scope

The code profile intentionally recognizes ASCII lowercase-to-uppercase source
identifier boundaries; locale-specific case transitions are not classified.
Generic width-only `WrapText` geometry and terminal-emulator hard wrapping do
not search for semantic opportunities and are outside this profile seam.
The full merge gate was not run because the task explicitly prohibited it.
