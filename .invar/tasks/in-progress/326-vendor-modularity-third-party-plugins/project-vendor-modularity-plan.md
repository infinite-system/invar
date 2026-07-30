# Project vendor modularity plan

Status: stage 1 design for #326 (vendor modularity and third-party plugins)

This plan adds source-installed third-party modules without inventing a second plugin system.
It keeps the current contributor, provider, settings, pane, and lifecycle seams.

## Decision summary

- Use `vendor/module` as the stable module identity.
- Store installed source at `src/vendors/<vendor>/<module>/`.
- Use lowercase ASCII kebab-case for both identity segments.
- Allow digits after the first letter.
- Allow `-`. Do not allow `_`.
- Reserve `invar` and names that can impersonate built-in provenance.
- Make one declarative manifest the source of identity, version, compatibility, and provenance.
- Generate static imports from validated manifests before a build.
- Treat phase 1 modules as trusted same-process code.
- Keep kernel class composition outside the public third-party surface in phase 1.
- Require one colocated module contract from every installed module.
- Keep install, enable, activate, disable, and remove as different states and actions.
- Make removal restore the same core composition that existed before installation.

The first implementation phase is source-installed and restart-based. It does not load arbitrary
TypeScript beside an already-built executable.

## Current system census

### Composition and lifecycle

[AppLoader](../../../../src/modules/app/AppLoader.ts) asks
[DefaultPlugins](../../../../src/modules/plugins/DefaultPlugins.ts) for the shipped composition.
It passes that list into
[Bootstrap](../../../../src/modules/app/Bootstrap.ts).
Bootstrap creates one
[ApplicationContributions](../../../../src/modules/app/ApplicationContributions.ts) catalog and
activates every entry.

The shipped composition has 13 contributors. Nine also attach one contribution to every workspace.
Four are application-only.

| Current identifier | Display name | Workspace contribution |
| --- | --- | --- |
| `file-tree` | File Tree | yes |
| `git` | Git | yes |
| `markdown` | Markdown | yes |
| `language` | Language Intelligence | yes |
| `vue` | Vue | yes |
| `database-provider` | SQLite Provider | yes |
| `terminal` | Terminal | no |
| `inline-rewrite` | Inline Rewrite | yes |
| `source-text-editor` | Source Text Editor | no |
| `structure-navigator` | Structure Navigator | yes |
| `tasks-dashboard` | Tasks Dashboard | no |
| `database-consumer` | Database Explorer | yes |
| `extensions` | Extensions | no |

The exact order and names are asserted in
[DefaultPlugins.test.ts](../../../../src/modules/plugins/DefaultPlugins.test.ts).
Extensions cannot disable itself. The other 12 contributors appear as toggleable rows.

The lifecycle has two nested levels:

1. `activateApplication(context)` registers application projections and returns control to the host.
2. `workspaceContributor` lets the host call `attachWorkspace(workspace)` for every live workspace.

The application host owns registration disposers. It withdraws workspace contributions first.
It then calls `disposeApplication()`. It finally runs registration disposers in reverse order.

The workspace host registers each declared provider. It withdraws providers before it calls the
workspace contribution's `disposed()` method.

This is already the correct lifetime shape for third-party modules.

### Current contribution surface

The
[application contributor contract](../../../../src/modules/app/ApplicationContributor.interface.ts)
currently exposes these host routes:

- settings schema.
- keybinding defaults and keybinding guards.
- commands.
- primary and right dock content.
- movable dock content.
- editor-column default content.
- editor-surface claimants.
- status-bar segments and status probe projections.
- pane runtimes.
- shared popup and overlay hosts.
- theme, renderer, and workspace access.

The workspace contract exposes lifecycle and provider publication through
[WorkspaceContributor.interface.ts](../../../../src/modules/workspace/WorkspaceContributor.interface.ts).
Each workspace owns one
[ProviderRegistry](../../../../src/modules/plugins/ProviderRegistry.ts).
The registry stores `unknown` values under consumer-owned capability identifiers.

The registry is type-blind. A consumer supplies its own interface when it resolves a provider.
Later registrations win for singular capabilities. `resolveAll` supports providers that each
answer only some subjects.

