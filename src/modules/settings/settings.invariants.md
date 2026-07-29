# Settings — Invariants

Load-bearing rules for `src/modules/settings/` — the reactive user-settings store (MODEL layer).
Stands on `project.invariants.md` and the `system/` capability layer (`Files`, `Environment`). The
Ctrl+, panel UI and RootView wiring are OUT of scope here.

## Reality-based invariants

### Settings files are external mutable state that may be absent or malformed

**Invariant:** If the store reads a settings file, then it treats the file as possibly missing,
unreadable, or containing invalid JSON — the load path degrades to the layer beneath instead of
propagating an error.

**Scope:** `Settings.load` / `Settings.readSettingsRecord` reading the user and project files.

**Mechanism:** `readSettingsRecord` gets `null` from the filesystem seam for a missing/unreadable file
and returns `{}`; a `JSON.parse` throw is caught and also returns `{}`. `sanitize` then keeps only
recognized, correctly-typed keys. The reality is that `~/.config/invar/settings.json` and
`.invar/settings.json` are user-editable files on disk the editor does not exclusively own.

**Generates:** the never-throw load contract; the defaults-as-floor behavior.

**Evidence:** `Settings.ts` `readSettingsRecord` (null-guard + try/catch) and `sanitize`
(per-key type/enum checks); `Settings.test.ts` "corrupt JSON falls back to defaults without
throwing" and "unrecognized and mistyped keys are dropped".

**Impossible if true:** a missing or corrupt settings file throwing out of `load()` and crashing
editor startup; a mistyped or unknown key from disk overwriting a field with garbage.

**Verification:** a test that loads a corrupt file and a file with wrong-typed keys and asserts the
snapshot equals defaults for the affected fields (no throw).

**Status:** provisional

**Last refined:** 2026-07-21

## Chosen invariants

### Plugin settings live in contributed schema

**Invariant:** If a setting belongs to a plugin, then the host `SettingsValues`, defaults, sanitizer,
and panel descriptors do not name it; the setting exists only while its contributor's schema
registration is active.

**Scope:** `Settings.registerSetting`, the application contribution context, and `SettingsPanel`
descriptor projection.

**Mechanism:** contributors register typed `SettingContribution` records.
`Settings` owns their reactive values and retains raw user/project records so
late registration receives the same defaults-user-project precedence as host
fields. `SettingsPanel` appends active contributed descriptors generically.
`setContributed` invokes the contribution's optional `changed` callback only
after a sanitized value changes, so a plugin can attach or release resources
without a reactive watcher. Disposing the registration removes the descriptor
and cell while a saved user value remains available for a later reinstall.

**Generates:** plugin-owned headings and settings rows; disable/re-enable symmetry; a host schema
whose vocabulary does not grow with installed plugins.

