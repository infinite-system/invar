# Brief #483 round 1 — shortcut getters replace the chains

## In plain words

The short names exist but almost nobody uses them, so new code copies the
long chains. Convert the harness paths first, then the app code file by
file with judgment — some places are better with a local variable, and you
decide which, site by site.

## Read first

1. [task-483](task-483-shortcut-getters-replace-the-chains.md) — the two
   phases, the per-site rules, and the WHY. The rules are the assignment.
2. [the drive-pty skill](../../../../.claude/skills/drive-pty/SKILL.md) and
   [the ivue skill](../../../../.claude/skills/ivue/SKILL.md) (plain getters,
   naming).

## Invariants in scope

- [Derived state is a plain getter unless caching is proven](../../../../project.invariants.md) — any NEW shortcut you propose obeys it.
- [The composition graph reaches every installed contributor](../../../../src/modules/system/system.invariants.md) — path strings you touch stay live; verify by driving one converted path.
- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md) — conversions must not change any wait's semantics.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, even when None observed.

## Instrument feedback — the standing loop

Report the `## Instrument feedback` section: easy, confusing, missing.

## Verification

Per the task file, including the before/after census table and the
kept-as-local count. NO merge-gate; SKIP_GATE=1.

## End state

A report file in this folder, number-first, opening with `## In plain words`.
