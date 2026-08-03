## In plain words

The app kept walking through the active workspace whenever it needed the editor or document. I changed those callers to use the short names. Non-test code and harness paths now contain no old chains.

## Result

Task #483 (shortcut getters replace the chains) is READY at commit `d4627c778f0aff5ef42d9bf9125698bd266d0ea8`.

The commit changes 24 files. The worktree is clean. I added no production shortcut getters.

Three old chains remain in [WorkspaceSet.test.ts](../../../../src/modules/workspace/WorkspaceSet.test.ts). These assertions prove each shortcut equals its underlying source.

## Census

The [task census](483-shortcut-getter-census.ts) parses TypeScript and inspects graph-path string literals. Its built-in positive control covers all three old chain shapes.

| Measure | Before | After |
| --- | ---: | ---: |
| Old chain sites | 126 | 3 |
| Old non-test chain sites | 112 | 0 |
| Old test chain sites | 14 | 3 |
| Old harness graph-path strings | 9 | 0 |
| Shortcut users | 6 | 66 |

I chose a local `workspace` variable at 41 sites. Each site reads the editor and another active-workspace member in one operation.

## Changes

- Nine graph paths now use `activeEditor` or `activeDocument`. The changes cover the two example drives, the MCP test, and the scrollbar smoke.
- Single-concept app reads now use `activeEditor`, `activeDocument`, or `activeLanguageProviderNotice`.
- Multi-concept operations read `workspaceSet.active` once and use a local `workspace` variable.
- Long-lived callbacks still resolve the active workspace when they run. No callback captures the selected workspace during registration.
- Partial WorkspaceSet test doubles now publish the shortcut getters that their production callers require.
- [StructureDefaultVisibility.ts](../../../../src/modules/structure/StructureDefaultVisibility.ts) now declares `activeDocument` in its narrow WorkspaceSet input seam.

## Invariant review

The change upholds [Derived state is a plain getter unless caching is proven](../../../../project.invariants.md). It adds no cache and no production getter.

The converted path reached the live editor and document at 10 and 100,000 lines. This upholds [The composition graph reaches every installed contributor](../../../../src/modules/system/system.invariants.md).

The nine harness conversions changed only path names. Their predicates and completion rules stayed the same. This upholds [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md).

The final checker resolved 1,374 annotations and 266 lattice links with zero problems.

## Drive evidence

Before the edit, the old and short document paths returned the same file and line count. The shared fixtures returned 10 and 100,000 lines.

After the edit, a real `Down` key moved the cursor from line 0 to line 1 at both scales. The converted `workspaceSet.activeDocument.lineCount` path returned 10 and 100,000.

The default `--open` probe used the task file path as a workspace and had no active document. I then used the shared 10-line fixture without changing settings.

## Verification

- `bun scripts/harness/smoke-scrollbars-harness.ts` passed at 500 and 100,000 lines.
- `bun test scripts/harness/InvarMcpServer.test.ts` passed 1 test with 42 expectations.
- The first full test run exposed 11 incomplete WorkspaceSet test doubles. After their correction, the focused run passed 23 tests with 72 expectations.
- Final `bun test` passed 2,353 tests with 72,111 expectations across 353 files.
- `bunx tsc --noEmit` exited 0.
- `bash scripts/conventions-gate.sh` passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` reported 0 problems.
- `git diff --check` passed before commit.
- The census positive control exited 1 after I removed one planted old chain. It reported `Shortcut census positive control failed.` I restored the control, and the final census passed.

The task forbids the merge gate. An initial commit attempt started its hook because I omitted `SKIP_GATE=1`. I stopped the task-owned processes before completion. The final commit used `SKIP_GATE=1`.

## Instrument feedback

EASY: The warm drive server and shared scale fixtures made the small and large graph checks quick. The graph error named the null node precisely.

CONFUSING: `--serve --open` treated the task file as the workspace root. The screen showed the filename, but `activeDocument` was null.

MISSING: The AST tool has no rooted member-chain census mode. The task needed the committed [task census](483-shortcut-getter-census.ts).

## Bycatch

- The [filed task](task-483-shortcut-getters-replace-the-chains.md) states 168 chain sites. The structural before count is 126. The text count matched the `editor` prefix inside `editorSurfaces` and one comment. I reproduced the mismatch twice before editing.
- The [round brief](brief-483-1-shortcut-getters-replace-the-chains.md) omitted path-implicated contracts for app, commands, editor, inline-rewrite, structure, UI, and workspace. I confirmed the gap through the touched paths and the final checker. No contract was violated.
- The invariant checks reported 16 existing punctuation notes and 49 existing reverse-pointer or lattice coverage entries. I observed this once in the final checker. The checker still reported zero problems.
- The conventions gate reported 20 known legacy grammar violations in monitoring, plugins, vendors, and vue. I observed this once in the final gate. It reported no new enforced violation.
- No runtime or visual bycatch appeared in the small or large drives.
