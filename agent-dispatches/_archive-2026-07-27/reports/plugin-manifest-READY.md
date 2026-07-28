# READY — plugin manifest contributions

Commit: `3f79514a775cddf2c71543734f3c285d69b12e4f`

## Result

- Extended `ApplicationContributionContext` with typed setting and keybinding
  registrations; no parallel manifest format was introduced.
- Added reversible `ApplicationContributions` activation. Extensions now
  disables and re-enables shipped contributors through the same lifecycle.
- Moved Git, Markdown, and File Tree settings into their plugins and rendered
  them under plugin-owned Settings headings. File Tree's contributed hidden-file
  setting has a driven live effect.
- Moved all shipped plugin actions out of the host keybinding floor. Plugin
  layers sit above host/platform defaults and below user rebinds.
- Plugin layers reject `reserved` or `reservedBecause` claims before
  registration.
- Restored Git pane Tab-to-leave from the Git layer. Editor Tab still indents.
- Disable removes workspace controllers, panes, commands/status hooks, settings
  rows, and bindings; re-enable restores them.
- Extended the plugin-boundary scan to production settings files with a
  setting-shaped positive control. All four domains are now zero tolerance.

## Boundary ratchet

- `src/modules/keybindings/KeybindingDefaults.ts` source-control lines:
  **13 before → 0 after**.
- The separate hard-coded registry context was also removed:
  `KeybindingRegistry.ts` **1 before → 0 after**.
- Committed production keybinding scan: **0** source-control matches.

## Real-path drives

`scripts/smoke-plugin-manifest.sh` drives all three acceptance paths in every
run: contributed headings plus a live setting effect; Git Tab versus editor
Tab; and Extensions uninstall/reinstall removing/restoring schema and bindings.

- Run 1: exit `0`
- Run 2: exit `0`
- Run 3: exit `0`
- Post-audit run: exit `0`
- Adjacent Activity Bar harness: exit `0`

## Checker exits

- `bun install --frozen-lockfile`: exit `0`
- `bunx tsc --noEmit`: exit `0`
- `bun test`: exit `0` — 1538 pass, 0 fail, 16898 expectations
- `bun scripts/check-file-grammar.ts`: exit `0`
- invariant checker `--all`: exit `0`
- invariant checker `--refs`: exit `0` — 814 annotations, 45 lattice links,
  0 problems
- `bash scripts/conventions-gate.sh`: exit `0`
- `bun scripts/check-coverage-ratchet.ts`: exit `0`
- `bash scripts/behavioral-contracts.sh`: exit `0`,
  `behavioral-contracts: ALL-PASS`

The coverage movements are appended to `project.coverage-deltas.md`. The
settings ownership, layer precedence, and plugin-reservation invariants are
recorded in the relevant contracts.

`scripts/merge-gate.sh` was not run. The worktree is clean, and
`git ls-files | grep '^TASK'` exits `1` with no output.
