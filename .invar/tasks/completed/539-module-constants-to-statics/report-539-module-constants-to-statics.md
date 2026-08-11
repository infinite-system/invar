# READY — 539 module-constants-to-statics (round 2, after brief 539-2)

Branch: `fleet/539-module-constants-to-statics`, commits `56a2127a` (round 1
conversion) + `c3c22a82` (round 2 rename per the gate).

## In plain words

Round 1 moved the four loose constants onto the class. The gate then said
three of my getter names broke the house rule: a getter that returns a
literal is a tunable constant and must be named in capitals, with no dollar
cache. I renamed the three regex getters and their call sites. The set
getter keeps its dollar cache because it builds a Set, which is what the
cache is for. Everything still behaves the same and all gates are green.

## Round 2 — what changed

One file: `src/modules/vendors/PluginManifest.ts` (6 lines renamed).

- `$identitySegment` → `IDENTITY_SEGMENT`, `$semanticVersion` →
  `SEMANTIC_VERSION`, `$windowsDeviceName` → `WINDOWS_DEVICE_NAME` — all
  plain `protected static get` (live, no `$` cache; a fresh regex literal
  per read, correct house form for a tunable constant, negligible on the
  admission path).
- The three `this.` call sites updated to the new names.
- `$reservedVendors` unchanged, exactly as brief 539-2 directs.

**Deliberate deviation from the external spec** (brief 539-2 item 2): the
spec (`tmp/TASK-module-constants-to-statics.md`) named all four getters with
the `$` prefix. The repo's constants role table is the binding convention
and outranks the spec's naming for literal-valued getters. The spec's
intent survives intact: module-variable count is zero, reads are
receiver-following (`this.`), and every getter is subclass-pinchable — the
live SCREAMING_SNAKE_CASE getters are natively overridable knobs, verified
below.

## Verification (round 2)

- `bash scripts/conventions-gate.sh` in this worktree:
  **static-getter-naming: PASS** (914 files), conventions-gate: PASS,
  exit 0.
- `bunx tsc --noEmit` clean.
- `bun scripts/check-file-grammar.ts`: vendors still **7** reported (all
  missing-colocated-test), 14 legacy total, PASS — the round-1 zero for
  module variables holds.
- Full `bun test`: **2509 pass, 0 fail** (389 files, 21.2s).
- `bash scripts/smoke-plugin-manifest.sh`: 106 PASS lines, no failures.
- Stale-name sweep: zero references to the old `$`-names anywhere in src or
  scripts.
- Behavior probes through `PluginManifest.Class.parse`: good manifest
  accepted; reserved vendor, non-semantic version, non-kebab segment, and
  device-name segment each rejected — same messages, same order as before.
- `$reservedVendors` still identity-cached (`C.$reservedVendors ===
  C.$reservedVendors` true). The regex getters are now live
  (`C.SEMANTIC_VERSION !== C.SEMANTIC_VERSION` — fresh instance per read,
  stateless by construction).
- Override seam re-proven for the new form: a subclass of
  `PluginManifest.$Class` overriding `IDENTITY_SEGMENT` sees its own regex
  through receiver-following reads.

## Round 1 record (unchanged, for the landing view)

- Four module consts (the last in src) moved onto `$PluginManifest`;
  vendors grammar violations dropped 14 → 7 (4 module-variable + 3
  spacing between them). The remaining 7 are all missing-colocated-test:
  NetworkAdmission, PluginAdmission, PluginArtifact, PluginManifest,
  VendorPaths, VendorPluginInstaller, VendorPluginRuntime. Vendors is not
  zero, so it does NOT enter CONVERTED_MODULES (the brief's conditional
  does not fire). Those 7 are next-task candidates.
- Two-arm control: a planted module `const` in the converted kernel module
  turned the checker red (enforced, exit 1); removed, green.
- Census discipline zeros unmoved.

## Invariants in scope — unchanged from round 1

- **ivue statics discipline / constants role table**: now conformant on
  both axes — `$` cache only where a value is derived (the Set), live
  SCREAMING_SNAKE_CASE getters for tunable literal constants, reads
  receiver-following through `this.`, statics before other members.
  **upheld.**
- `vendors.invariants.md` (3 records), `network-admission.invariants.md`
  (2), `plugins.invariants.md` (3): **all untouched** — a rename inside the
  class, no behavior change; VendorPlugins.test.ts and the manifest smoke
  green.

## Coherence

The rename removes the one dialect clash round 1 introduced (spec naming vs
house naming). The file now reads identically to every other Static()
capability class in the repo. Coherence-positive.

## Bycatch (AGENTS.md taxonomy)

- Round 1 premise correction stands: the spec's "four of the fourteen" was
  actually seven of fourteen (three spacing violations fell with the
  consts).
- Round 2: None observed.

## Instrument feedback

None requested. The conventions gate's static-getter-naming message named
the rule and the three violating members precisely — easy round trip.
