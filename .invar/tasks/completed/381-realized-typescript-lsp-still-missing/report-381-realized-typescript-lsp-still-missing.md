# READY #381 — TypeScript LSP outside the launch workspace

Commit: `9647aa725649ab89e602d5342078ac4b28fe27ae`

GATE_EXIT: 1

## Outcome

The fix is committed and the worktree is clean.

The packaged app now finds Invar's installed TypeScript server from an external workspace.
It still starts one server for the active workspace only.
The server process keeps the active workspace as its working directory.

The final gate stayed red because an unrelated editor smoke timed out twice.
All task-related checks passed, including the binary build and workspace language smoke.

## Reproduction

The existing [source-mode Realized probe](../../completed/294-lsp-structure-dead-in-secondary-workspace/294-realized-workspace-language-probe.ts) was green.
It painted structure and a typed hover in `/home/parallels/dev/realized`.
Its `tsgo` process used `/home/parallels/dev/realized` as its working directory.

The same probe failed against the current compiled `dist/iv`.
The app opened `/home/parallels/dev/realized/shared/test.ts`, but it published these facts:

```text
lspStatus=unavailable
lspProvider=null
subprocessPids=[]
structureStatus=unavailable
tooltipVisible=false
```

This reproduces the user's field condition.
The live field app also ran a deleted 10:56 binary.
Its only `tsgo` child stayed rooted at `/home/parallels/dev/invar`.

## Cause

[TypeScriptProvider](../../../../src/modules/lsp/TypeScriptProvider.ts) searched two places:

1. The active workspace's `node_modules/.bin`.
2. The process `PATH`.

Source mode worked because `bun run` added Invar's `node_modules/.bin` to `PATH`.
The compiled binary did not get that path.
External projects therefore had no discoverable `tsgo` or `typescript-language-server`.

The first ranked candidate was false on current source.
Each workspace already owns its own lazy client and process root.

The second ranked candidate measured true.
Server discovery depended on the active workspace and the launch environment.
It did not include the app's own dependency root.

## Change

[TypeScriptProvider](../../../../src/modules/lsp/TypeScriptProvider.ts) now searches in this order:

1. The active workspace's `node_modules/.bin`.
2. The app launch root's `node_modules/.bin`.
3. The process `PATH`.

This keeps a project-local server override first.
It also lets the packaged app use its installed server for every workspace.
The process still starts with the active workspace as `cwd`.

[TypeScriptProvider.test.ts](../../../../src/modules/lsp/TypeScriptProvider.test.ts) locks both lookup priorities.
It proves that an external workspace uses the app server.
It then adds a workspace server and proves that the workspace server wins.

## Driven verification

I rebuilt the fixed source to `/tmp/invar-381-fixed-iv`.
The compiled binary then passed the same Realized drive:

```text
activeWorkspaceRoot=/home/parallels/dev/realized
lspProvider=typescript
structureStatus=ready
structureRows=5
hover=const userRegistrationSchema: z.ZodObject<...>
language server cwd=/home/parallels/dev/realized
```

The [workspace tabs PTY contract](../../../../scripts/harness/smoke-workspace-tabs-harness.ts) passed.
Its tiny root has 3 tracked directories.
Its wide root has 520 tracked directories.
Both roots painted diagnostics, structure, and typed hover.
Each arm reported one server rooted at its active workspace.

The default 10-line and 100,000-line drives also passed.

## Positive control

I temporarily removed the app-root fallback.
The new unit contract failed with exit 1:

```text
Expected command:
/tmp/invar-typescript-provider-.../application/node_modules/.bin/tsgo

Received:
null
```

I restored the fallback.
The test then passed with 3 tests, 0 failures, and 6 expectations.

## Verification

- `bunx tsc --noEmit` passed.
- `bun test src/modules/lsp/TypeScriptProvider.test.ts` passed.
- The invariant structure checker passed.
- The invariant reference checker resolved 1,265 annotations and 231 lattice links with 0 problems.
- The compiled-binary build passed.
- The workspace language smoke passed.
- The Markdown and tasks-dashboard smokes passed in isolation after unrelated gate failures.
- The one-worker full gate ended with `GATE_EXIT=1` because the editor smoke timed out twice.

The final gate logs are in
[the one-worker failure directory](/tmp/merge-gate-failures.9b127598c16833e1.3224244).
The exact editor failures are the
[first attempt](/tmp/merge-gate-failures.9b127598c16833e1.3224244/smoke-editor-harness-.attempt1.log)
and [second attempt](/tmp/merge-gate-failures.9b127598c16833e1.3224244/smoke-editor-harness-.log).

## Invariant verdict

PASS for the task diff.

- [Cost tracks the actively observed set](../../../../project.invariants.md#cost-tracks-the-actively-observed-set) is upheld.
  Only the active workspace owns a TypeScript server.
- [LSP activation follows semantic demand](../../../../src/modules/lsp/lsp.invariants.md#lsp-activation-follows-semantic-demand) is upheld.
  The fallback changes discovery only and does not start an idle server.
- [Server failures remain contained](../../../../src/modules/lsp/lsp.invariants.md#server-failures-remain-contained) is strengthened.
  The compiled app no longer degrades to unavailable when its own server is installed.
- [Language services coexist by document](../../../../src/modules/workspace/workspace.invariants.md#language-services-coexist-by-document) is upheld.
  The change does not share clients or alter provider routing.
- [Symbol structure is analyzer knowledge](../../../../src/modules/structure/structure.invariants.md#symbol-structure-is-analyzer-knowledge) is upheld.
  The external workspace reaches its analyzer again.

No invariant downgrade was required.

## Bycatch

- The first six-worker gate lost the READY task target in the tasks-dashboard drive.
  The same smoke passed in isolation.
- The second six-worker gate failed the Markdown preview-row lookup.
  The same smoke passed in isolation across 500 and 100,000 lines.
- The bounded-list and scrollbar smokes needed quiet retries in the second gate.
  The scrollbar smoke also needed one retry in the first gate.
- The one-worker editor smoke timed out twice while waiting for a screen change.
  This is the final gate blocker.
  See the linked attempt logs above.
