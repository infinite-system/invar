# READY — ivue static getter naming split

Final branch: `refactor-ivue-static-naming-latest`

Final commit: `5a29312e3e8d614bbcff566841402f08fbfdcc23`

Base: `b275bf93b59ca3de8dba1919c222da5be7cd3579`
(`origin/main` at completion)

Tree: clean.

## Delivered

- Split the naming axis from the blocked ivue 2.2.0 cache migration.
- Added `scripts/check-static-getter-naming.ts` and its seven-test suite.
- Added the checker to `scripts/conventions-gate.sh`.
- Documented the orthogonal `$` cache axis and literal/derived case axis in
  `project.conventions.md`.
- Carried the 132 ordinary literal-static renames and the 18 accepted
  Pass A / Pass B resolutions, including all consumer and test references.
- Preserved all 56 `Object.defineProperty(this, ...)` self-replacements.
- Preserved the four cache helper definitions and every helper-backed cache
  for a derived `$` getter.
- Kept `package.json` and `bun.lock` on ivue 2.1.0.
- Removed the 2.2.0-specific cache-order regression test from the naming
  commit.

The 18 literal-cache disagreements retain the accepted resolution: the
literal getters drop `$`, use uppercase names, and return their literal
compositions directly. The four cache helpers themselves remain available;
derived `$` getters continue to use them.

## Preserved blocked work

`refactor-ivue-statics` still points to:

`ad3bd66bff23aff6a211c0ac0d1dd01b956a7103`

No ivue source, `/home/parallels/dev/ivue`, tag, remote, or blocked branch was
modified.

`origin/main` advanced once during the first completed verification pass. The
already-verified split was preserved on `refactor-ivue-static-naming` at
`5974cd094f1a73c113d8d15d02b99f403d9b527a`. Because merging, rebasing,
tagging, and deleting were forbidden, I replayed the commit onto the final
branch from the new `origin/main` and reran verification. The conductor can
mark the first split branch according to branch-lifecycle policy.

## ivue report

Decision-ready report:

`/tmp/IVUE-2.2.0-FINDINGS.md`

It covers:

1. The missing `Static()` requirement for static `$` caching, the 29 getters
   and 14 class topologies affected, and the 40,001 / 1,055-to-2,110 measured
   consequences.
2. The unconditional shallow freeze, the exact startup stack, the mutation
   census, and opt-out / development-only / convention-only trade-offs.
3. The confirmed method-binding order defect at
   `node_modules/ivue/lib/Static.ts:55`.

The first two findings are identified honestly as contract or design choices
unless ivue intends broader guarantees. The third is identified as a runtime
defect.

## Positive control

Temporarily planted:

```ts
protected static get namingPositiveControl(): number {
  return 1;
}
```

`bun scripts/check-static-getter-naming.ts` exited 1 with:

```text
src/modules/system/Momentum.ts:16:24 literal-valued static getter
'namingPositiveControl' must use SCREAMING_SNAKE_CASE
static-getter-naming: FAIL (1 violation(s))
```

The plant was removed before the final checks and commit.

## Verification

Final committed bytes on base `b275bf9`:

| Check | Exit | Result |
| --- | ---: | --- |
| `bunx tsc --noEmit` | 0 | PASS |
| `bun test` | 0 | 1,646 pass, 0 fail, 67,367 expects |
| `bash scripts/conventions-gate.sh` | 0 | PASS; 574 files named |
| invariant checker `--all --refs` | 0 | 867 annotations, 0 problems |
| `bun scripts/check-coverage-ratchet.ts` | 0 | 308 files, no decrease |
| driven real-app boot | 0 | navigation PTY smoke ALL-PASS |
| committed `git diff --check` | 0 | PASS |

The coverage ratchet's assertion-replacement census reported only the expected
identifier and quote-format replacements; assertion and wait counts did not
decrease.

## Drive evidence

The first baseline drive, before dependency restoration, reproduced the
accepted 2.2.0 startup failure because `node_modules` still contained ivue
2.2.0 from the blocked branch:

```text
fatal: TypeError: Attempted to assign to readonly property.
    at update (src/modules/system/StatusChannel.ts:65:12)
    at attach (src/modules/app/App.ts:61:25)
    at boot (src/modules/app/Bootstrap.ts:100:9)
```

`bun install --frozen-lockfile` restored ivue 2.1.0. The identical default
navigation drive then booted and passed before the change. The final committed
branch drove the real app through `PtyTestDriver`, opened two files, moved the
cursor, navigated backward and forward by keys, and repeated navigation via
mouse controls. It exited 0 with `ALL-PASS`.

## Invariant review

