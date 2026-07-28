# ROUND 2 — one red: a probe that parses SOURCE TEXT by identifier spelling

Work ONLY in `/tmp/conductor-statics` (branch `refactor-ivue-static-naming-latest`, main
already merged, at `8bebddb`). Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/
delete. Append to `/tmp/statics-split-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

Your split is ACCEPTED — the naming axis, the checker, its seven tests, the conventions-gate
step, the 132 renames, the 18 resolutions, the preserved blocked branch, and the ivue findings
report all stand. Do not redo them. One smoke you did not run is red on the full gate
(run `1477045`), and I have already diagnosed it. Build on this; do not re-derive it.

## The red, and its exact mechanism

```
smoke: settings-applied harness
FAIL all 0 schema fields have an applied-effect drive
```

**Zero fields, not a missing one.** `scripts/harness/smoke-settings-applied-harness.ts:996`
derives the field list by regex over SOURCE TEXT:

```js
settingsSource.match(/static get defaults[\s\S]*?return \{([\s\S]*?)\n\s*\};/)?.[1] ?? ''
```

Your rename made `src/modules/settings/Settings.ts:518` read `static get DEFAULTS`. The regex is
case-sensitive, so it matches nothing, `defaultsBlock` falls back to `''`, and the field list is
empty.

**Verdict: stale probe, app correct.** The rename is the point of the task and your own checker
enforces it. I confirmed `defaults` on main versus `DEFAULTS` on your branch. Do not revert the
rename.

## Why this red matters more than a one-line fix

Look at line 1008:

```js
schemaSettingNames.length > 0 && uncoveredSettings.length === 0
```

Without that `length > 0` guard, `uncoveredSettings.length === 0` would be **vacuously true**
over an empty list — `every([])` is true. The rename would have silently switched off the entire
settings-applied contract and the gate would have gone GREEN with zero settings covered.

That guard is a positive control that just earned its keep. Say so in your report; it is
evidence for the repo's rule that a check which can only fail toward "pass" is not an
instrument.

## The fix — structural, not a re-spelling

Do NOT just change the regex to `DEFAULTS`. That re-couples the probe to identifier spelling and
schedules the identical failure for the next rename — and it will fail the same silent way.

Derive the schema field names **structurally**, so a rename breaks loudly or not at all. Ranked:

1. **Import and enumerate at runtime** — read the keys off the actual defaults object
   (`Object.keys(...)` on the imported `Settings` defaults). A rename then breaks the IMPORT,
   which TypeScript and the harness report immediately, instead of yielding an empty list.
2. **Read a published schema** if the app already exposes one through status; same property.
3. Source-text parsing only if neither is reachable — and then it MUST assert a non-zero count
   with a message naming the file and pattern, so the failure is self-diagnosing.

Then sweep for the same shape: any harness or checker that parses source text by identifier
name is coupled to spelling in a way the type checker cannot see. Report every instance found,
even those currently passing. Fixing the others is out of scope; enumerating them is required.

## Positive control

Prove the repaired enumeration can still fail: temporarily remove one field's applied-effect
drive (not the enumeration) and quote the red naming that field. Also confirm the non-zero guard
still fires — point the enumeration at nothing and quote the message.

## Verification — quote exact exit codes

`bun scripts/harness/smoke-settings-applied-harness.ts` 3x, plus `bunx tsc --noEmit`,
`bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, `bun scripts/check-static-getter-naming.ts`, and a
driven boot that OPENS SETTINGS and confirms the panel lists its fields — your round-1 drive
covered navigation but never opened Settings, which is why a zero-descriptor risk was not
visible to it. Never read `$?` after a pipeline.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class`, never
`Class`). Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the
tree clean.
