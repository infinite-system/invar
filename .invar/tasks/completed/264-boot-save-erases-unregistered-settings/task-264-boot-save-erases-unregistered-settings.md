# 264 — a boot-time save erases stored contributed settings that have not registered yet

State: COMPLETED — 4cc0f68a — persistenceSnapshot round-trips unknown keys; boot save no longer erases contributed settings
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: user-directed

## Outline

Bycatch of #237, reproduced twice, and it is DATA LOSS: seed
`~/.config/invar/settings.json` (isolated home) with
`{"markdownPreviewSide":"right"}`, boot — the app resolves `left` and
REWRITES the file with `left`. The same seed resolves correctly through
`Settings.load()` + `registerSetting()` in isolation, so the eraser is a
save that fires BEFORE plugin activation. Named suspect: the agent-provider
write-back save at `src/modules/app/Bootstrap.ts:638`.
`persistenceSnapshot()` drops every key not yet registered.

Consequence: NO contributed setting (markdownSplitRatio,
markdownPreviewSide, inlineRewrite.enabled, structureShowByDefault, …)
survives a reboot in any environment where a save fires before activation.
This is also the mechanism family #233 circled: the app rewriting the whole
settings snapshot at boot (01:29 on the user's real file). #233 proved the
rewrite; this task fixes the loss.

The generator-level fix candidates (diagnose, then choose):

1. `persistenceSnapshot()` PRESERVES unrecognized keys verbatim (round-trip
   unknowns — the classic config rule; forward-compatible too).
2. No save may fire before contributions finish activating (ordering fix —
   fragile if any late plugin exists).

Candidate 1 is likely the invariant: a settings store never deletes what it
does not understand. Positive control: seed, boot, quote the file
surviving; then revert the fix and quote the erasure.

Reproduction: `probe-237-narrow-resize-settle.ts` in #237's folder (STATUS
and USERFILE lines).

## Invariants in scope

- The settings records (`src/modules/settings/*.invariants.md`) — add the
  round-trip-unknowns record; the contributed-settings convention from
  #222/#100.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-237-...md`, Bycatch 2; #233's completed report (the snapshot
  rewrite evidence).
