# 265 — uninstalling a plugin turns its status keys undefined, not false

State: COMPLETED — eb4879b0 — Plugin status keys: absent on uninstall is the contract — recorded, two-layer regression test, 97-key census, permissive assert fixed
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: verification-integrity

## Outline

Bycatch of #237, observed twice: after disabling the markdown plugin,
`markdownPreviewOpen` reads `undefined` although `MarkdownPreview.close()`
publishes `false` — the projection rebuild drops plugin keys entirely.
#220's law says ABSENT-not-stale is correct on uninstall, so this may be
intended; but two smokes have now had to learn `!== true` by surprise.

Small task: decide and document. If absent-on-uninstall is the contract,
state it in the StatusChannel record (one line) and sweep smokes for
`=== false` assertions on plugin keys (both polarities: find the ones that
would silently pass AND the ones that would wrongly fail). If it is not
intended, fix the projection rebuild. Either way the next builder should
not rediscover it.

## Invariants in scope

- The StatusChannel/status-projection records; #220's
  uninstall-symmetry record (keys ABSENT not stale) — this task
  reconciles the two.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-237-...md`, Bycatch 3; `probe-237-uninstall-stale-pane.ts`.
