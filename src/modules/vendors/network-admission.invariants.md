# Vendor network admission — Module Invariants

This contract governs the distribution edge that admits immutable vendor versions.

## Reality-based invariants

_None specific. Admission consumes cryptographic signature and content-addressing facts._

## Chosen invariants

### Network admission binds identity manifest and bytes

**Invariant:** If the network admits `vendor/module@version`, then one signed record binds that
identity and version to the validated manifest and artifact digest. The same version cannot later
name different bytes.

**Scope:** `NetworkAdmission`, `PluginAdmission`, registry catalogs, and client verification.

**Mechanism:** The edge hashes the closed artifact and signs a canonical payload with Ed25519.
Append rejects a different digest for an existing identity and version. The client verifies the
signature and recomputes the digest before import.

**Generates:** Once-per-version quality admission; transport-independent verification; immutable
mirrors and later Invarnet replication.

**Rejected alternatives:** Trusting the download server; signing only a mutable URL; rerunning the
repository gate on every client.

**Evidence:** `src/modules/vendors/NetworkAdmission.ts`;
`src/modules/vendors/PluginAdmission.ts`; `src/modules/vendors/PluginArtifact.ts`;
`src/modules/vendors/VendorPlugins.test.ts`.

**Impossible if true:** An unsigned or post-admission modified artifact reaching dynamic import; a
second digest entering under the same version.

**Verification:** `bun test src/modules/vendors/VendorPlugins.test.ts`; `bun
.invar/tasks/in-progress/326-vendor-modularity-third-party-plugins/326-runtime-install-relaunch-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-30

### Kernel authority is declared twice

**Invariant:** If a vendor version extends a public kernel target, then its manifest names the exact
target and export, and the loaded entrypoint supplies that exact factory. Extensions names the
target before install confirmation.

**Scope:** Manifest validation, network admission, runtime registration, and Extensions.

**Mechanism:** Admission compares extension-shaped exports with `kernelOverrides`. Runtime resolves
only declared export names and registers them against the public target catalog. Extensions derives
its warning from the admitted manifest.

**Generates:** Stronger review for override versions; exact-target confirmation; refusal of missing,
undeclared, duplicate, or unpublished targets.

**Rejected alternatives:** Direct namespace replacement; inferred authority; a generic warning that
does not name the target.

**Evidence:** `src/modules/vendors/PluginManifest.ts`;
`src/modules/vendors/NetworkAdmission.ts`; `src/modules/vendors/VendorPluginRuntime.ts`;
`src/modules/plugins/ExtensionsPaneContent.ts`.

**Impossible if true:** A host-mediated kernel extension whose authority is absent from the signed
manifest or hidden from the install surface.

**Verification:** `bun test src/modules/vendors/VendorPlugins.test.ts`; `bun
.invar/tasks/in-progress/326-vendor-modularity-third-party-plugins/326-runtime-install-relaunch-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-30