**Evidence:** `SettingContribution.interface.ts`; `Settings.ts` (`registerSetting`);
`SettingsPanel.ts` (`descriptors`); `Settings.test.ts` ("disposing a
contribution removes its schema but preserves saved data" and "setContributed
notifies a plugin only when its value changes"); `SettingsPanel.test.ts`
("contributed rows use their heading and disappear on dispose").

**Impossible if true:** a plugin setting getter or key in `SettingsValues`; a disabled plugin leaving
a row in Settings; a plugin heading special-cased in the overlay.

**Verification:** `bun test src/modules/settings && bash scripts/conventions-gate.sh`.

**Status:** provisional

**Last refined:** 2026-07-26

### Persistence preserves unrecognized user settings

**Invariant:** If `Settings.save` persists a loaded user file, then every key outside the current
host and contributed schemas keeps its parsed JSON value.

**Scope:** `Settings.persistenceSnapshot` and `storedUserRecord`. Project settings remain outside
user persistence. Registered host and contributed settings use their current sanitized values.

**Mechanism:** `persistenceSnapshot` starts with `storedUserRecord`, then overlays the host snapshot
and every active contributed setting. Known values replace their stored forms while unknown keys
pass through unchanged.

**Generates:** forward-compatible settings files; boot saves that cannot erase settings from
not-yet-registered plugins; disable and later re-enable symmetry for contributed settings.

**Rejected alternatives:** Delay saves until plugin activation completes — plugins can register
after boot, so ordering cannot protect settings that are unknown at a later save.

**Evidence:** `Settings.ts` `persistenceSnapshot`; `Settings.test.ts` "save preserves unrecognized
user settings verbatim"; `scripts/harness/smoke-plugin-manifest-harness.ts` preserves and applies
`markdownPreviewSide` through a boot-time save.

**Impossible if true:** booting before a plugin registers removes that plugin's stored setting; an
older Invar version erases a setting written by a newer version when it saves another field.

**Verification:** `bun test src/modules/settings && bun
scripts/harness/smoke-plugin-manifest-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### Every setting is a reactive cell read through its value ref

**Invariant:** If a consumer reads a setting, then it reads `Settings.Class.<field>.value` — each
field is a ref-returning getter, so a change made anywhere (load, `set`, project override) live-
applies to every observer without a reload or manual notification.

**Scope:** all `SettingsValues` fields exposed by the store.

**Mechanism:** ivue `Reactive($Settings)` turns each `get field(): Ref<T>` into a persistent state
cell; `applyValues` writes through `field.value`, so effects/renderers tracking a field re-run on
change. Realizes `project.conventions.md` "Reactive state = ref-returning getters".

**Generates:** live-applying theme/word-wrap/scroll-physics changes; the single read shape
`<field>.value` for all consumers.

**Evidence:** `Settings.ts` ref-getter fields + `applyValues`; `Settings.test.ts` "a reactive read
re-runs when set() changes the value (live-apply)".

**Impossible if true:** a consumer having to poll or reload to observe a settings change; two reads
of the same field returning different cells.

**Verification:** a `vue` `effect()` tracking `theme.value` that must re-run after `set('theme', …)`.

**Status:** provisional

**Last refined:** 2026-07-21

### Values layer defaults then user then project in that precedence

**Invariant:** If a field is present in more than one source, then the effective value is the
project file's over the user file's over the built-in default — a lower layer never overrides a
higher one.

**Scope:** `Settings.load` merge of `defaults`, user file, and project file.

**Mechanism:** `load` applies `{ ...defaults, ...userValues, ...projectValues }` so later spreads
win; each source is first narrowed by `sanitize` so absent keys leave the layer beneath intact.

**Generates:** per-project overrides on top of personal defaults; predictable precedence.

**Evidence:** `Settings.ts` `load` merge order; `Settings.test.ts` "user file overrides defaults"
and "project file overrides the user file".

**Impossible if true:** a user file value winning over a project override for the same key; a
default surviving where the user file set that key.

**Verification:** a test with the same key set in defaults, user, and project asserting the project
value wins and a user-only key survives.

**Status:** provisional

**Last refined:** 2026-07-21

### Persistence writes only the user file through the injectable seam

**Invariant:** If the store persists, then `save()` writes the current snapshot to the resolved
user path only (never the project override), and all filesystem access flows through the
`createFileSystem()` seam so tests substitute an in-memory fake for the real `~/.config`.

**Scope:** `Settings.save`, `Settings.userSettingsPath`, `Settings.createFileSystem`.

**Mechanism:** `save` serializes `snapshot()` to `userSettingsPath` (remembered from `load`, else the
OS default) via `fileSystem.writeTextFile`; the filesystem is built once by the overridable
`createFileSystem()`, which prefers a constructor-injected `fileSystem`. Write errors are swallowed
(best-effort persistence).

**Generates:** the fake-fs test seam; user-scoped persistence that leaves project files untouched.

**Evidence:** `Settings.ts` `save` / `userSettingsPath` / `createFileSystem`; `Settings.test.ts`
"set() + save() round-trips through the filesystem" and "save() targets the user path resolved
during load()".

**Impossible if true:** `save()` writing the project override file; a test mutating the real
`~/.config/invar/settings.json`; a write failure crashing the app.

**Verification:** a test that `set()`+`save()` then confirms only the user path was written in the
fake store and a reload reads the values back.

**Status:** provisional

**Last refined:** 2026-07-21
