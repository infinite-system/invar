# 332 — smoke-tabs.sh hard-codes the old close mark the glyph seam replaced

State: active
Priority: verification-integrity
Engine: codex
Model: 5.6-sol
Effort: low
Provenance: BYCATCH of #323 (quit confirmation dialog), 2026-07-30

## Drift

[scripts/smoke-tabs.sh](../../../../scripts/smoke-tabs.sh) still
hard-codes the old close mark. The active `panelClose` token now
supplies Nerd, Unicode, or plain glyphs per tier. This is generator
drift: a consumer bypassing the glyph seam with a frozen literal.

The smoke is in the legacy full-tmux tier, which the gate SKIPS unless
`INVAR_FULL_TMUX=1`, so it did not run during #323 and its red or green
is currently unobserved. An unrun smoke that would fail when run is a
file that LOOKS like a contract.

## Work

Decide per the legacy-tmux doctrine: port the assertion into a
PTY-harness smoke keyed on the `panelClose` token (never a new tmux
smoke), or retire the file into `scripts/retired-smokes/` with a
`project.coverage-deltas.md` declaration naming the replacement
coverage. Do not patch the literal in place: that keeps a consumer off
the seam. Sweep the rest of the legacy tmux tier for the same frozen
close-mark pattern while there (a population check, discovered not
enumerated).
