# READY: vendor modularity and third-party plugins stage 1

Task:
[vendor modularity and third-party plugins (#326)](task-326-vendor-modularity-third-party-plugins.md)

Brief:
[stage 1 vendor modularity design](brief-326-1-vendor-modularity-third-party-plugins.md)

Status: READY for the user's stage 1 verdict

The lane stays open. Stage 2 must use this same session after the user approves or amends the plan.

## Result

The committed
[vendor modularity plan](project-vendor-modularity-plan.md)
defines the third-party architecture and four implementation phases.

The current composition has 13 shipped application contributors.
Nine also attach a contribution to each workspace. Four are application-only.

The current shared seams already cover:

- application and workspace lifecycle.
- settings and keybinding contributions.
- commands and status projections.
- dock, editor-column, and pane-runtime content.
- per-workspace provider routing.
- clean reverse-order withdrawal.

The
[removable Vue contributor](../../../../src/modules/vue/VuePlugin.ts)
is the reference citizen.
It publishes one syntax source through the generic provider registry.
Its removal restores plain `.vue` behavior without a host import or workspace restart.

## Architecture recommendation

Use `vendor/module` as the stable identity.
Store source at `src/vendors/<vendor>/<module>/`.

Use this grammar for each segment:

```regex
^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$
```

The recommendation:

- allows ASCII letters and digits.
- allows digits after the first letter.
- allows `-`.
- rejects `_`.
- rejects uppercase and Unicode in identity.
- limits each segment to 64 characters.
- reserves `invar`, `invar-*`, `core`, `builtin`, `system`, and path-dangerous names.

Display names can still use case, spaces, and Unicode.

The plan uses one declarative `invar.plugin.json` manifest.
It holds identity, display name, version, API version, source, license, and entrypoint.
Runtime registrations do not repeat in the manifest.

The catalog owns identity and provenance.
The contributor owns behavior.
Extensions shows the full identity, version, state, and `built-in` or `third-party` provenance.

Provider capability identifiers stay consumer-owned.
The provider registration carries the module identity beside the provider.
This keeps peer rendezvous intact.

## Install recommendation

Phase 1 is source-installed and restart-based:

1. Copy an exported module into `src/vendors/<vendor>/<module>/`.
2. Run `bun run vendors:sync`.
3. Validate its manifest, path, identity, API version, and contract.
4. Generate static imports and a lock record.
5. Run the local gate.
6. Rebuild and restart Invar.

Phase 1 does not load arbitrary TypeScript beside an existing compiled executable.
It also excludes independent dependencies, marketplace download, hot reload, signatures, and sandboxing.

Removal deletes only the owned module directory and its lock entry.
The generated composition then changes.
No handwritten core file keeps a reference to the removed identity.

## Global uniqueness

A local checkout can reject duplicate installed identities.
It cannot prove that two people did not claim the same vendor handle.

Phase 1 therefore uses a convention and records source provenance.
It does not claim global proof.

A later registry binds one vendor handle to one account and public key.
Optional domain verification strengthens the claim.
The registry refuses handle reuse.

The identity contains no registry URL.
This keeps it portable to the
[Invarnet north star](../../../../project.briefing.md#north-star-addition-user-2026-07-29-215x-verbatim).

## Trust boundary

Phase 1 modules are trusted same-process code.

The host can enforce manifest shape, local uniqueness, API compatibility, registration disposal,
keybinding limits, contracts, and gate results.

The host cannot stop same-process TypeScript from using files, processes, network, internal imports,
timers, listeners, or broad object references.
Those powers remain honor-system in phase 1.

The plan does not present a permission list as enforcement.
A real sandbox needs a later out-of-process host and capability-based RPC.

Third-party phase 1 modules use additive contributor and provider seams.
Kernel class replacement stays trusted, boot-time, and unsupported for distribution.

## Contract plan

Every installed module ships one colocated contract named for its module.
The current checker will discover that record under `src/vendors`.

Stage 2 phase 1 adds or refines the root, plugin, app, settings, keybindings, UI, and vendor discovery
records named in the plan.

Invariant verdict: PASS.
The proposed design upholds the plugin-free host, independent plugin lifetimes, host-carried provider
rendezvous, contributed settings, removable syntax, and ivue namespace forms.

The design strengthens collision handling and removal polarity.
It adds no invariant downgrade.

## Phases

Phase 1 builds trusted source discovery, validation, generated composition, provenance, Extensions
state, failure containment, and one reference module.

Phase 2 adds built-in namespace migration, persistent enable policy, install commands, dependency
policy, update, rollback, and removal.

Phase 3 adds vendor registration, signed versions, discovery, and registry replication.

Phase 4 adds isolated execution and enforced capabilities.

Each phase has driven acceptance and planted-red controls in the plan.

## Ranked user questions

1. Approve source-installed phase 1? Recommendation: yes. Gate, rebuild, and restart.
2. Approve lowercase kebab-case? Recommendation: allow later digits and `-`. Reject `_`.
3. Approve registered vendor handles later? Recommendation: immutable handles with optional domain verification.
4. Approve additive authority only? Recommendation: keep kernel replacement outside third-party phase 1.
5. Approve the trust label? Recommendation: “Third-party, trusted same-process code.”
6. Choose the reference module. Recommendation: keep `example/playstation` as a test fixture.
7. Show built-ins as `invar/<module>` now? Recommendation: yes in catalog and Extensions.
8. Contain every contributor activation failure? Recommendation: yes. Keep the host canvas alive.
9. Persist disabled policy in phase 1? Recommendation: no. Add it with install commands in phase 2.

## Driven evidence

I drove the real app before writing the plan.

Default-scale command:

```sh
bun run drive --geometry 100x30 --key Control+Shift+x --wait-for-text 'Extensions' \
  --key Down --key Down --key Down --key Down --key Space
```

The Extensions pane showed 12 toggleable built-ins.
Vue changed from `[x]` to `[ ]`.
The plugin-free host canvas remained live.

Large-scale command:

```sh
bun run drive --size 100000 --geometry 100x30 \
  --key Control+Shift+x --wait-for-text 'Extensions' \
  --key Down --key Down --key Down --key Down --key Space
```

The 100,000-line editor stayed live.
Vue again changed from `[x]` to `[ ]`.
The document remained open with `editorMaximumScrollTop=99978`.

The two drives showed the same Extensions inventory and removal gesture.

## Verification

- Commit `c3b7f0a9` contains only the 686-line plan.
- The STE linter reported 1.08 findings per 100 words for the plan.
- The task-link linter reported no findings for the plan.
- The invariant checker resolved 1,181 annotations and 223 lattice links with zero problems.
- `git diff --check` reported no findings.
- The worktree is clean after the commit.

The full merge gate did not run.
The brief required a record-only commit with the gate bypass.
The hook printed:

```text
pre-commit: SKIP_GATE=1 — skipping the full merge-gate (bypass acknowledged).
```

## Bycatch

- The current Extensions footer says “Space/Enter installs or uninstalls.”
  [ExtensionsPaneContent](../../../../src/modules/plugins/ExtensionsPaneContent.ts) only calls the
  in-process activation toggle. It does not change disk state or persist the choice.
  The label appeared in both the default and 100,000-line drives.
  The plan separates install, enable, activate, disable, and remove instead of changing this product
  text during stage 1.
