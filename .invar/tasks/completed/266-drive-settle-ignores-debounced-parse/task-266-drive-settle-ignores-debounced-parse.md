# 266 — the drive's settled frame still shows "Parsing Markdown…"

State: COMPLETED — 2dd57fee — drive settle includes debounced work; terminal-stage race fixed
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: verification-integrity

## Outline

Bycatch of #237, observed on every drive: `bun run drive --open README.md`
prints a settled grid that still shows "Parsing Markdown…"
(`markdownParsing=true`) — the settled-frame condition does not include
debounced work. Harmless for a human reading the frame; a trap for any
grid assertion written against the settled print (a builder asserting
rendered content on the boot frame gets a red that retries green — the
retry-flake shape).

Fix at the instrument: the drive's settle should either wait for declared
quiescence keys (a small registry: `markdownParsing=false` when the key
exists — pattern already used by wait-for-status) or the settled print
should NAME the still-pending keys so the frame is honest. Do not widen
any timeout; a wait must be a condition. Positive control: a drive against
a large markdown file must show the difference.

## Invariants in scope

- [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md) and the drive tool's records —
  the settled-frame contract.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-237-...md`, Bycatch 4.
