# #370 — the legacy tabs smoke is red and nobody runs it

State: ACTIVE
Priority: verification-integrity
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #344 (reproduced twice, base tree too)

bash scripts/smoke-tabs.sh fails with "FAIL no filename+✕ tab label" on
branch AND at base e95f0c22. Legacy tmux tier — the gate skips it unless
INVAR_FULL_TMUX=1; the PTY smoke-tabs-harness.ts is green. An unrun red
smoke is a decoration that LOOKS like a contract (doctrine: unrun smoke
is not coverage).

## Work

Decide per the tmux-legacy policy: port any assertion the PTY harness
lacks, then retire the tmux smoke to scripts/retired-smokes/ (never
delete). Verify the PTY twin actually covers the label assertion first.
