# READY — #44 interface filename convention

Status: READY

Branch: `refactor-interface-filenames`

Exact tip SHA: `3350aa8d91b78ccf98a4dd550a88a2a8b03148d9`

Rebased base: `origin/main` at `c4fec7c6b33708500cb026b18080a54fc8ef530b`

## Commits

1. `485049fe8d193a1b83f61180e6805668c84230dd` — `refactor: name contract interface files structurally`
2. `3350aa8d91b78ccf98a4dd550a88a2a8b03148d9` — `chore(grammar): classify interface files by name`

Both hashes and `origin/main` were explicitly verified as ancestors of the exact tip.

## Files

Renamed with `git mv`:

- `src/modules/agent/AgentBackend.interface.ts`
- `src/modules/agent/AgentEvents.interface.ts`
- `src/modules/lsp/LanguageProvider.interface.ts`
- `src/modules/narration/TtsBackend.interface.ts`
- `src/modules/terminal/TerminalBackend.interface.ts`
- `src/modules/ui/PaneContent.interface.ts`

Checker and fixtures:

- `scripts/check-file-grammar.ts`
- `scripts/check-file-grammar.test.ts`

Convention, contract, and filename-reference updates:

- `project.conventions.md`
- `project.agent-harness.md`
- `project.brief.md`
- `project.implementation-plan.md`
- `scripts/codex/lsp.prompt.txt`
- `scripts/codex/lsp.scope.txt`
- `src/modules/agent/agent.invariants.md`
- `src/modules/terminal/terminal.invariants.md`

Import consumers: 48 TypeScript import declarations updated across 40 files. A TypeScript-AST
census found 48 new `.interface` module specifiers and zero old specifiers.

`AgentEvents.interface.ts` now exposes the eponymous `AgentEvents` event-map interface while
preserving `AgentEvent` as its indexed union. `PaneContent.interface.ts` is interface-first, with
`PaneRenderContext` below the eponymous seam.

## Checker behavior

- `*.interface.ts` structurally selects contract-interface grammar.
- `export interface X` is required in `X.interface.ts`.
- Interface files are automatically exempt from colocated class-test pairing.
- Classes and detached functions in interface files are enforced violations in every module.
- Legacy type-only non-interface files receive a visible report-only `X.interface.ts` suggestion.
- The six-file enumeration and its derived exemption map are deleted.

## Verification

| Check | Result |
| --- | --- |
| Rebase onto refreshed `origin/main` | PASS — up to date |
| `bunx tsc --noEmit` | PASS (`TSC=0`) |
| `bun test` | PASS — 1211 tests, 0 failures, 15443 expectations |
| `bun test scripts/check-file-grammar.test.ts` | PASS — 22 tests, including new failure/report-only fixtures |
| `bun scripts/check-file-grammar.ts` | PASS — 314 files, 6 structural interface exemptions |
| Invariants checker `--all --refs` | PASS — 606 annotations and 39 lattice links resolved, 0 problems |
| Old contract paths in `*.invariants.md` | PASS — 0 matches |
| `bash scripts/conventions-gate.sh` | PASS |
| AST import census | PASS — 48 updated, 0 old |
| Agent consumer drive | PASS — solo 1/1, machine quiet |
| LSP/hover consumer drive | PASS — solo 1/1, machine quiet |
| Narration consumer drive | PASS — solo 1/1, machine quiet |
| Terminal consumer drive | PASS — solo 1/1, machine quiet |
| Panel-split consumer drive | PASS — solo 1/1, machine quiet |
| `git diff --check` | PASS |

The only untracked worktree file is the supplied `TASK.md`; there are no uncommitted implementation
changes. No gate, push, merge, or tag was performed.
