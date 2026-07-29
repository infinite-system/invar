# 261 — the drive harness and the smoke PTY disagree on shifted-control chords

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: verification-integrity

## Outline

Bycatch of #238, pre-existing: `Ctrl+Shift+U` does nothing through
`bun run drive` (baseline included) while the SAME chord works in the
manifest smoke's PTY. Two harness key encoders disagree on shifted-control
letters — which means every builder who tries a shifted-control chord in
the drive tool concludes "the feature is broken" and burns a wrong turn
(#238's builder did).

Census both encoders (the drive tool's and the smoke harness's), name the
byte sequences each emits for Ctrl+Shift+<letter>, and unify at the shared
generator — one key-to-bytes table both consume (the seam rule; a third
encoder would otherwise appear). Positive control: the failing chord drives
the real feature through `bun run drive` after the fix; a planted wrong
encoding reds it.

## Invariants in scope

- `scripts/harness/harness.invariants.md` — the driver records; add the
  one-encoder clause where it belongs.

## Bycatch expected

Per AGENTS.md's taxonomy — wrong-unit/wrong-encoding siblings; this family
keeps growing. The READY report carries `## Bycatch` even if it reads
`None observed`.

## Sources

- `report-238-...md`, Bycatch item 5.
