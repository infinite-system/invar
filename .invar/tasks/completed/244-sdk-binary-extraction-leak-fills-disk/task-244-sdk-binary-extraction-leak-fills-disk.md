# 244 — every app boot extracts a fresh 200MB agent-sdk binary; a gate run leaks ~13GB

State: COMPLETED — c44c23db — lazy SDK import at first send; bounded boot/exit reaper; permanent extraction smoke
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: fleet-integrity

## Outline

Found live at 02:4x: the root disk hit 100% (13MB free) during the #35/#233
batch gate. The writer was `/tmp/.<hex>-<counter>.claude-agent-sdk-linux-arm64*/claude`
— dozens of hidden directories, each one full extracted copy of the
`@anthropic-ai/claude-agent-sdk` native binary (~200MB). Deleting all but the
newest three returned 14GB.

The generator: the app bundles `@anthropic-ai/claude-agent-sdk` (package.json)
and `src/modules/agent/SdkStreamBackend.ts` spawns it. Each app launch that
touches the agent path extracts its own copy into a new hidden /tmp directory
and NOTHING reaps it. A gate run boots the app many times across 18 smokes —
each boot leaks one copy. Two zero-space windows poisoned a gate tonight and
nearly took the machine down under a sleeping user.

USER DECISION (02:5x, awake mid-incident): the user SAW the app open the
agent process at boot. The chosen fix is LAZY: the app spawns NOTHING for the
agent pane until the user actually works in it. No SDK process, no
extraction, at boot or on pane creation. If the pane must show something
before first use, a plain PTY shell or an idle placeholder is acceptable —
never the SDK. Smoke boots therefore never touch the SDK at all.

Supporting work, still in scope:

1. Diagnose exactly WHERE the boot path triggers the spawn (why is the cache
   missed — per-process temp naming? counter suffix in the observed names
   suggests deliberate uniqueness) and record it.
2. Defensively reap stale sibling extractions at app exit or boot (older
   than N hours) — the backstop for spawns that do legitimately happen.

The done-test: run the full merge gate, count
`/tmp/.*claude-agent-sdk*` directories before and after — the count must not
grow. Positive control: revert the fix, show the count grows per boot.

MEASURED RATE (02:5x, second incident same night): one merge-gate smoke pool
(60 jobs, 6 workers) produced 131 extractions ≈ 26GB in under ten minutes.
A process census DURING the pool found ZERO live processes with an exe
inside any extraction dir — the spawned binary exits (or fails) immediately
after boot, so every boot pays 200MB of disk for a process that does not
survive. That immediate exit is your first diagnostic thread. Interim
mitigation live until this task lands: a conductor-armed reaper deletes
extractions older than one minute every 30s (`/tmp/sdk-reaper.pid`);
your fix replaces it.

## Invariants in scope

- [src/modules/agent/agent.invariants.md](../../../../src/modules/agent/agent.invariants.md) (if present) — the backend spawn
  contract; add a record: an app boot leaves no unreaped binary extraction.
- [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md) — smoke boots must be disk-bounded.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- Conductor observation 02:4x: `du` evidence, ~66 extraction dirs, counter
  suffixes `-0000002C` through `-00000032`; live gate processes in
  `/tmp/gate-batch-35-233` while dirs multiplied.
- `package.json:17` `@anthropic-ai/claude-agent-sdk": "^0.3.218"`.