These routes implement the root record
[Plugin boundaries grant one authority](../../../../project.invariants.md#plugin-boundaries-grant-one-authority).
Contributors register host projections. Providers answer typed questions. Hosted runtimes exchange
events or bytes with one reactive owner.

### Extensions knows activation, not installation

[ExtensionsPaneContent](../../../../src/modules/plugins/ExtensionsPaneContent.ts) reads four fields:
`identifier`, `name`, `enabled`, and `canDisable`.
It has no version, vendor, source, trust, compatibility, or failure state.

Its current “installs or uninstalls” label describes a session activation toggle.
`setEnabled` neither changes disk state nor persists a disabled choice across restart.
The new design must not reuse those words for two different actions.

### The removable Vue reference

[VuePlugin](../../../../src/modules/vue/VuePlugin.ts) is the reference third-party-shaped citizen.
It is a plain application contributor and workspace contributor.

Its workspace attachment returns one
[VueSyntaxSource](../../../../src/modules/vue/VueSyntaxSource.ts).
The source publishes through the generic `document-syntax-source` capability.
Generic editor, diff, folding, bracket, and Structure consumers do not import Vue.

Disabling Vue withdraws the provider. Existing `.vue` documents then use ordinary plain fallback
behavior. Re-enabling Vue constructs and registers a new source without restarting the workspace.

The governing records are
[Vue syntax is a removable SFC contribution](../../../../src/modules/vue/vue.invariants.md#vue-syntax-is-a-removable-sfc-contribution)
and
[Document syntax has one removable host port](../../../../src/modules/syntax/syntax.invariants.md#document-syntax-has-one-removable-host-port).

This polarity becomes the law for every vendored module:

> Remove the module and its source directory. Regenerate composition. No handwritten core file
> retains its identity, import, setting, command, pane, status key, provider, process, or behavior.

### ivue class and manifest constraints

Vendored code follows the same public-class rules as core code.
The rules are in
[project.conventions.md](../../../../project.conventions.md#class-kinds--file-shape-new-file-rule)
and
[project.ivue-reference.md](../../../../project.ivue-reference.md#1-the-three-class-kinds--the-namespace-pattern).

Every public class uses `class $X` and `namespace X`.
A class with statics publishes `$Class = Static($X)`.
A reactive controller selects `Class = Reactive($Class)`.
A plain class selects `Class = $Class`.

The manifest file is declarative JSON, not executable behavior.
The manifest loader, validator, catalog, and generated registry are public classes.
Their static members therefore use the ivue `Static()` anchor rule.

## Identity and naming

### Canonical identity

The canonical identity is:

```text
<vendor>/<module>
```

Version is not part of identity. One installation can activate only one version of an identity.

The canonical filesystem path is:

```text
src/vendors/<vendor>/<module>/
```

The same identity appears in Extensions, logs, status output, settings, lock records, diagnostics,
and future network records.

### Segment grammar

Both segments use this grammar:

```regex
^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$
```

Each segment is 1 to 64 ASCII characters.

The rules answer the naming questions directly:

- Alphanumeric characters are allowed.
- Digits are allowed after the first letter.
- A digit cannot start a segment.
- Hyphens are allowed between non-empty parts.
- Underscores are not allowed.
- Uppercase and Unicode are not allowed in identity.
- Display names can use spaces, case, and Unicode.
- Leading, trailing, or repeated hyphens are not allowed.

These rules keep one spelling on Linux, macOS, Windows, URLs, settings keys, and registry records.
They also remove case-folding and Unicode-homograph ambiguity from identity.

### Prior art and recommendation

[npm scopes](https://docs.npmjs.com/about-scopes/) use an account or organization namespace and
put packages below it. Only the scope owner can publish into that namespace.
[npm package names](https://docs.npmjs.com/creating-a-package-json-file/) are lowercase and may use
hyphens, dots, and underscores.

[VS Code extension identity](https://code.visualstudio.com/api/references/extension-manifest) is
`publisher.name`. Its extension name is lowercase without spaces.
[VS Code publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
registers an immutable publisher identifier before publication.

[Cargo registry guidance](https://doc.rust-lang.org/cargo/reference/registry-index.html#name-restrictions)
allows ASCII alphanumeric characters, `-`, and `_`. It requires an alphabetic first character,
limits names to 64 characters, compares case-insensitively, and treats `-` and `_` as collisions.
[crates.io publication](https://doc.rust-lang.org/cargo/reference/publishing.html#before-your-first-publish)
allocates names first come, first served.

[Java package guidance](https://docs.oracle.com/javase/specs/jls/se23/html/jls-6.html#jls-6.1)
uses reversed domain ownership to avoid a new central namespace registry.

The recommendation takes npm and VS Code's two-part identity.
It takes Cargo's portable first-character, ASCII, length, and collision rules.
It rejects `_` because `-` and `_` become equivalent in common toolchains.
It does not put reverse DNS into the path because the user asked for one human vendor segment.

### Reserved names

Reserve these vendor segments:

- `invar`.
- `invar-*`.
- `core`.
- `builtin`.
- `built-in`.
- `system`.
- `vendor`.
- `vendors`.

Also reject filesystem special names, including Windows device names such as `con`, `prn`, `aux`,
`nul`, `com1` through `com9`, and `lpt1` through `lpt9`.

The `invar` vendor belongs to shipped first-party modules.
No third party can claim it or use an `invar-*` lookalike.

A third party can use a module segment that resembles a core module because the full identity stays
different. For example, `acme/editor` does not collide with `invar/editor`.
Extensions must show the full identity and a third-party marker, so that name cannot impersonate
the built-in module.

### Global uniqueness is phased

A local checkout can enforce only local uniqueness.
Without an external authority, no code can guarantee that two people did not both claim `acme`.

Phase 1 therefore makes two honest guarantees:

1. A checkout refuses two installed modules with the same canonical identity.
2. A manifest records its source repository and optional domain claim for human review.

The vendor handle remains convention-based in phase 1. It is not globally proven.

A later registry binds one vendor handle to one account and public key.
Domain verification can strengthen that claim.
The registry refuses handle reuse and signs module-version records.

The identity does not include a server URL. That keeps it location-independent for the
[Invarnet north star](../../../../project.briefing.md#north-star-addition-user-2026-07-29-215x-verbatim).
A central registry can start the system. A later Invarnet claim ledger can replicate the same
signed identities without changing installed module IDs.

## Manifest and runtime model

### One declarative manifest

Each module root contains `invar.plugin.json`.
It is the only source of public module metadata.

Phase 1 fields are:

```json
{
  "schemaVersion": 1,
  "vendor": "acme",
  "module": "playstation",
  "displayName": "PlayStation Tools",
  "description": "Adds PlayStation project tools.",
  "version": "1.0.0",
  "invarApi": 1,
  "entrypoint": "./PlaystationPlugin.ts",
  "license": "MIT",
  "repository": "https://example.com/acme/playstation"
}
```

`vendor` and `module` must match their directory names.
`version` must be valid Semantic Versioning.
`invarApi` is an exact integer in phase 1 because no compatibility history exists yet.
The entrypoint must stay inside the module root.

The manifest does not repeat commands, settings, panes, or providers.
Those remain registrations through the live contributor seams.
A declarative contribution list would become a second copy and drift.

### Runtime definition

Discovery produces one runtime definition:

```text
manifest + provenance + contributor factory
```

The catalog owns metadata. The contributor owns behavior only.
This removes the current duplicate metadata fields from contributor instances.

Built-in definitions use provenance `built-in` and vendor `invar`.
Vendored definitions use provenance `third-party` and include install source and integrity data.

The generated registry imports each entrypoint statically.
Each entrypoint exports one normal namespace-backed contributor class.
The generator pairs that factory with the validated JSON manifest.

### State vocabulary

Use these words consistently:

- `installed`: source and a valid manifest exist on disk.
- `enabled`: composition policy selects the installed module for the next activation.
- `active`: its application contribution completed activation.
- `failed`: activation failed and the host retained the failure record.
- `disabled`: installed, but not selected for activation.
- `removed`: source and lock records no longer exist.

Extensions uses “Enable” and “Disable” for runtime policy.
The install command uses “Install” and “Remove” for disk changes.

## Identity propagation and collision control

The catalog computes the canonical identity once.
Plugins do not assemble their own prefix at each registration.

The scoped application context qualifies local names:

| Surface | Stored identity |
| --- | --- |
| plugin catalog | `acme/playstation` |
| setting | `acme/playstation.<local-setting>` |
| command | `acme/playstation.<local-command>` |
| pane content | `acme/playstation:<local-pane>` |
| status projection key | `acme/playstation:<local-key>` |
| keybinding layer | `plugin:acme/playstation` |
| log and failure source | `acme/playstation` |

Provider capability identifiers remain consumer-owned.
For example, Vue still publishes `document-syntax-source`.
Prefixing that capability with its provider identity would prevent peer rendezvous.

The provider registry instead records the owner identity beside each provider registration.
Withdrawal still occurs through the returned disposer.

The catalog validates all plugin identities before it activates any contributor.
A duplicate identity is a boot composition error with both source paths in the message.
It must never silently skip one contributor.

## Extensions surface

Extensions gains these fields for every row:

- display name.
- full canonical identity.
- built-in or third-party provenance.
- installed version.
- enabled, active, failed, or incompatible state.
- source repository when present.
- failure detail.
- whether the module can be disabled or removed.

The compact row can read:

```text
[x] PlayStation Tools  third-party · acme/playstation · 1.0.0
```

The selected detail view can show compatibility, source, license, trust warning, and failure text.
Built-in rows show `built-in · invar/<module>`.

Extensions remains a generic catalog projection.
It must not import a vendored implementation or branch on a module identity.

## Install and removal story

### Phase 1 directory install

An install is a source-tree operation:

1. Copy an exported module tree into `src/vendors/<vendor>/<module>/`.
2. Run `bun run vendors:sync`.
3. Validate the path, manifest, API version, record, and duplicate identity set.
4. Update `src/vendors/vendor-lock.json`.
5. Generate `src/vendors/VendorModules.generated.ts`.
6. Run the module checks and the repository gate.
7. Rebuild and restart Invar.

The installed directory contains no nested `.git`.
The invariant checker treats a nested Git checkout as another checkout and skips it.

The sync command never runs module code.
It reads data, validates paths, and writes deterministic generated composition.

`vendor-lock.json` records identity, version, source, and content integrity.
The generated TypeScript file contains imports and factories only.
Neither file becomes a second metadata source.

### Compiled executable boundary

Phase 1 does not support copying TypeScript beside `dist/iv`.
The compiled binary contains the generated static imports from its build.

This matches the source-plus-law distribution in
[project.vision.md](../../../../project.vision.md#8-the-emacs-inversion--shipping-the-ability-to-grow).
The user's agent installs source, runs the local law, rebuilds, and restarts.

An out-of-tree binary package format belongs to a later phase.

### Removal

Removal performs the reverse operation:

1. Disable and deactivate the module.
2. Remove only the owned module directory and its lock entry.
3. Regenerate the static registry.
4. Run the gate.
5. Rebuild and restart.

Clean removal means no handwritten core edit is needed.
The generated registry and lock change because they are composition records.

Dependency removal stays outside phase 1 because phase 1 modules can use only the published Invar
surface and dependencies already present in the root package.
A later installer can manage isolated package dependencies and lock changes.

## Trust boundary

### Enforceable today

The current system can enforce:

- TypeScript interface compatibility at build time.
- Manifest syntax, path confinement, identity grammar, and local uniqueness.
- One selected API schema version.
- Host registration disposal for settings, keybindings, panes, and providers.
- Reverse-order application disposal.
- Workspace-provider withdrawal.
- The rule that plugin keybindings cannot reserve host chords.
- Contract structure and annotation references.
- The local merge gate before rebuild.
- Visible built-in or third-party provenance in Extensions.

### Enforceable in phase 1 after small host changes

Phase 1 can also enforce:

- catalog validation before activation.
- no silent duplicate identity.
- one scoped identity on every host-mediated registration.
- activation failure recorded against the correct module.
- a failed third-party module not aborting the host canvas.
- removal tests that detect retained host registrations.
- deterministic static registry generation.
- no nested checkout in an installed tree.

### Honor-system in phase 1

Vendored TypeScript runs in the Invar process with the user's permissions.
It can import Node or Bun APIs directly.

The host cannot stop it from:

- reading or writing arbitrary files.
- starting processes.
- using the network.
- importing internal Invar modules.
- mutating objects reached through broad context references.
- creating untracked timers, listeners, or processes.
- retaining secrets.
- bypassing scoped registration helpers through direct imports.

The gate can detect known patterns. It is not a security boundary.
A manifest permission list would be descriptive only in phase 1, so phase 1 must not present one as
enforcement.

### Later isolation

A real sandbox needs an out-of-process plugin host or another enforced runtime boundary.
That host would expose capability-based RPC for files, processes, network, panes, settings, and
providers.

Isolation is outside phase 1.
The public additive interfaces should stay serializable where practical, so later isolation does
not require a new identity or manifest.

Kernel `Class` replacement remains trusted and boot-time only.
Third-party phase 1 modules use additive contributor and provider interfaces.
They do not receive the kernel composition seam.

## Contract layer

Every installed module must ship:

```text
src/vendors/<vendor>/<module>/<module>.invariants.md
```

The record uses the canonical invariant schema.
It names the module's contributor, providers, external resources, removal polarity, and acceptance
drive.

The module can also ship a lattice record when several records produce a real composition.
It must not create a lattice only to restate atomic records.

The existing checker discovers every `*.invariants.md` under the repo root.
It excludes `.git`, `.claude`, `.invar`, and nested checkouts.
A normal `src/vendors` module therefore enters the checker automatically.

The sync command adds an earlier, clearer failure when the required module record is absent.
The repository checker remains the authority for record shape and links.

Stage 2 phase 1 should add or refine these records:

- [project.invariants.md](../../../../project.invariants.md): add installed vendor-module governance
  and keep the plugin-free host guarantee.
- [plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md): add canonical
  identity, provenance, catalog validation, failure containment, and clean removal.
- [app.invariants.md](../../../../src/modules/app/app.invariants.md): record generated composition
  before activation.
- [settings.invariants.md](../../../../src/modules/settings/settings.invariants.md): qualify vendor
  setting identities while preserving saved disabled settings.
- [keybindings.invariants.md](../../../../src/modules/keybindings/keybindings.invariants.md): bind
  vendor layers to canonical identity.
- [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md): keep Extensions generic and show
  provenance.
- Add a vendor-domain contract beside the future discovery code. It governs manifest validation,
  static generation, and lock integrity.

The accepted implementation must not weaken
[The host canvas is complete without plugins](../../../../project.invariants.md#the-host-canvas-is-complete-without-plugins).

## Phases and acceptance

### Phase 1 - trusted source-installed modules

Build:

- manifest schema and validator.
- canonical identity value and reserved-name checks.
- built-in and third-party provenance.
- deterministic `src/vendors` discovery and generated registry.
- pre-activation collision validation.
- combined built-in and vendored composition.
- vendor-scoped setting, command, pane, status, provider-owner, and keybinding registrations.
- Extensions provenance, version, compatibility, and failure state.
- one reference vendored module that uses existing additive seams.
- clean disable, re-enable, failure, and removal behavior.

Keep outside phase 1:

- marketplace search or download.
- arbitrary post-build directory loading.
- independent dependency installation.
- hot code reload.
- kernel class replacement.
- cryptographic signatures.
- global namespace proof.
- runtime sandboxing.
- automatic updates.
- Invarnet transport.

Acceptance drives:

1. Drive defaults with no vendored modules. The current 13-entry built-in composition stays usable.
2. Drive a small fixture with the reference module installed. Extensions shows full provenance and
   version.
3. Drive the shared 100,000-line fixture with the same install. The plugin lifecycle fingerprint
   matches the small drive.
4. Disable and re-enable the reference module in Extensions. Every contributed projection and
   provider leaves and returns without a workspace restart.
5. Plant a retained registration in the reference module. The removal contract must fail, then pass
   after restoration.
6. Plant a duplicate `vendor/module` identity. Composition must fail before either duplicate
   activates and must name both paths.
7. Exercise allowed and rejected names, including hyphen, underscore, digit-first, uppercase,
   reserved, Windows-device, and 64-character boundaries.
8. Remove the reference module directory, sync composition, and drive again. Core behavior matches
   the no-vendor baseline, with zero handwritten core reference to that identity.
9. Plant a missing or malformed module record. Sync or the invariant checker must fail, then pass
   after restoration.
10. Make the reference module throw during activation. Extensions records the failure and the host
    canvas remains usable.
11. Run `bun run build`. Launch the compiled executable and observe the same vendored composition.
12. Run one final full verification pass and the invariant checker.

The new checks need planted-red positive controls before their green results count as evidence.

### Phase 2 - built-in namespace migration and an install command

Build:

- migration of built-in local setting, command, pane, status, and keybinding names.
- persistent enabled policy.
- `iv vendor install`, `iv vendor remove`, `iv vendor enable`, and `iv vendor disable`.
- local-directory and Git-source installation.
- staged extraction and content-integrity verification.
- package dependency policy and lock integration.
- update and rollback records.

Acceptance adds install, restart, update, rollback, and removal from clean scratch clones.
Every destructive action uses an explicit confirmation.

### Phase 3 - global registry and discovery

Build:

- vendor handle reservation.
- account and public-key ownership.
- optional domain verification.
- signed version records.
- marketplace discovery.
- immutable identity history.
- transport-independent registry replication.

The first registry can be centralized.
Its records must remain portable to a later Invarnet ledger.

### Phase 4 - isolated execution

Build an out-of-process host with enforced capabilities.
Move filesystem, process, network, and secret access behind explicit grants.

This phase must preserve the phase 1 identity and manifest.
It can add an enforced permission section under a new manifest schema version.

## Invariant analysis of this plan

Scope comes from the proposed `src/vendors` tree, plugin catalog, provider registry, Extensions,
settings, keybindings, UI, and boot composition.

The plan upholds:

- the plugin-free host canvas.
- one authority per plugin boundary.
- host-carried provider rendezvous.
- independent plugin lifetimes.
- plugin settings in contributed schema.
- removable document syntax.
- the ivue namespace and `Static()` anchor forms.
- seams drawn at shared generators.

The plan strengthens clean removal by making identity and provenance catalog-owned.
It also strengthens collision handling by validating the full set before activation.

The trust claim is deliberately narrow.
The plan does not call same-process TypeScript safe or sandboxed.

## Ranked open questions for the user

1. **Approve source-installed phase 1?** Recommended: yes. Install into `src/vendors`, gate, rebuild,
   and restart. Do not promise binary drop-ins yet.
2. **Approve lowercase kebab-case identity?** Recommended: allow digits after the first letter,
   allow `-`, reject `_`, uppercase, and Unicode.
3. **Approve handle registration later?** Recommended: use human vendor handles with an immutable
   registry and optional domain verification. Do not force reverse DNS into the directory name.
4. **Approve additive authority only?** Recommended: third-party phase 1 modules use contributor and
   provider seams. Keep kernel class replacement trusted and unsupported for distribution.
5. **Approve the trust label?** Recommended Extensions wording: “Third-party, trusted same-process
   code.” Do not show a permissions list until enforcement exists.
6. **What should the reference module be?** Recommended: a small `example/playstation` module that
   contributes one pane, one setting, one command, one status key, and one workspace provider.
   Keep it as a test fixture unless the user wants it shipped.
7. **Should built-ins adopt `invar/<module>` visibly in phase 1?** Recommended: yes in catalog and
   Extensions. Preserve current local command and pane IDs until phase 2 qualifies every surface.
8. **Should activation failures degrade all plugins or only third parties?** Recommended: record and
   isolate every contributor failure. The plugin-free host record already requires a live canvas.
9. **Should disabled policy persist in phase 1?** Recommended: no. Keep phase 1 focused on source
   discovery and clean lifecycle. Add persisted enable policy with the install command in phase 2.
