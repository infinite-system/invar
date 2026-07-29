# READY — Extract LSP as a provider plugin (#114, Wave A)

## Result

Committed as `abd0989` (`Extract LSP as provider plugin (#114)`) on
`feat-lsp-provider`. The worktree is clean.

LSP now ships as `LspPlugin` in `DefaultPlugins`. Its one application manifest
contributes the TypeScript-server setting, file-size setting, Ctrl+Space
completion binding, Ctrl+] definition binding, and workspace contributor.
`LspWorkspaceProvider` registers the existing `LanguageProvider` capability
through `WorkspaceContribution.providers`, owns `LanguageClient`, document
lifecycle, diagnostic decorations, and the TypeScript import-specifier re-hop.
`Workspace` resolves capabilities from its existing contribution list.

No new plugin kind, registry, or manifest format was added.

## Host-reference census

Starting command:

```sh
grep -rln "modules/lsp/" --include='*.ts' \
  src/modules/app src/modules/workspace src/modules/ui |
  grep -v '\.test\.'
```

Starting result: 4 files, exit 0.

```text
src/modules/app/Bootstrap.ts
src/modules/workspace/Workspace.ts
src/modules/ui/CompletionPopup.ts
src/modules/ui/EditorPane.ts
```

What each host file wanted:

- `Bootstrap.ts`: document-revision synchronization and completion request
  orchestration.
- `Workspace.ts`: language-client construction/lifecycle, document sync,
  completions, diagnostics, definition, hover, size notices, diagnostic
  decoration translation, and the TypeScript import-specifier re-hop.
- `CompletionPopup.ts`: completion item/list shapes and protocol-kind
  classification.
- `EditorPane.ts`: the definition gesture contract used by editor interaction.

Ending result: no output, exit 1 (no matches). A separate production-import
census for relative `lsp/` imports also returned no matches.

Nothing in the production host remained coupled. The test-only
`Workspace.goToDefinition.test.ts` deliberately imports the concrete LSP
adapter and fake process to exercise the integration; it is excluded by the
specified production census.

The host-facing semantic records now live in
`src/modules/workspace/LanguageProvider.interface.ts`. LSP-private server
launch records live in `LanguageServerProvider.interface.ts`, and rewrite
records moved to the inline-rewrite module.

## Driven behavior

Defaults were driven before extraction and again after extraction with
`bun run drive`.

Post-extraction real PTY results:

- `smoke-completion-harness.ts`: ALL-PASS with the mock Rust provider, real
  tsgo at 20 lines, and real tsgo at 100,000 lines. Popup opening, item marks,
  navigation, filtering, and exact acceptance remained intact.
- `smoke-diagnostics-harness.ts`: ALL-PASS for tsgo pull diagnostics and
  typescript-language-server push diagnostics, including the far diagnostic,
  underline, overview mark, and hover message.
- `smoke-goto-definition-harness.ts`: ALL-PASS for Ctrl+click and Ctrl+].
- `smoke-hover-harness.ts`: ALL-PASS for render, selection/copy, and dismissal.

Scale parity was therefore exercised at both 20 and 100,000 lines for the
completion path.

## Uninstall positive control

`smoke-plugin-manifest-harness.ts` drives Extensions through the real PTY and
passed:

- Language Intelligence is present and can be uninstalled.
- Its `Language` settings section disappears.
- Its workspace provider and subprocess status disappear.
- Existing diagnostics clear.
- The status bar renders `Language features unavailable — no provider
  installed`.
- Ctrl+Space and Ctrl+] remain inert without changing the buffer, cursor, or
  active file.
- Hover input leaves the application live on the same provider-empty state.
- Reinstall restores the settings and LSP provider.

The new provider-registration unit check also received a planted positive
control: changing `providers` from `[this]` to `[]` made
`LspWorkspaceProvider.test.ts` fail with exit 1. Restoring `[this]` returned it
to exit 0.

## Contracts

`src/modules/lsp/lsp.invariants.md` now states `LSP is a provider plugin` and
records manifest activation, provider registration, uninstall symmetry, the
host import prohibition, and verification commands. Related root, workspace,
UI, and canvas records were updated to remove the former migration-state
description.

## Final verification

Exact exit codes from the restarted final pass:

```text
bunx tsc --noEmit
exit 0

bun test
exit 0
1675 pass, 0 fail, 67534 expect() calls across 254 files

bash scripts/conventions-gate.sh
exit 0
479 TypeScript files, 0 legacy violations

node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs
exit 0
889 annotations, 67 lattice links, 0 problems

bun scripts/check-coverage-ratchet.ts
exit 0
312 files inspected, no undeclared decrease
```

The invariant totals remain above the required 884 annotations / 67 lattice
links / 0 problems.

`scripts/merge-gate.sh` was not run. Nothing was pushed, merged, tagged, or
deleted.

## Bycatch

None observed.
