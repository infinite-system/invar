# READY — Name the three plugin kinds (#103)

## Result

READY on `refactor-plugin-kinds`.

Commit: `853db510721f2d686cabd43e0ca26af0cc514d2a`

The taxonomy holds after one refinement: it classifies each boundary contract
by the authority it grants, not an entire feature module by what it happens to
contain. A shipped package may compose roles, but one contract cannot grant
more than one role.

The three names are:

1. **Contributor** — pushes registrations into the host canvas.
2. **Provider** — answers typed domain questions pulled by the host.
3. **Hosted runtime** — exchanges an owned event or byte stream with one
   reactive owner.

## Citizen census

| Citizen | Classification | Evidence and boundary |
| --- | --- | --- |
| `GitPlugin` | Contributor | Implements `ApplicationContributor` and `WorkspaceContributor`; registers a pane, editor surface, commands, status, and workspace lifecycle. |
| `MarkdownPlugin` | Contributor | Implements both contributor scopes; registers the preview surface, commands, title action, status, and per-workspace preview state. |
| `ExtensionsPlugin` | Contributor | Application-only. Its old empty `attachWorkspace` implementation exposed a false interface inheritance and has been removed. |
| `LanguageProvider` | Provider | Accepts a document position/context and returns completion answers. `LanguageClient` privately owning an LSP process does not change the authority of its outward provider contract. |
| Agent backends | Hosted runtime | `AgentBackend` carries prompt/event/lifecycle traffic. `AgentSession` is the sole reactive owner and folds events into state. |
| Terminal | Composed boundaries | `TerminalBackend` is the hosted runtime; `TerminalPaneContent` is its projection. The original citizen-level taxonomy leaked here, so the invariant now applies per boundary rather than pretending the whole terminal module has one role. |

No boundary straddles two kinds after that refinement. Git and Markdown use
application and workspace variants of the same contributor authority.

## Code changes

- Renamed `ApplicationPlugin` to `ApplicationContributor` and
  `WorkspacePlugin` to `WorkspaceContributor`, including filename-following-
  interface renames.
- Removed the inheritance that forced every application contributor to be a
  workspace contributor.
- Added the explicit optional
  `ApplicationContributor.workspaceContributor` port. Git and Markdown opt in
  with themselves; Extensions does not.
- Renamed `ApplicationPluginContext` to
  `ApplicationContributionContext`.
- Annotated `LanguageProvider`, `AgentBackend`, and `TerminalBackend` at their
  respective provider/runtime boundaries. No generic runtime base was added:
  agent events and terminal bytes do not share a generator beyond the
  invariant, so a common interface would be fake machinery.
- Added contributor-scope tests and removed the prohibited
  `Class.prototype` reads from `GitPlugin.test.ts`.

## Contract

Added the chosen invariant **Plugin boundaries grant one authority** to
`project.invariants.md`, with Scope, Components, Mechanism, Generates,
Rejected alternatives, Evidence, Impossible-if-true, Verification, and
provisional status.

The explicit impossibilities are:

- a provider cannot paint or register a pane;
- a contributor cannot answer completion/definition queries through its
  contribution contract;
- a hosted runtime cannot mutate ivue refs directly instead of delivering its
  stream to the reactive owner;
- an application-only contributor cannot be forced to fabricate workspace
  lifecycle.

Also refined **The host canvas is complete without plugins** to remove language
intelligence from the canvas enumeration, as directed by the owner, and
updated `project.canvas-census.md` so language extraction is ready rather than
blocked on that decision.

Rejected alternatives recorded in the contract:

- one universal plugin interface;
- classification by private implementation resources;
- collapsing request/answer providers with owned-session runtimes.

## Deferred language extraction

No language capability moved in this task.

The next extraction is now direct:

1. Move `LanguageClient` lifecycle behind a default-composed language package,
   using the existing document-lifecycle and gutter-decoration contribution
   ports.
2. Broaden `LanguageProvider` only to the semantic questions `Workspace`
   already asks: definition, hover, completion, diagnostics, references, and
   trigger characters.
3. Give the host one provider slot and make its six request paths delegate
   through that slot.
4. Remove `LanguageClient`, `TypeScriptProvider`, LSP wire types, process
   construction, vendor workaround, and disposal knowledge from `Workspace`.
5. Keep the provider contract surface-free; any lifecycle/decorations needed
   by the shipped language package compose through its separate contributor
   boundary.

## Coverage declaration

Appended to `project.coverage-deltas.md`:

- `DefaultPlugins.test.ts`: assertions 1 → 2, waits 1 → 1.
- `ExtensionsPlugin.test.ts`: assertions 2 → 3, waits 1 → 1.
- `GitPlugin.test.ts`: assertions 3 → 4, waits 1 → 1.
- `MarkdownPlugin.test.ts`: assertions 13 → 13, waits 9 → 9.
- `WorkspaceSet.test.ts`: assertions 15 → 15, waits 3 → 3.

The coverage ratchet confirmed no undeclared decrease against `bf07aba`.

## Verification

The frozen install ran before implementation. Every verification command after
it ran against committed tip `853db51`:

