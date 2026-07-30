# Project vendor modularity plan

Status: revised stage 1 design for #326 (vendor modularity and third-party plugins)

This plan adds network-installed third-party modules without inventing a second plugin system.
It keeps the current contributor, provider, settings, pane, lifecycle, and kernel seams.

## Decision summary

- Use `vendor/module` as the stable module identity.
- Store immutable installed versions below the user's Invar data directory.
- Use lowercase ASCII kebab-case for both identity segments.
- Allow digits after the first letter.
- Allow `-`. Do not allow `_`.
- Reserve `invar` and names that can impersonate built-in provenance.
- Let users install from Extensions or with `iv plugin install vendor/module`.
- Download an already-gated, immutable version. Do not gate, rebuild, or require a source checkout.
- Load external TypeScript from the compiled executable during the next startup.
- Make one declarative manifest the source of identity, version, compatibility, and declared
  kernel overrides.
- Put the quality gate at registry admission, once for each immutable module version.
- Bind the registry attestation to the manifest, content digest, API result, contracts, and
  provenance.
- Treat phase 1 modules as trusted same-process code.
- Allow kernel class overrides through the kernel composition seam when the manifest declares every
  target.
- Show override authority as a loud warning in Extensions.
- Give override-carrying publications and upgrades the strongest network-edge review.
- Require one colocated module contract from every installed module.
- Keep install, enable, activate, disable, and remove as different states and actions.
- Make removal restore the same core composition that existed before installation.

The first implementation phase is network-installed and restart-based.
Source installation remains an explicit developer path.

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

> Remove the installed artifact and composition record, then restart. No handwritten core file
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
The manifest loader, validator, catalog, and runtime discovery service are public classes.
Their static members therefore use the ivue `Static()` anchor rule.

### Current kernel seam is only the ordering guard

[Kernel](../../../../src/modules/kernel/Kernel.ts)
currently stores anonymous seal hooks.
It runs them once and rejects registration after seal.
[Bootstrap](../../../../src/modules/app/Bootstrap.ts)
seals that list before it constructs `App`.