Scope was derived from the root naming convention and the governed module
paths touched by the rename. The change preserves the namespace pattern,
late dependency reads, cache identities for all derived `$` getters, and
overridable construction seams. No recorded invariant was violated or
stressed; the mechanical checker resolved 867 annotations with zero problems.

## Bycatch

No unrelated product defect was observed. The stale local 2.2.0 dependency
state was environmental, reproduced the accepted freeze finding, and was
corrected from the 2.1.0 lockfile before implementation and verification.

COMPACTION: none

conventions @ `5a29312e3e8d614bbcff566841402f08fbfdcc23`

---

# READY — round 2 settings schema probe repair

Branch: `refactor-ivue-static-naming-latest`

Round-2 commit: `31c1273f33eeda7f914c43092deb4ee1216ea1ad`

Base supplied by the task: `8bebddb710dcf877ad59f915f7493c4bfcabfc01`

## Delivered

- Replaced the `Settings.ts` source-text regex with
  `Object.keys(Settings.$Class.DEFAULTS)`.
- Kept empty runtime enumeration and uncovered schema fields as separate
  failures, with uncovered field names in the latter message.
- Extended the real Ctrl+, drive to require the opened Settings panel to
  publish at least the complete 35-field host schema.
- Preserved the accepted `DEFAULTS` rename and all round-1 work.

The runtime import makes a future defaults-member rename a TypeScript-visible
reference failure instead of silently producing an empty schema. The existing
nonzero guard remains independently enforced.

## Source-text identifier-parser sweep

An AST census covered `scripts/harness/**/*.{ts,mjs,js}` and
`scripts/check*.{ts,mjs,js}`. It enumerated source/text parsing call
expressions structurally and classified their inputs.

One raw source-text parser coupled to an identifier spelling was found:

- `scripts/harness/smoke-settings-applied-harness.ts:996` parsed
  `Settings.ts` with `/static get defaults.../`. This is the diagnosed red and
  is fixed in round 2.

No other harness or checker in that scope parses raw program source by an
identifier spelling. The other census results either inspect TypeScript AST
identifier nodes intentionally (for naming/file-grammar enforcement), parse
non-code artifacts such as Markdown baselines, or inspect rendered/status
text rather than program source.

## Positive controls

Removing only `theme` from `coveredSettingNames`, without changing runtime
enumeration, made the repaired smoke exit 1 with:

```text
error: FAIL all 35 schema fields have an applied-effect drive; uncovered: theme
```

Pointing runtime enumeration at an empty object made the smoke exit 1 with:

```text
error: FAIL runtime Settings defaults enumerate at least one schema field
```

Both plants were removed before final verification and commit.

The original `schemaSettingNames.length > 0` guard therefore earned its keep:
without it, `uncoveredSettings.length === 0` would have passed vacuously after
the rename and silently disabled the entire applied-settings contract.

## Verification

All required commands ran against the final source bytes and returned:

| Check | Exit | Result |
| --- | ---: | --- |
| `bun scripts/harness/smoke-settings-applied-harness.ts` run 1 | 0 | ALL-PASS |
| `bun scripts/harness/smoke-settings-applied-harness.ts` run 2 | 0 | ALL-PASS |
| `bun scripts/harness/smoke-settings-applied-harness.ts` run 3 | 0 | ALL-PASS |
| `bunx tsc --noEmit` | 0 | PASS |
| `bun test` | 0 | 1,646 pass, 0 fail, 67,367 expects |
| `bash scripts/conventions-gate.sh` | 0 | PASS |
| invariant checker `--all --refs` | 0 | 867 annotations, 0 problems |
| `bun scripts/check-coverage-ratchet.ts` | 0 | 308 files, no decrease |
| `bun scripts/check-static-getter-naming.ts` | 0 | 574 files inspected |
| `git diff --check HEAD^..HEAD` | 0 | PASS |

Each of the three settings smoke runs booted the real app through
`PtyTestDriver`, sent `Control+,`, observed `settingsOpen === true`, and
printed:

```text
PASS  opened Settings panel lists at least all 35 host schema fields
```

## Invariant review

Derived scope: root `Coverage may fall but never silently`, the harness PTY
and emulator contracts, and the settings contract reached by the runtime
schema import. The change strengthens coverage from 24 assertions / 24 waits
to 26 assertions / 24 waits, keeps every settings invariant upheld, and
resolves all invariant annotations.

## Tree state

The round-2 change is fully committed and has no staged or unstaged residue.
`artifacts/render-progress.json` remains untracked exactly as it was on task
entry; it was preserved as pre-existing workspace state.

## Bycatch

No unrelated product defect was observed.

COMPACTION: none

conventions @ `5a29312e3e8d614bbcff566841402f08fbfdcc23`