| Command | Exit | Result |
| --- | ---: | --- |
| `bun install --frozen-lockfile` | 0 | 151 packages installed |
| `bunx tsc --noEmit` | 0 | no diagnostics |
| `bun test` | 0 | 1,503 pass, 0 fail, 16,765 expects |
| `bun scripts/check-file-grammar.ts` | 0 | 439 files, 0 violations |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | 0 | 9 reality + 23 chosen project invariants; all contracts pass |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` | 0 | 783 annotations, 45 links, 0 problems |
| `bash scripts/conventions-gate.sh` | 0 | PASS, including plugin boundary |
| `bun scripts/check-coverage-ratchet.ts` | 0 | no undeclared decrease |
| `bash scripts/behavioral-contracts.sh` | 0 | ALL-PASS |

`git ls-files | grep '^TASK'` returned no files. The worktree is clean.

## Integration note

`origin/main` advanced while this builder was running. The branch is one commit
ahead and six commits behind `origin/main`; the six incoming commits are the
concurrent keyboard-invariant series and include a small `Bootstrap.ts` change.
Per the task, this builder did not merge. The conductor must merge current main
and re-run the checks on the combined tree.

COMPACTION: none

conventions @ `e0476d687c354daac606ba45d688d4ad467b81dc`

---

## Merge verification — 2026-07-26

READY after merging moved `origin/main` into `refactor-plugin-kinds`.

Merge commit: `80a1559cd01f9ed650d18f4debe5579b662466a7`

Parents:

- contributor taxonomy: `853db510721f2d686cabd43e0ca26af0cc514d2a`
- moved main: `63a992335e61b753d40f9f9f607bc7f3ce9d41ba`

### Conflict resolution

`project.coverage-deltas.md` was the only textual conflict produced by this
merge. Both sides had appended independent coverage rows, so the resolution
was their exact union:

- retained the contributor-taxonomy rows for `DefaultPlugins`,
  `ExtensionsPlugin`, `GitPlugin`, `MarkdownPlugin`, and `WorkspaceSet`;
- retained the keyboard-invariant rows for keybinding defaults, registry and
  platform tests, editor indentation, PTY input encoding, and the driven
  keyboard smoke.

`src/modules/app/Bootstrap.ts` and
`src/modules/workspace/Workspace.ts` merged automatically rather than
producing conflict markers, but both were manually reviewed as semantic
integration hotspots:

- `Bootstrap.ts` keeps main's retired-F-key chord descriptions and
  `editor.indent` / `editor.outdent` action wiring while using
  `ApplicationContributor`, projecting only defined
  `workspaceContributor` ports into `WorkspaceSet`, and activating and
  disposing application contributors through the renamed contract.
- `Workspace.ts` keeps main's Ctrl+] definition gesture description while
  accepting `WorkspaceContributor[]` and attaching each contributor through
  the renamed workspace contribution port.

No duplicate action keys or parallel plugin paths were introduced. The
integration upholds both **Focus owns the keystroke** and **Plugin boundaries
grant one authority**.

### Rename sweep

The required command
`grep -rn "ApplicationPlugin\|WorkspacePlugin" src scripts --include='*.ts'`
exited 1 with no output, meaning zero old-name matches. There are no historical
TypeScript mentions to justify. AST identifier sweeps also found zero
`ApplicationPlugin` and zero `WorkspacePlugin` identifiers.

File-name-follows-content remains intact:
`ApplicationContributor.interface.ts` and
`WorkspaceContributor.interface.ts` are the renamed interface files. Both the
file-grammar and conventions gates pass.

### Post-merge verification

The commit hook formatted staged files before creating the merge commit, so
the complete matrix below was rerun against committed tip `80a1559`.

| Command | Exit | Result |
| --- | ---: | --- |
| `bun install --frozen-lockfile` | 0 | 152 installs across 170 packages; no changes |
| `bunx tsc --noEmit` | 0 | no diagnostics |
| `bun test` | 0 | 1,530 pass, 0 fail, 16,878 expects across 233 files |
| `bun scripts/check-file-grammar.ts` | 0 | 443 files, 0 violations |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | 0 | every contract passed |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` | 0 | 803 annotations and 45 links resolved, 0 problems |
| `bash scripts/conventions-gate.sh` | 0 | PASS, including zero text-input census |
| `bun scripts/check-coverage-ratchet.ts` | 0 | 289 files inspected, no undeclared decrease against `63a9923` |
| `bash scripts/behavioral-contracts.sh` | 0 | ALL-PASS |

The invariant checker emitted only its existing informational coverage and
canonical-name notes; it reported zero problems.

### Repeated user-path drives

Both semantic integration hotspots were driven three consecutive times
against committed tip:

| Smoke | Run 1 | Run 2 | Run 3 | Result |
| --- | ---: | ---: | ---: | --- |
| `bash scripts/smoke-keyboard-invariant.sh` | 0 | 0 | 0 | PASS: indentation, replacement chords, terminal pass-through, reserved overrides |
| `bash scripts/smoke-workspace-tabs.sh` | 0 | 0 | 0 | ALL-PASS: workspace construction, contributor lifecycle, one live watcher, switching and restoration |

The keyboard smoke's required one run was therefore exceeded with three clean
runs. This builder performed no `scripts/merge-gate.sh`, push, main-branch
landing, tag, or branch deletion.

After the merge commit, a read-only ref audit observed that the conductor in
the primary worktree had independently fast-forwarded local `main` to
`80a1559` at 2026-07-26 12:36:46 -0400 (`main` reflog:
`merge refactor-plugin-kinds: Fast-forward`) and updated `origin/main` by push
to the same commit at 2026-07-26 12:40:37 -0400. This builder did not move or
push either ref.

The repository worktree is clean.

COMPACTION: none

conventions @ `e0476d687c354daac606ba45d688d4ad467b81dc`