The current kernel has no named class catalog, extension-factory stack, dependency graph,
composition diagnostics, or plugin identity.
No shipped contributor registers a kernel hook.
The fuller mechanism described by
[The app is built only after the kernel is sealed](../../../../project.invariants.md#the-app-is-built-only-after-the-kernel-is-sealed)
exists in the sibling ivue reference example, not in this product implementation.

Declared third-party overrides must therefore extend the kernel seam itself.
They cannot be described as a manifest-only wire-up to an already-complete implementation.
The shared generator remains the kernel class graph: named base classes, ordered extension
factories, namespace `Class` publication, and one seal before construction.

## Identity and naming

### Canonical identity

The canonical identity is:

```text
<vendor>/<module>
```

Version is not part of identity. One installation can activate only one version of an identity.

The canonical installed-version path is:

```text
<invar-data>/vendors/<vendor>/<module>/<version>/
```

On Linux, `<invar-data>` follows `XDG_DATA_HOME` and defaults to
`~/.local/share/invar`.
The path provider must use the native user-data convention on macOS and Windows.
One atomic installed-version record selects the active version for each identity.

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

### Global uniqueness starts at network admission

A developer checkout can enforce only local uniqueness.
It cannot prove that two people did not both claim `acme`.
Developer-linked modules therefore carry unverified local provenance and never claim global
ownership.

Every distributed phase 1 module enters through a registry.
The registry binds one vendor handle to one account and public key before it admits a version.
Optional domain verification strengthens that claim.
The registry refuses handle reuse and version mutation.
It signs an immutable module-version record that includes the canonical identity and content
digest.

The identity does not include a server URL.
That keeps it location-independent for the
[Invarnet north star](../../../../project.briefing.md#north-star-addition-user-2026-07-29-215x-verbatim).
An Invar-operated registry can bootstrap admission.
The signed vendor claims, version records, and content-addresses can then replicate through
Invarnet.
Any Invar instance can serve an admitted artifact.
The client trusts the signed record and digest, not the server that supplied the bytes.

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
  "repository": "https://example.com/acme/playstation",
  "kernelOverrides": [
    {
      "target": "invar/editor/Editor",
      "kind": "extend",
      "export": "PlaystationEditorExtension",
      "reason": "Adds PlayStation project editing behavior."
    }
  ]
}
```

`vendor` and `module` must match their directory names.
`version` must be valid Semantic Versioning.
`invarApi` is an exact integer in phase 1 because no compatibility history exists yet.
The entrypoint must stay inside the module root.

The manifest does not repeat commands, settings, panes, or providers.
Those remain registrations through the live contributor seams.
A declarative contribution list would become a second copy and drift.

`kernelOverrides` is different.
Kernel authority changes the construction graph before the contributor lifecycle exists.
The manifest must declare each target, composition kind, exported factory, and plain-language
reason.
An empty list means the module has no kernel authority.

`extend` is the phase 1 override form.
The exported factory subclasses the selected kernel class and can override its methods.
It stays inside the kernel's ordered `super` chain.
Direct assignment to a namespace `Class` binding is not an admitted override because it bypasses
the graph, declaration, and composition order.

The registry owns admitted provenance and integrity.
Those values do not come from self-claims in this manifest.
Its signed version record carries the vendor key, source revision, content digest, gate identity,
gate result, and admission time.

### Runtime definition

Runtime discovery produces one definition:

```text
manifest + signed admission + content digest + contributor factory + declared kernel factories
```

The catalog owns metadata. The contributor owns behavior only.
This removes the current duplicate metadata fields from contributor instances.

Built-in definitions use provenance `built-in` and vendor `invar`.
Distributed definitions use provenance `third-party · network-gated`.
Developer-linked definitions use provenance `third-party · local developer code`.

The compiled host loads distributed entrypoints by absolute file URL before boot.
Each entrypoint exports one namespace-backed contributor factory and any declared kernel extension
factories.
The loader supplies a versioned host API object.
Distributed code does not import paths under `src/modules`.
The public SDK provides TypeScript types for authoring, while the runtime object carries the live
registration capabilities.

The network artifact must be self-contained.
Every relative import stays inside its version directory.
The edge gate rejects unresolved bare imports or bundles them into the immutable artifact.
This prevents the user's unrelated `node_modules` tree from changing an admitted version.
Phase 1 artifacts contain portable TypeScript and JavaScript only.
Native add-ons and platform-specific artifact variants wait until the admission identity can name
them without weakening the once-per-version rule.

The loader reads all manifests and admission records first.
It rejects invalid or mutated artifacts before it runs module code.
It imports accepted entrypoints in parallel, then registers their definitions in canonical identity
order.
It registers every declared kernel factory before
[Bootstrap](../../../../src/modules/app/Bootstrap.ts) seals the kernel.
It then passes the combined built-in and third-party contributor list through the existing
application lifecycle.

### State vocabulary

Use these words consistently:

- `installed`: an immutable artifact and valid manifest exist in the user's Invar data directory.
- `admitted`: the network edge signed this exact identity, version, and content digest after its
  quality gate.
- `verified`: the local bytes match the signed admitted record.
- `enabled`: composition policy selects the installed module for the next startup.
- `active`: its application contribution completed activation.
- `failed`: activation failed and the host retained the failure record.
- `disabled`: installed, but not selected for activation.
- `removed`: artifact selection and install records no longer exist.
- `developer-linked`: a local source path is selected outside the distribution network.

Extensions uses “Enable” and “Disable” for runtime policy.
The install command uses “Install” and “Remove” for disk changes.
Phase 1 applies install, update, enable, disable, and remove on restart.
This one rule also makes kernel composition honest: existing instances never change class.

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

Kernel targets use their own stable identity:

```text
invar/<module>/<Class>
```

The kernel owns this catalog.
A distributed module cannot invent a target or reach a target that the kernel has not published for
extension.
The runtime registration API receives the caller's canonical module identity and rejects an
undeclared target or export.
The kernel records the ordered module identities beside each composed class for diagnostics.

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
- network-gate signer and admission result.
- the exact kernel targets that the module overrides.

The compact row can read:

```text
[x] PlayStation Tools  third-party · acme/playstation · 1.0.0
```

The selected detail view can show compatibility, source, license, trust warning, and failure text.
Built-in rows show `built-in · invar/<module>`.

An additive third-party row carries a visible `NETWORK-GATED` mark.
An override-carrying row carries a stronger `KERNEL OVERRIDE` warning even when it is disabled.
The detail view lists every target, composition kind, reason, and the version in which that
authority first appeared.
Install or update requires confirmation when a version adds or expands kernel authority.
The confirmation names the exact targets.
It must not collapse them into a generic “elevated permissions” prompt.

Developer-linked modules carry an `UNVERIFIED LOCAL CODE` warning.
They never inherit the network-gated mark from another version with the same identity.

Extensions remains a generic catalog projection.
It must not import a vendored implementation or branch on a module identity.

## Install and removal story

### Primary user path

The primary user is replacing `vi`, not developing Invar.
The two equivalent entry points are:

```text
Extensions → search acme/playstation → Install
iv plugin install acme/playstation
```

The command can also select an exact version:

```text
iv plugin install acme/playstation@1.0.0
```

The installer:

1. Resolves the vendor claim and immutable version record from the distribution network.
2. Requires an admission signed by a trusted network-edge gate.
3. Downloads the content-addressed artifact into an owned staging directory.
4. Verifies the record signature, exact manifest bytes, artifact digest, API version, platform, and
   declared kernel authority.
5. Extracts with path confinement into
   `<invar-data>/vendors/<vendor>/<module>/<version>/`.
6. Atomically updates the installed-version record.
7. Reports `Installed; restart iv to activate`.

It does not run contracts, run the repository gate, invoke a compiler, rebuild `iv`, or require an
Invar source checkout.
Signature, digest, schema, and compatibility checks are install integrity checks.
They are not a second quality gate.

Extensions calls the same installer service as the command.
The two surfaces cannot acquire different extraction, verification, warning, or rollback behavior.

### Compiled executable boundary, verified

The current
[AppLoader](../../../../src/modules/app/AppLoader.ts)
always passes
[DefaultPlugins](../../../../src/modules/plugins/DefaultPlugins.ts)
straight to Bootstrap.
Current `iv` therefore does not discover an external plugin directory.
That missing loader is product work for stage 2.

The Bun runtime inside a compiled executable can cross the required boundary.
The committed
[compiled-runtime plugin-loading probe](326-compiled-runtime-plugin-loading-probe.ts)
used Bun 1.3.14 to build a host with `bun build --compile`.
It created every plugin file only after the binary existed.
The compiled process then dynamically imported:

- external JavaScript in 3.531 to 3.698 milliseconds across two runs.
- external TypeScript in 3.517 to 3.638 milliseconds across two runs.
- a relative second external TypeScript module from that entrypoint.

The TypeScript fixture contained an interface, type annotations, and an extensioned `.ts` import.
A JavaScript parser cannot accept that source unchanged.
Malformed TypeScript exited 1 as the positive control.
The measurements prove runtime loading and transpilation on this machine.
They are capability evidence, not a startup performance promise.

[Bun's executable documentation](https://bun.sh/docs/bundler/executables)
states that a compiled executable includes the Bun runtime.
[Bun's runtime documentation](https://bun.sh/docs/runtime)
states that imported files are transpiled before execution.
[Bun's file-type documentation](https://bun.sh/docs/runtime/file-types)
lists `.ts`, `.tsx`, `.mts`, and `.cts` as runtime loaders.
The direct probe closes the remaining gap between those general claims and this exact compiled-host
case.

The stage 2 loader belongs before `Bootstrap.boot()`.
It resolves installed versions, verifies their admission and content, imports their entrypoints,
registers declared kernel factories, and then asks Bootstrap to seal and construct the app.
No rebuild is involved.

### Network-edge gate

Quality gating runs once for each immutable `vendor/module@version` at entry to the distribution
network.
The result is bound to the content digest.
The registry refuses a second artifact under the same version.
Mirrors and Invarnet peers replicate the signed result; they do not rerun the gate.

The admission pipeline verifies:

- canonical identity, reserved names, manifest schema, and Semantic Versioning.
- vendor-account and source-revision provenance.
- a closed, reproducible artifact and its content digest.
- the required module contract and contract references.
- declared API compatibility against the supported public SDK.
- runtime import closure and a compiled-host load probe.
- contributor activation, failure containment, disposal, and clean removal.
- small and 100,000-line acceptance where the contribution touches document or frame paths.
- absence of undeclared kernel registration.

An upgrade that carries a kernel override receives the strongest path.
In addition to the common gate, it:

- compares the new override set with the previous admitted version.
- rejects an override target that the public kernel catalog does not expose.
- checks that every runtime registration exactly matches a manifest declaration.
- composes the factory through the real kernel graph before seal.
- runs the target module's contracts and the plugin's own contract.
- drives the behavior with and without the override at small and large scale.
- proves that removal restores the unextended class graph.
- records added, removed, and changed targets in the signed admission.

Every gate instrument needs a planted-red control before its first accepted green result.
The admission service stores the command, tool versions, result digest, and provenance so another
Invarnet node can audit the result without trusting a prose verdict.

This gate is a quality and provenance boundary.
It is not a runtime sandbox.

### Developer source path

Module authors work from a normal source checkout outside the user's installed-version directory.
An explicit command such as:

```text
iv plugin dev-link /absolute/path/to/playstation
```

selects that local tree for the next startup.
Extensions labels it `UNVERIFIED LOCAL CODE`.
The developer path may run module checks and the repository gate during authoring.
Publication sends a clean source revision to the network-edge gate.
Ordinary install never uses this path.

### Removal

Removal performs an owned data change:

1. Mark the identity absent from the next startup composition.
2. Atomically update the installed-version record.
3. Restart so additive contributions withdraw and the kernel graph returns to its base composition.
4. Remove only inactive, owned artifact versions after rollback retention expires or the user asks
   for immediate cleanup.

Clean removal means no handwritten core edit is needed.
The data record changes because it is the user's composition.
The binary and source tree do not change.

Rollback only changes the active immutable version and restarts.
It never reconstructs an old artifact from mutable registry state.

## Trust boundary

### Enforceable today

The current system can enforce:

- TypeScript interface compatibility at build time.
- Host registration disposal for settings, keybindings, panes, and providers.
- Reverse-order application disposal.
- Workspace-provider withdrawal.
- The rule that plugin keybindings cannot reserve host chords.
- Contract structure and annotation references.
- kernel sealing before application construction.

### Enforceable in phase 1 after small host changes

Phase 1 can also enforce:

- manifest syntax, extraction confinement, identity grammar, and local uniqueness.
- signed network admission for the exact identity, version, and content digest.
- one selected public API schema version.
- catalog and artifact validation before activation.
- no silent duplicate identity.
- one scoped identity on every host-mediated registration.
- activation failure recorded against the correct module.
- a failed third-party module not aborting the host canvas.
- removal tests that detect retained host registrations.
- deterministic runtime composition.
- an entrypoint and static relative import closure that resolve inside the admitted artifact.
- no kernel target or factory registration absent from the manifest.
- declared kernel factories registered before seal.
- visible built-in, network-gated, local-developer, and kernel-override provenance in Extensions.

### Honor-system in phase 1

Distributed TypeScript runs in the Invar process with the user's permissions.
It can import Node or Bun APIs directly.

The host cannot stop it from:

- reading or writing arbitrary files.
- starting processes.
- using the network.
- probing objects or modules that the Bun runtime makes reachable.
- dynamically importing code outside the admitted artifact.
- mutating objects reached through broad context references.
- creating untracked timers, listeners, or processes.
- retaining secrets.
- lying in behavior that the admission tests do not cover.

The edge gate can detect known patterns and exercised failures.
Its signature proves which bytes passed that review.
Neither claim is a security boundary after those bytes execute.
A manifest permission list would be descriptive only in phase 1, so phase 1 must not present one as
enforcement.

Kernel declarations are narrower.
The host can enforce which published kernel targets the plugin registers through the plugin API.
The declaration does not stop arbitrary same-process side effects.
Extensions must therefore show both facts: the exact declared kernel authority and the
same-process trust warning.

### Later isolation

A real sandbox needs an out-of-process plugin host or another enforced runtime boundary.
That host would expose capability-based RPC for files, processes, network, panes, settings, and
providers.

Isolation is outside phase 1.
The public additive interfaces should stay serializable where practical, so later isolation does
not require a new identity or manifest.

Kernel override factories remain same-process and boot-time only.
They pass through the declared kernel composition seam before seal.
Install, enable, disable, update, rollback, and removal take effect on restart so no live instance
changes class.

## Contract layer

Every published artifact must ship:

```text
<module>.invariants.md
```

The record uses the canonical invariant schema.
It names the module's contributor, providers, external resources, declared kernel targets, removal
polarity, and acceptance drive.

The module can also ship a lattice record when several records produce a real composition.
It must not create a lattice only to restate atomic records.

At registry admission, the gate extracts the candidate into a clean module workspace and runs the
invariant checker against the module record, public API records, and every declared kernel target
record.
The signed admission binds that result to the artifact digest.

The user's installer does not run the checker.
It verifies the admission signature and digest.
This is the exact division between one network-edge quality gate and every-install integrity
verification.

Stage 2 phase 1 should add or refine these records:

- [project.invariants.md](../../../../project.invariants.md): add installed vendor-module governance
  and keep the plugin-free host and sealed-kernel guarantees.
- [plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md): add canonical
  identity, signed provenance, runtime loading, catalog validation, failure containment, and clean
  removal.
- [app.invariants.md](../../../../src/modules/app/app.invariants.md): record external discovery and
  kernel registration before boot composition.
- [settings.invariants.md](../../../../src/modules/settings/settings.invariants.md): qualify vendor
  setting identities while preserving saved disabled settings.
- [keybindings.invariants.md](../../../../src/modules/keybindings/keybindings.invariants.md): bind
  vendor layers to canonical identity.
- [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md): keep Extensions generic and show
  provenance and declared kernel authority.
- Add a vendor-domain contract beside the future install and discovery code. It governs manifest
  validation, admission verification, atomic installation, runtime loading, lock integrity, and
  rollback.
- Add a network-admission contract beside the registry gate. It governs once-per-version admission,
  immutable digests, provenance, API checks, contract checks, and the stronger kernel-override
  path.
- Refine the kernel record so the public override target catalog, declaration match, composition
  order, seal, and removal polarity are executable claims.

The accepted implementation must not weaken
[The host canvas is complete without plugins](../../../../project.invariants.md#the-host-canvas-is-complete-without-plugins).

## Phases and acceptance

### Phase 1 - network-installed runtime modules

Build:

- manifest schema and validator.
- canonical identity value and reserved-name checks.
- a minimal registry admission service with immutable signed version records.
- the once-per-version network-edge gate.
- content-addressed, self-contained runtime artifacts.
- `iv plugin install`, update, rollback, remove, enable, disable, and developer-link commands.
- the same install service behind the Extensions surface.
- platform user-data paths, staged extraction, content verification, and an atomic installed-version
  and enabled-state record.
- pre-boot discovery and dynamic external TypeScript loading in the compiled executable.
- a versioned runtime plugin API.
- built-in, network-gated, local-developer, and kernel-override provenance.
- deterministic runtime composition.
- pre-activation collision validation.
- combined built-in and vendored composition.
- vendor-scoped setting, command, pane, status, provider-owner, and keybinding registrations.
- a public kernel override target catalog and declaration-matched registration before seal.
- Extensions install, restart, provenance, version, compatibility, failure, and loud kernel-authority
  state.
- one admitted reference module that exercises additive and declared kernel seams.
- clean restart-based disable, re-enable, update, rollback, failure, and removal behavior.

Keep outside phase 1:

- rich marketplace browsing, ratings, and recommendations.
- hot code reload.
- live class mutation.
- undeclared or direct namespace replacement outside the kernel graph.
- runtime sandboxing.
- automatic updates.
- multi-registry federation and Invarnet artifact transport.

Acceptance drives:

1. Drive defaults from a compiled `iv` with no vendored modules. The current 13-entry built-in
   composition stays usable.
2. Admit the reference version at the registry edge. Prove its common gate and kernel-override gate
   go red on planted defects, restore them, and admit the immutable digest once.
3. From a clean home directory with no source checkout, run
   `iv plugin install example/playstation`. Assert that no compiler, contract checker, repository
   gate, or `iv` rebuild runs.
4. Repeat the install through Extensions. Both paths produce the same installed-version record and
   exact kernel warning.
5. Restart the unchanged compiled binary. Drive a small fixture and show full identity, version,
   network admission, active state, and exact override targets in Extensions.
6. Drive the shared 100,000-line fixture with the same artifact. The contributed behavior and
   lifecycle fingerprint match the small drive.
7. Plant an invalid admission signature and a post-admission byte change. The client must reject
   both before import, then accept the restored artifact.
8. Plant a runtime kernel registration absent from the manifest. The edge gate and host registration
   API must each reject it.
9. Publish a new version that adds an override target. The edge gate must run the stronger target
   checks, and Extensions must require confirmation that names the new target.
10. Disable and restart. Every additive registration leaves, the kernel graph returns to base, and
    no instance changes class while live. Re-enable and restart to restore it.
11. Make the reference contributor throw during activation. Extensions records the failure and the
    plugin-free host canvas remains usable.
12. Roll back to the prior immutable version without a download, gate, compile, or rebuild. Restart
    and show its exact digest and override set.
13. Remove the module and restart. Core behavior matches the no-vendor baseline, with no handwritten
    core reference to that identity.
14. Exercise allowed and rejected identities, including hyphen, underscore, digit-first, uppercase,
    reserved, Windows-device, and 64-character boundaries.
15. Run the committed compiled-runtime loading probe. JavaScript, TypeScript-only syntax, and a
    relative TypeScript import must load; malformed TypeScript must fail.
16. Run one final full verification pass and the invariant checker.

The new checks need planted-red positive controls before their green results count as evidence.

### Phase 2 - namespace migration and distribution depth

Build:

- migration of built-in local setting, command, pane, status, and keybinding names.
- dependency and artifact optimization based on phase 1 measurements.
- richer Extensions search, version history, changelogs, and admission evidence.
- offline artifact export and import that preserves signed admission.
- publisher tooling for submission, gate status, and failure reproduction.

Acceptance adds offline install, publisher failure reproduction, and migration from legacy built-in
identities.

### Phase 3 - Invarnet distribution

Build:

- replicated vendor claims and immutable version records.
- content-addressed artifact exchange between Invar instances.
- admission-signer rotation and quorum policy.
- registry discovery without putting a registry location into module identity.
- conflict and revocation records that retain history.

The phase 1 registry is one network citizen.
Invarnet changes who carries records and bytes, not identity, manifest, artifact, or client
verification.

### Phase 4 - isolated execution

Build an out-of-process host with enforced capabilities.
Move filesystem, process, network, and secret access behind explicit grants.

This phase must preserve the phase 1 identity and manifest.
It can add an enforced permission section under a new manifest schema version.
Kernel overrides remain in-process by definition.
An isolated module that requests one must surface that explicit transition and pass the strongest
admission path.

## Invariant analysis of this plan

Scope comes from the user-data vendor tree, network admission, runtime plugin catalog, kernel,
provider registry, Extensions, settings, keybindings, UI, and boot composition.

The plan upholds:

- the plugin-free host canvas.
- one authority per plugin boundary.
- host-carried provider rendezvous.
- independent plugin lifetimes.
- plugin settings in contributed schema.
- removable document syntax.
- kernel composition before seal.
- the ivue namespace and `Static()` anchor forms.
- seams drawn at shared generators.

The plan strengthens clean removal by making identity and provenance catalog-owned.
It also strengthens collision handling by validating the full set before activation.
It lets third-party code override published kernel classes without bypassing the kernel graph.
The declaration, admission evidence, runtime registration, Extensions warning, and restart
semantics all derive from that one authority change.

The trust claim is deliberately narrow.
The plan does not call same-process TypeScript safe or sandboxed.
It does not confuse an edge gate with a runtime security boundary.

## Ranked open questions for the user

The verdict settles the primary user path, the network-edge gate, and the legality of declared
kernel overrides.
These are the remaining choices, in order:

1. **How should new kernel authority be confirmed?** Recommended: require an exact-target
   confirmation for first install and for any update that adds or expands an override. A repeated
   update with the identical admitted target set can use normal update confirmation.
2. **Who signs phase 1 admission?** Recommended: start with one Invar-operated admission key and an
   append-only public log. Design the record for later Invarnet replication and signer quorum.
3. **What artifact dependency rule should phase 1 use?** Recommended: admit one self-contained
   runtime tree. Resolve or bundle every third-party dependency at the edge. Never resolve against
   the user's unrelated `node_modules`.
4. **Which kernel targets are public first?** Recommended: expose a short catalog backed by real
   target contracts. A class is not overridable merely because it has a namespace `Class` binding.
5. **What should the reference module be?** Recommended: a test-only `example/playstation` module
   that contributes one pane, setting, command, status key, and workspace provider, and overrides
   one harmless published editor target. It proves both authority paths without shipping a novelty
   feature.
6. **Should every phase 1 composition change require restart?** Recommended: yes. One restart rule
   makes additive and kernel modules predictable. Consider hot additive activation only after the
   installed lifecycle is stable.
7. **Approve lowercase kebab-case identity?** Recommended: allow digits after the first letter,
   allow `-`, and reject `_`, uppercase, and Unicode.
8. **Should built-ins adopt `invar/<module>` visibly in phase 1?** Recommended: yes in catalog and
   Extensions. Preserve current local command and pane IDs until phase 2 qualifies every surface.
9. **Approve the trust label?** Recommended Extensions wording:
   “Network-gated third-party code; runs in your iv process.”
   Add `KERNEL OVERRIDE: <targets>` when present.
10. **Should activation failures degrade all plugins or only third parties?** Recommended: contain
    and record every contributor failure. A kernel composition failure must stop before application
    construction and offer restart with that module disabled.
