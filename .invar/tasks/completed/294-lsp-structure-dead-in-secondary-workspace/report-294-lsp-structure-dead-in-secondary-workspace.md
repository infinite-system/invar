# READY — LSP and structure in a secondary workspace (#294)

## Result

READY with a negative diagnosis.

The reported failure does not reproduce on commit `9030ffc20619c01ee793b01f5e1f057e3339b80d`.
I did not change production code because the current per-workspace generator already works.
The branch adds the missing PTY regression contract and two repeatable probes.

The contract opens two TypeScript projects in one session. It proves diagnostics, structure,
typed hover, process root, and switches through secondary → primary → secondary.

## Reproduction

I drove the real app before I wrote an assertion.

The [generic two-workspace probe](294-secondary-workspace-language-probe.ts) created two separate
TypeScript projects. Each had its own `tsconfig.json`, imported interface, and deliberate type
error.

The secondary default-server observation was:

```text
activeWorkspaceRoot=/tmp/.../second-typescript-project
activeBuffer=/tmp/.../second-typescript-project/main.ts
lspProvider=typescript
diagnosticsCount=2
structureStatus=ready
structureRows=3
structureRequests=1
language server cwd=/tmp/.../second-typescript-project
hover: const secondaryValue: SecondaryShape
```

The same probe passed with `INVAR_294_TYPESCRIPT_SERVER=typescript-language-server`.
Its secondary server also used the secondary project as `cwd`.

The [Realized workspace probe](294-realized-workspace-language-probe.ts) then opened
`/home/parallels/dev/realized` as the second workspace. It opened the non-empty
`shared/test.ts` file without changing that repository.

```text
activeWorkspaceRoot=/home/parallels/dev/realized
activeBuffer=/home/parallels/dev/realized/shared/test.ts
lspProvider=typescript
diagnosticsCount=0
structureStatus=ready
structureRows=5
structureRequests=1
language server cwd=/home/parallels/dev/realized
hover: const userRegistrationSchema: z.ZodObject<...>
```

The zero diagnostic count is correct for that valid file. The frame showed the Zod type,
five structure rows, and the complete source text.

I discarded one false signal. The first Realized probe opened `shared/index.ts`, which is a
real zero-byte file. Its “No symbols in this file” result was correct and is not evidence for
this task.

## Ranked suspect measurements

1. **LSP project root, `rootUri`, and `cwd`: cleared.**
   Each workspace created one new language-server process. `/proc/<pid>/cwd` matched the active
   workspace root exactly. [LanguageClient](../../../../src/modules/lsp/LanguageClient.ts)
   builds `rootUri` and `workspaceFolders` from the same per-client `rootPath`.

2. **Structure support bound to workspace zero: cleared.**
   Both supported fixtures published `structureRequests=1`, `structureStatus=ready`, and
   `structureRows=3`. The manifest drive also kept the unsupported-file polarity:
   zero requests and the stated “No structure available” result. This upholds
   [A structure source answers or declines never blanks](../../../../src/modules/structure/structure.invariants.md#a-structure-source-answers-or-declines-never-blanks).

3. **Per-workspace plugin surface does not rebind: cleared.**
   [WorkspaceSet](../../../../src/modules/workspace/WorkspaceSet.ts) attaches the contributor to
   every workspace. [LspWorkspaceProvider](../../../../src/modules/lsp/LspWorkspaceProvider.ts)
   receives each root in `opened`, releases its client in `suspended`, and recreates it in
   `resumed`. The PTY contract observed the correct process root and language features after
   secondary → primary → secondary switches.

The shared generator is already the per-workspace `LspWorkspaceProvider` lifecycle. No
single-root capture exists in the current branch.

## Change

Commit: `9030ffc20619c01ee793b01f5e1f057e3339b80d`

- Extended the [workspace-tabs PTY contract](../../../../scripts/harness/smoke-workspace-tabs-harness.ts).
- Added small TypeScript fixtures to both workspace roots.
- Added diagnostics, structure, hover, and language-server `cwd` assertions.
- Kept the existing scale pair: 3 tiny tracked directories versus 520 wide tracked directories.
- Added the [generic two-server probe](294-secondary-workspace-language-probe.ts).
- Added the read-only [Realized workspace probe](294-realized-workspace-language-probe.ts).

## Positive control

I temporarily changed `LspWorkspaceProvider.opened` to reuse the first workspace root.
The new contract went red on the secondary arm:

```text
FAIL second-language.ts has one language server rooted at its active workspace
```

The secondary hover still looked plausible. The process-root fingerprint caught the defect.
I removed the plant and reran the contract green.

## Verification

- `bunx tsc --noEmit` — pass.
- `bun test` — 1,934 pass, 0 fail, 68,673 expectations across 296 files.
- `bun scripts/harness/smoke-workspace-tabs-harness.ts` — ALL-PASS.
- `bun scripts/harness/smoke-plugin-manifest-harness.ts` — ALL-PASS.
- `bun scripts/harness/smoke-editor-harness.ts` — ALL-PASS.
- `bash scripts/conventions-gate.sh` — PASS.
- Invariant checker `--all` — pass.
- Invariant checker `--refs` — 1,134 annotations, 222 lattice links, 0 problems.
- Full pre-commit merge gate — ALL-PASS.
- Worktree — clean.

The full gate reported one panel-chrome retry. The first attempt timed out under starvation.
The quiet retry passed. The gate records this as a flake, not an unconditional green.

## Invariant verdict

The change upholds the in-scope records:

- [LSP is a provider plugin](../../../../src/modules/lsp/lsp.invariants.md#lsp-is-a-provider-plugin).
- [Client disposal releases the server](../../../../src/modules/lsp/lsp.invariants.md#client-disposal-releases-the-server).
- [Provider rendezvous is host carried](../../../../src/modules/plugins/plugins.invariants.md#provider-rendezvous-is-host-carried).
- [Workspace and file navigation are separate layers](../../../../src/modules/workspace/workspace.invariants.md#workspace-and-file-navigation-are-separate-layers).
- [File access is confined to a single root](../../../../src/modules/system/system.invariants.md#file-access-is-confined-to-a-single-root).

No invariant downgrade was required.

## Bycatch

- The full gate’s [panel-chrome harness](../../../../scripts/harness/smoke-panel-chrome-harness.ts)
  timed out once under starvation and passed its quiet retry. It did not fail a second time.
- The Realized workspace published two unsupported task-variable errors for
  `${LOCAL_DIR#/Users/one/Parallels/ubuntu2}` and one displaced built-in `Claude` task.
  The same errors appeared in two probe runs.
- Contract drift: [File access is confined to a single root](../../../../src/modules/system/system.invariants.md#file-access-is-confined-to-a-single-root)
  says every `Files` read and list operation calls the confinement guard. In
  [Files](../../../../src/modules/system/Files.ts), `read`, `readBytes`, `list`, and `listNamesResult`
  accept paths directly. The record and implementation do not match.
- Contract-layer gap: no record states directly that a language server’s `cwd`, `rootUri`, and
  workspace folder must match its owning workspace after every switch. Existing provider and
  lifecycle records imply the rule, but none claims this exact boundary.
- Distillation possibility: the two task probes and the workspace-tabs harness each inspect
  published subprocess IDs through `/proc`. They share one process-fingerprint generator.
  This task does not choose whether that task-local measurement should become a shared harness seam.
