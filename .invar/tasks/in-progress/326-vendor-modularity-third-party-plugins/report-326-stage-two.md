# READY: vendor modularity and third-party plugins stage 2

Task:
[vendor modularity and third-party plugins (#326)](task-326-vendor-modularity-third-party-plugins.md)

Brief:
[stage 2 execute](brief-326-2-stage-two-execute.md)

Plan:
[revised vendor modularity plan](project-vendor-modularity-plan.md)

Status: READY

## Result

Invar now installs signed runtime plugins without rebuilding the executable.
The command and Extensions paths use the same installer.
Extensions shows canonical identity, version, network provenance, and exact kernel targets.
An override needs exact-target confirmation before install.
The next action relaunches Invar in place with `execve`.
The PTY, process identity, workspace argument, and Extensions view survive.

The unchanged process generation discovers enabled vendor versions before Bootstrap.
It verifies the trusted admission signer, signed provenance, manifest, and artifact digest before
dynamic import.
It registers declared factories against the public kernel target catalog.
Bootstrap seals the graph before it constructs `App`.

The implementation also supplies command actions for install, update, rollback, remove, enable,
disable, and developer link.
Installed versions live below the platform data root.
One atomic selection record controls the next startup.
Developer links show `UNVERIFIED LOCAL CODE`.
Network versions show `NETWORK-GATED`.
Activation failures remain in the catalog while later contributors activate.

## Plan items

1. Identity validation uses lowercase ASCII kebab-case, digits after the first character, a
   64-character segment limit, reserved vendor names, and Windows device-name rejection.
2. Network admission checks the module contract, closed import tree, declared override exports,
   immutable identity and version, content digest, source revision, and Ed25519 signature.
3. Client verification trusts `INVAR_ADMISSION_PUBLIC_KEY`.
   It refuses a self-supplied signer, invalid signature, or changed bytes before import.
4. The installer uses an owned staging directory and atomic selection-record replacement.
   It retains inactive versions for rollback.
5. Runtime discovery imports enabled versions in canonical identity order.
   It applies only manifest-declared factories to published targets.
6. Vendor setting identifiers receive the catalog-owned `vendor/module.` prefix.
   Plugin keybinding layers already use the full contributor identity.
7. Extensions separates built-in activation from vendor install state.
   It shows update authority, failure state, restart state, provenance, and exact targets.
8. The in-app restart preserves the current workspace and Extensions session through `execve`.
9. The contract layer now has vendor and network-admission records plus their composition lattice.

The plan and brief did not disagree.

## Driven evidence

The committed
[runtime install and relaunch harness](326-runtime-install-relaunch-harness.ts)
uses a fixture registry and an Ed25519-signed `example/playstation@1.0.0` artifact.
It drove Extensions through exact-target confirmation, staged install, and restart.

The red controls said:

```text
Error: REFUSED example/playstation: invalid admission signature
Error: REFUSED example/playstation: artifact digest mismatch
```

The restored artifact then produced:

```text
PASS command install uses the same signed artifact service
PASS self-relaunch preserved the process and PTY through execve
PASS self-relaunch preserved the workspace root
PASS example/playstation active after self-relaunch
PASS signed plugin is active on the shared 10-line fixture
PASS signed plugin is active on the shared 100000-line fixture
```

The relaunched status record named `example/playstation`, target `invar/app/App`, and
`appClassExtended=true`.
The 100,000-line drive kept the same active plugin row and document-scale behavior as the 10-line
drive.

The
[compiled-runtime loading probe](326-compiled-runtime-plugin-loading-probe.ts)
accepted external JavaScript in 4.870 milliseconds and external TypeScript in 5.178 milliseconds.
The TypeScript path loaded a relative TypeScript file.
Malformed TypeScript exited 1.
These are capability samples, not a startup budget.

## Invariant verdict

PASS.

- [The app is built only after the kernel is sealed](../../../../project.invariants.md#the-app-is-built-only-after-the-kernel-is-sealed)
  is strengthened by named targets, ordered factories, publication at seal, and reset to the base
  graph.
- [External plugin discovery precedes application boot](../../../../src/modules/app/app.invariants.md#external-plugin-discovery-precedes-application-boot)
  records the AppLoader boundary.
- [Extensions states vendor authority before activation](../../../../src/modules/plugins/plugins.invariants.md#extensions-states-vendor-authority-before-activation)
  records the exact-target confirmation and restart surface.
- [Plugin settings live in contributed schema](../../../../src/modules/settings/settings.invariants.md#plugin-settings-live-in-contributed-schema)
  now includes canonical vendor qualification.
- [Installed vendor versions change atomically](../../../../src/modules/vendors/vendors.invariants.md#installed-vendor-versions-change-atomically)
  and
  [Vendor plugins load before kernel seal](../../../../src/modules/vendors/vendors.invariants.md#vendor-plugins-load-before-kernel-seal)
  govern local installation and discovery.
- [Network admission binds identity manifest and bytes](../../../../src/modules/vendors/network-admission.invariants.md#network-admission-binds-identity-manifest-and-bytes)
  and
  [Kernel authority is declared twice](../../../../src/modules/vendors/network-admission.invariants.md#kernel-authority-is-declared-twice)
  govern the distribution edge.

The brief missed [Installed code can run with the user's authority](../../../../src/modules/vendors/vendors.invariants.md#installed-code-can-run-with-the-users-authority).
Admission is provenance and quality evidence.
It is not a same-process sandbox.

## Verification

- Focused unit set: 24 passed, 0 failed.
- Runtime install and relaunch harness: passed.
- Shared scale drives: 10 and 100,000 lines passed.
- Compiled-runtime probe: passed, including its malformed-TypeScript positive control.
- TypeScript: `TSC=0`.
- Invariant checker: 1,225 annotations and 231 lattice links resolved with zero problems.
- Task-link linter and `git diff --check`: no findings.
- The commit hook ran the full gate once.
  Unit tests, binary build, 63 of 65 parallel smokes, agent permissions, overlay dialogs, and input
  byte ordering passed.
  Its task-related activity-bar red came from the old Extensions footer oracle.
  The oracle now names the new state wording, and the activity-bar harness passes directly.
  The remaining reds are the two bycatch items below.

## Bycatch

- The existing plugin-manifest smoke is stale after
  [file tree reveal (#340)](../../completed/340-file-tree-reveals-open-file/task-340-file-tree-reveals-open-file.md).
  After the smoke selects `Show hidden files`, it sends one Down and expects `Changes/log split`.
  The live Settings order now has `Reveal open file` between them.
  `bun scripts/harness/smoke-plugin-manifest-harness.ts` timed out at “the first Git setting is
  selected” twice.
  The default drive also published `Show hidden files`, `Reveal open file`, then
  `Changes/log split`.
  This reproduced twice and was not changed because it belongs to the file-tree smoke contract.
- The full gate's word-delete harness timed out twice while it waited for Alt+Delete to keep the
  active buffer open with the cursor after `hello`.
  Its Option+Backspace arm passed.
  No vendor, plugin, kernel, or restart path touches word deletion.

## Round 3 merge and gate

The merge from `main` preserved both independent additions to
[project.briefing.md](../../../../project.briefing.md).
The focused unit set passed with 20 tests.
The runtime install and relaunch harness passed, including both refusal controls and both scale
fixtures.

The enforcing commit hook produced this final chain:

```text
focused unit set: EXIT=0
runtime install and relaunch harness: EXIT=0
merge-gate: GATE_EXIT=1
pre-commit: commit blocked
```

The only red was the Alt+Delete timeout, including its quiet retry.
This is the filed
[word-delete harness Alt+Delete timeout task (#374)](../../active/374-word-delete-harness-alt-delete-timeout/task-374-word-delete-harness-alt-delete-timeout.md).
The plugin-manifest smoke and the other 64 parallel smokes passed.
The behavioral contracts, agent permissions, overlay dialogs, and input byte checks also passed.

The hook did not create the merge commit.
The final committed task hash remains `b3a285dea5047b30d519e1b3627358c79657b197`.
The worktree holds the staged merge and is not clean because the brief requires a stop on a repeated
filed red.
