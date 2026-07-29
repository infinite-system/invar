# READY — preserve unregistered settings across boot saves

State: READY

Commit: `412f75b99587fde1a429247c109a0ae471046909`

Branch: `fleet/264-boot-save-erases-unregistered-settings`

Worktree: clean

## Result

#264 (boot save erases unregistered settings) is fixed at the settings snapshot generator.

The exact boot trigger was not the suspected agent-engine write-back at
`src/modules/app/Bootstrap.ts:639`. `DefaultPlugins` activates File Tree before Markdown.
File Tree registration reaches `PanelHost.register()`, extends the empty primary-dock order, and
calls `settings.save()` through `Bootstrap.ts:247`. Markdown registers
`markdownPreviewSide` later.

The old `persistenceSnapshot()` started from registered settings only. The early save therefore
discarded every stored key whose contributor had not registered yet.

`persistenceSnapshot()` now starts from `storedUserRecord`. It then overlays current host values and
active contributed values. Unknown user keys keep their parsed JSON values. Known settings still
persist their current sanitized values. Project settings never move into the user file.

An activation-order fix was rejected. A plugin can register after boot or after any later save.
Ordering one boot sequence cannot protect settings that remain unknown at that save.

## Changes

- `src/modules/settings/Settings.ts` preserves unknown user keys in `persistenceSnapshot()`.
- `src/modules/settings/Settings.test.ts` proves unknown object and array values survive a save.
  The same test proves a malformed known value persists as its sanitized default.
- [src/modules/settings/settings.invariants.md](../../../../src/modules/settings/settings.invariants.md) adds
  `Persistence preserves unrecognized user settings`.
- `scripts/harness/smoke-plugin-manifest-harness.ts` seeds
  `markdownPreviewSide: "right"`. It proves the late Markdown contribution applies it and the
  boot-time save keeps it on disk.

## Driven evidence

Before the fix, the isolated-home PTY probe printed:

```text
USERFILE side value: left
STATUS side=left open=true
```

The seed was `{"markdownPreviewSide":"right"}`.

With the fix present, the same probe printed:

```text
USERFILE side value: right
STATUS side=right open=true
```

The permanent plugin-manifest drive printed:

```text
PASS  the late Markdown contribution applies its stored right-side value
PASS  the boot-time save preserves the not-yet-registered Markdown setting
```

Default scale drives also settled with `ready=true` and `renderQuiescent=true`:

- `bun run drive --size 10`
- `bun run drive --size 100000`

## Positive controls

I removed only the `...this.storedUserRecord` spread and ran both new checks.

The unit check failed with:

```text
Expected: futurePlugin value
Received: undefined
```

The real PTY smoke failed with:

```text
FAIL the late Markdown contribution applies its stored right-side value
```

The isolated-home probe also showed the erasure again:

```text
USERFILE side value: left
STATUS side=left open=true
```

I restored the spread. Both checks passed again.

## Verification

- `bunx tsc --noEmit`: exit 0.
- `bun test`: 1,853 pass, 0 fail, 68,291 expectations across 287 files.
- `bun scripts/harness/smoke-settings-applied-harness.ts`: all pass.
- `bun scripts/harness/smoke-plugin-manifest-harness.ts`: all pass.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 0 problems.
- `bash scripts/conventions-gate.sh`: pass.
- `git diff --check`: pass.

The pre-commit hook automatically ran `scripts/merge-gate.sh`. It reported `ALL-PASS`. I did not
start the full merge gate directly.

## Invariant review

Scope came from the changed `settings` paths, the new settings annotation, and the boot-save terms.
[src/modules/settings/settings.invariants.md](../../../../src/modules/settings/settings.invariants.md), [src/modules/app/app.invariants.md](../../../../src/modules/app/app.invariants.md), and
[project.invariants.md](../../../../project.invariants.md) were checked.

The change strengthens `Plugin settings live in contributed schema`. It adds one missing persistence
rule at the common snapshot seam. It does not change settings precedence, project-file ownership,
plugin authority, or boot composition.

## Bycatch

- Pre-existing runtime defect: shrinking the Markdown split from `120x40` to `60x25` without mouse
  input leaves the wide layout stale for at least eight seconds. The task probe reproduced it twice.
  I did not change it.
- Gate flake: the pre-commit six-worker pool timed out once in
  `smoke: panel-chrome harness`. Its one quiet retry passed. I did not reproduce the timeout a second
  time or change that harness.

Compaction: none.

conventions @ `63c7301a2ad43af9b0b9eb05285ab633960af2c1`
