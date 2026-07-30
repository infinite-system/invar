# READY: revised vendor modularity and third-party plugins stage 1

Task:
[vendor modularity and third-party plugins (#326)](task-326-vendor-modularity-third-party-plugins.md)

Brief:
[stage 1 vendor modularity design](brief-326-1-vendor-modularity-third-party-plugins.md)

Status: READY for the user's revised stage 1 verdict

The lane stays open.
Stage 2 must use this same session after the user approves or amends the revised plan.

## Result

The committed
[revised vendor modularity plan](project-vendor-modularity-plan.md)
now serves the ordinary `vi`-replacement user first.
It keeps source installation as a separate developer path.
It contains no product-code change.

The revision makes these three amendments:

1. Users install from Extensions or with `iv plugin install vendor/module`.
   Install does not run a gate, rebuild `iv`, or require a source checkout.
2. The quality gate runs once for each immutable module version at entry to the distribution
   network.
   Clients install the signed, already-gated artifact.
3. Third-party modules can override published kernel classes.
   The manifest declares every target.
   Extensions shows the authority loudly.
   The network edge gives override-carrying publications and upgrades its strongest review.

## Primary install path

The equivalent user paths are:

```text
Extensions → search acme/playstation → Install
iv plugin install acme/playstation
```

The installer downloads one signed, content-addressed version.
It verifies the admission signature, digest, manifest, API version, platform, and declared kernel
authority.
It extracts into:

```text
<invar-data>/vendors/<vendor>/<module>/<version>/
```

It then updates one atomic installed-version record.
The unchanged compiled `iv` loads the plugin on the next startup.

The installer does not run contracts, the repository gate, or a compiler.
Those are quality checks at network admission.
Client signature and digest checks only prove that the installed bytes are the bytes that passed.

Module authors can use an explicit `iv plugin dev-link /absolute/path` path.
Extensions marks that path `UNVERIFIED LOCAL CODE`.
Ordinary install never needs it.

## Compiled-runtime evidence

The current
[AppLoader](../../../../src/modules/app/AppLoader.ts)
passes only
[DefaultPlugins](../../../../src/modules/plugins/DefaultPlugins.ts)
to Bootstrap.
Current `iv` has no external discovery call.
Stage 2 must add that loader before boot and kernel seal.

The Bun runtime inside a compiled executable supports the needed boundary.
The committed
[compiled-runtime plugin-loading probe](326-compiled-runtime-plugin-loading-probe.ts)
used Bun 1.3.14 and `bun build --compile`.
It created every plugin file after the executable existed.

Across two runs:

- external JavaScript loaded in 3.531 to 3.698 milliseconds.
- external TypeScript loaded in 3.517 to 3.638 milliseconds.
- the TypeScript entrypoint loaded a second relative external `.ts` file.
- malformed TypeScript exited 1 as the positive control.

The TypeScript fixture contained an interface and type annotations.
Its success proves runtime transpilation, not only JavaScript loading.
The timings are capability samples on this machine, not a startup budget.

[Bun's executable documentation](https://bun.sh/docs/bundler/executables)
states that compiled executables carry the Bun runtime.
[Bun's runtime documentation](https://bun.sh/docs/runtime)
states that imported files are transpiled before execution.
[Bun's file-type documentation](https://bun.sh/docs/runtime/file-types)
lists the TypeScript runtime loaders.
The direct probe verifies their combined behavior at the compiled-host boundary.

## Network-edge gate and Invarnet

The registry binds a vendor handle to an account and public key.
It refuses handle reuse and version mutation.
One immutable signed admission binds:

- `vendor/module@version`.
- the content digest.
- the manifest.
- the source revision and vendor provenance.
- the public API compatibility result.
- the module contract result.
- the runtime and removal results.

The gate runs once when that exact version enters the distribution network.
User installs do not rerun it.
Mirrors do not rerun it.
An Invarnet peer verifies and carries the signed result.

This makes the first registry a citizen of the
[Invarnet north star](../../../../project.briefing.md#north-star-addition-user-2026-07-29-215x-verbatim).
Identity has no registry URL.
Later Invarnet nodes can replicate vendor claims, version records, and content-addressed artifacts
without changing module identity or client verification.

## Kernel overrides

The manifest uses an explicit `kernelOverrides` list.
Each item names:

- a stable target such as `invar/editor/Editor`.
- the `extend` composition kind.
- the exported extension factory.
- a plain-language reason.

Phase 1 uses ordered subclass extension through the kernel graph.
Direct assignment to a namespace `Class` binding is not admitted.
It would bypass the graph, declaration, and composition order.

Extensions shows `KERNEL OVERRIDE` and every exact target.
An install or update that adds or expands authority requires an exact-target confirmation.

The stronger network gate compares the override set with the previous version.
It validates each public target and manifest match.
It composes before seal.
It runs the target and plugin contracts.
It drives with and without the override at small and large scale.
It proves that removal restores the base class graph.

All phase 1 composition changes take effect after restart.
No live instance changes class.

## Trust boundary

Network admission is a quality and provenance boundary.
It is not a runtime sandbox.

Distributed TypeScript runs in the `iv` process with the user's permissions.
It can use Bun and Node APIs.
It can read files, write files, start processes, use the network, retain references, and create
untracked resources.

The host can enforce admission integrity, scoped host registrations, declared public kernel targets,
registration order, and seal order.
It cannot make arbitrary same-process code safe.

Recommended Extensions wording:

```text
Network-gated third-party code; runs in your iv process.
KERNEL OVERRIDE: <exact targets>
```

A later out-of-process host can enforce capabilities for additive modules.
Kernel overrides remain an explicit in-process authority.

## Naming and recognition

The identity remains `vendor/module`.
Each segment uses:

```regex
^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$
```

The design allows digits after the first letter and allows `-`.
It rejects `_`, uppercase, Unicode, leading digits, repeated hyphens, and reserved names.
Each segment is at most 64 characters.

The catalog owns identity and provenance.
The contributor owns behavior.
Extensions shows the full identity, version, state, admission, and built-in, network-gated,
developer-linked, or kernel-override provenance.

Provider capability names remain consumer-owned.
The provider registration carries the vendor identity beside the provider.
This keeps peer rendezvous intact.

## Contract plan

Every published artifact ships one
[colocated module contract](project-vendor-modularity-plan.md#contract-layer).
The network edge checks it against the public API and every declared kernel target.
The signed admission binds the result to the artifact digest.

The user's installer does not run the invariant checker.
It verifies the signed admission and content.

The stage 2 plan names the root, plugin, app, settings, keybindings, UI, vendor, network-admission,
and kernel records that need additions or refinement.

Invariant verdict: PASS.
The revision preserves the plugin-free host, provider rendezvous, independent lifetimes, removable
syntax, ivue namespace forms, and seal-before-construction rule.

## Re-ranked user questions

The verdict settles the primary install path, network-edge gate, and legality of declared kernel
overrides.
The remaining questions are:

1. How should new kernel authority be confirmed?
   Recommendation: exact-target confirmation on first install and on any expanded update.
2. Who signs phase 1 admission?
   Recommendation: one Invar-operated key and append-only public log, designed for later Invarnet
   replication.
3. What dependency rule should phase 1 use?
   Recommendation: one portable, self-contained TypeScript or JavaScript tree.
   Resolve or bundle dependencies at the edge.
4. Which kernel targets are public first?
   Recommendation: a short catalog backed by real target contracts.
5. What should the reference module be?
   Recommendation: a test-only `example/playstation` module with additive contributions and one
   harmless published editor override.
6. Should every phase 1 composition change require restart?
   Recommendation: yes.
7. Approve lowercase kebab-case identity?
   Recommendation: allow later digits and `-`; reject `_`.
8. Show built-ins as `invar/<module>` in phase 1?
   Recommendation: yes in catalog and Extensions.
9. Approve the trust label?
   Recommendation: “Network-gated third-party code; runs in your iv process.”
10. How should failures degrade?
    Recommendation: contain contributor failures.
    Stop a kernel composition failure before app construction and offer restart with that module
    disabled.

## Driven evidence

The initial stage 1 work drove the real app at both required scales.

Default-scale command:

```sh
bun run drive --geometry 100x30 --key Control+Shift+x --wait-for-text 'Extensions' \
  --key Down --key Down --key Down --key Down --key Space
```

The Extensions pane showed 12 toggleable built-ins.
Vue changed from `[x]` to `[ ]`.
The host canvas remained live.

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

- Revision commit:
  `1dc3596f1fae80b593e64d960697847528c7f5f9`.
- The commit contains the amended task record, revised plan, and runtime probe.
- The commit contains zero product-code files.
- The runtime probe accepted post-build JavaScript, TypeScript, and a relative TypeScript import.
- Its malformed TypeScript positive control exited 1.
- The STE linter reported 1.31 findings per 100 words for the revised plan.
- The task-link linter reported no findings for the revised plan.
- The invariant checker resolved 1,181 annotations and 223 lattice links with zero problems.
- `git diff --check` reported no findings.
- The worktree is clean after the commit.

The full merge gate did not run.
The brief required a record-only commit with the gate bypass and written verdict.
The commit body records:

```text
Stage-1 verdict: REVISED. Primary install is network-delivered at runtime, the quality gate runs once at network admission, and declared kernel overrides are allowed with loud disclosure.
```

The hook printed:

```text
pre-commit: SKIP_GATE=1 — skipping the full merge-gate (bypass acknowledged).
```

## Bycatch

- The current Extensions footer says “Space/Enter installs or uninstalls.”
  [ExtensionsPaneContent](../../../../src/modules/plugins/ExtensionsPaneContent.ts)
  only calls the in-process activation toggle.
  It does not change disk state or persist the choice.
  The label appeared in both the default and 100,000-line drives.
- Contract drift:
  [The app is built only after the kernel is sealed](../../../../project.invariants.md#the-app-is-built-only-after-the-kernel-is-sealed)
  describes named class registration, graph composition, descendant reparenting, namespace
  replacement, reset, and reseal.
  [Kernel](../../../../src/modules/kernel/Kernel.ts)
  currently stores and runs anonymous seal hooks only.
  It has no named class graph or reset path, and no shipped plugin registers a hook.
  The revised plan treats the missing graph as stage 2 work.
