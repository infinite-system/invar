# Vendors — Module Invariants

This contract governs installed third-party module identity, storage, discovery, and runtime
composition.

## Reality-based invariants

### Installed code can run with the user's authority

**Invariant:** If a vendor module runs inside the Invar process, then it has the process's user
authority. Admission proves provenance and reviewed bytes. It does not sandbox those bytes.

**Scope:** Network-installed and developer-linked vendor entrypoints.

**Mechanism:** Bun imports the entrypoint into the host process. The runtime applies no process or
filesystem isolation.

**Generates:** Loud network-gated or unverified-local provenance in Extensions; no permissions claim
that the runtime cannot enforce.

**Evidence:** `src/modules/vendors/VendorPluginRuntime.ts`;
`src/modules/plugins/ExtensionsPaneContent.ts`.

**Impossible if true:** Describing an admitted same-process module as sandboxed.

**Verification:** `bun
.invar/tasks/in-progress/326-vendor-modularity-third-party-plugins/326-runtime-install-relaunch-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-30

## Chosen invariants

### Installed vendor versions change atomically

**Invariant:** If install, update, rollback, enable, disable, or remove changes the selected vendor
composition, then one atomic installed-version record selects the complete next-startup state.
Immutable version directories are never edited in place.

**Scope:** `VendorPluginInstaller`, the user-data vendor tree, and `installed.json`.

**Mechanism:** Installation copies into an owned staging directory, renames the complete version
into place, and replaces `installed.json` through a same-directory temporary file.

**Generates:** Restart-based changes; retained versions for rollback; removal without a core edit.

**Rejected alternatives:** Editing an active artifact in place; rebuilding the Invar executable;
running the repository gate on each user install.

**Evidence:** `src/modules/vendors/VendorPluginInstaller.ts`;
`src/modules/vendors/VendorPlugins.test.ts`.

**Impossible if true:** A selected record naming a partially copied artifact; install changing
handwritten core source.

**Verification:** `bun test src/modules/vendors/VendorPlugins.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-30

### Vendor plugins load before kernel seal

**Invariant:** If an enabled vendor module declares a public kernel extension, then the runtime
verifies and imports it before Bootstrap seals the kernel. A live application never changes class.

**Scope:** `AppLoader`, `VendorPluginRuntime`, `Kernel`, and Bootstrap construction.

**Mechanism:** AppLoader registers public targets, awaits vendor discovery, and only then calls
Bootstrap. Bootstrap seals before `new App.Class()`.

**Generates:** Deterministic identity order; declaration-matched extension registration;
self-relaunch after composition changes.

**Rejected alternatives:** Hot class mutation; direct assignment to namespace `Class`; discovery
after application construction.

**Evidence:** `src/modules/app/AppLoader.ts`; `src/modules/vendors/VendorPluginRuntime.ts`;
`src/modules/kernel/Kernel.ts`; `src/modules/app/Bootstrap.ts`.

**Impossible if true:** A downloaded extension factory composing after the application instance
exists.

**Verification:** `bun
.invar/tasks/in-progress/326-vendor-modularity-third-party-plugins/326-runtime-install-relaunch-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-30
