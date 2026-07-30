# #367 — legacy tui-harness falls back to a persisted shared HOME

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #90 (census finding 5)

scripts/tui-harness.sh falls back to persisted $ROOT/artifacts/home when
INVAR_HARNESS_HOME is unset. The gate is safe (behavioral-contracts.sh
exports a run-scoped home) but a direct manual launch persists
settings.json between runs — the recorded smoke-isolate-persisted-HOME
class; smoke-voice-picker.sh:19 documents a false result it produced.

## Work

Default the fallback to a per-run mktemp home (or refuse loudly without
INVAR_HARNESS_HOME). Check the legacy tmux tier smokes still run.
