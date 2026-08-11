# READY report — #523 (codex hooks engine probe)

## In plain words

Codex has a hooks engine. You write a small file that says "when a session
starts, or when codex squeezes its chat history, run this program". I wrote
that file, ran scratch codex sessions, and the programs ran. Codex told them
what happened as a small JSON note, including the exact path of the session's
log file. There is one catch: codex refuses to run a hook until the user has
trusted it once, or the launch passes a bypass flag. With that solved, the
hooks give us a direct "compaction happened" signal, so we no longer need to
guess compaction from token counts.

All four hooks in scope are PROVEN FIRING by live capture on codex-cli
0.146.1: `SessionStart`, `SessionEnd`, `PreCompact`, `PostCompact` — around a
real forced compaction. Payloads quoted below. The proposal at the end is a
proposal only; nothing was implemented, and #517's notify path is untouched.

## What was driven (the protocol)

Scratch `CODEX_HOME` + scratch cwd only
(`/tmp/.../scratchpad/hooks-probe/`), trivial "Reply with exactly: hi"
prompts, one manual `/compact`. No live builder session was touched; no
kills by name pattern (the only kills were my own probe tmux sessions
`hooks523`, `hooks523b`, `hooks523c`). The capture program
([probe-523-capture-hook.sh](probe-523-capture-hook.sh)) appends timestamp,
argv, full stdin, and env per invocation.

Both polarities were driven for every claim:

- fire with trust, fire with bypass flag, fire via `-c` per-launch override
- NO fire with no trust (4 earlier variants), NO fire for a hook whose
  command changed by one word while its untouched sibling still fired,
  NO fire for `-c` registration without the bypass flag

## Registration — what actually works (0.146.1)

1. **File**: `$CODEX_HOME/hooks.json` (user layer) or `<repo>/.codex/hooks.json`
   (project layer, requires directory trust). Shape, verified live
   ([probe-523-hooks.json](probe-523-hooks.json)):

   ```json
   { "hooks": { "SessionStart": [ { "hooks": [ {
     "type": "command", "command": "/path/to/program", "timeout": 30 } ] } ] } }
   ```

   Event names are PascalCase in the file. Eleven events exist:
   PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact,
   SessionStart, SessionEnd, UserPromptSubmit, SubagentStart, SubagentStop,
   Stop. Handler fields: `command`, `timeout` (sec), `async`,
   `statusMessage`, `additionalContextLimit`, optional group `matcher`
   (regex). `type: "prompt"` and `"agent"` parse but are skipped
   ("not supported yet").
2. **TOML**: the same events as a `[hooks]` table in any layer's
   `config.toml`. That means per-launch registration works:
   `codex -c 'hooks.SessionStart=[{hooks=[{type="command", command="..."}]}]'`
   — proven firing (with the bypass flag; see trust below).
3. **Plugins**: a plugin can bundle `hooks/hooks.json`. Not driven (no local
   plugin install path on this version; marketplace only).

## Trust — the gate that cost four silent no-fires

Hooks are DISCOVERED but NOT EXECUTED until trusted. This is why every
naive registration attempt was silent: no warning, no log line, exit 0.

- Sanctioned flow: on next TUI start codex shows "Hooks need review — N
  hooks are new or changed. Hooks can run outside the sandbox after you
  trust them." with Review / Trust all / Continue without trusting.
  "Trust all" writes per-hook entries into `$CODEX_HOME/config.toml`:

  ```toml
  [hooks.state."<abs-path>/hooks.json:session_start:0:0"]
  trusted_hash = "sha256:44fe0a53a3f2555eed55b68237907606e5920c89271cc98a531cc2de8967da4e"
  ```

  (full excerpt: [probe-523-trusted-state-config.toml.excerpt](probe-523-trusted-state-config.toml.excerpt))
  After that, hooks fire in both `codex exec` and the TUI with no flags.
- Bypass: `--dangerously-bypass-hook-trust` (exists on `codex` and
  `codex exec`) runs enabled hooks without persisted trust. Proven firing.
- The hash covers the hook's normalized content, keyed by
  `<source-path>:<event>:<group-index>:<handler-index>`. EDITING A HOOK
  SILENTLY DISABLES IT in `exec` (driven: one-word change → that hook did
  not fire, sibling did, zero warnings printed). The TUI re-prompts instead.
- Source of the semantics: `codex-rs/hooks/src/engine/discovery.rs` at tag
  `rust-v0.146.1` — a handler is pushed only when
  `trust_status ∈ {Managed, Trusted}` or bypass is set.

## Fire proof — the captured lifecycle (one TUI session, manual /compact)

From [probe-523-capture-tui-lifecycle.log](probe-523-capture-tui-lifecycle.log),
one session `019ff1f1-9d66-73b1-8883-dc780d634fe1`, in firing order:

1. `SessionStart` at launch:

   ```json
   {"session_id":"019ff1f1-9d66-...","transcript_path":".../sessions/2026/08/11/rollout-2026-08-11T13-49-31-019ff1f1-9d66-73b1-8883-dc780d634fe1.jsonl","cwd":".../hooks-probe/cwd","hook_event_name":"SessionStart","model":"gpt-5.6-sol","permission_mode":"default","source":"startup"}
   ```

2. `PreCompact` when `/compact` was sent (13:49:53):

   ```json
   {"session_id":"019ff1f1-9d66-...","turn_id":"019ff1f1-f58e-...","transcript_path":"<same rollout>","cwd":"...","hook_event_name":"PreCompact","model":"gpt-5.6-sol","trigger":"manual"}
   ```

3. `PostCompact` six seconds later (13:49:59), same fields,
   `"hook_event_name":"PostCompact","trigger":"manual"`.
4. `SessionStart` again on the NEXT user turn after compaction, with
   `"source":"compact"` — a second, distinct compaction signal.
5. `SessionEnd` on `/quit`: `{"...","hook_event_name":"SessionEnd","reason":"other"}`.

`codex exec` fires the same SessionStart/SessionEnd pair
([probe-523-capture-exec-sessionstartend.log](probe-523-capture-exec-sessionstartend.log)).

Key payload facts for the fleet:

- `transcript_path` IS the rollout file path — the lane-to-file identity
  #517's notify script reconstructs from `thread-id` comes for free.
- `trigger` distinguishes `manual` from `auto`. Auto was not driven (it
  needs a ~230k-token session); source confirms both triggers flow through
  the same `run_pre_compact_hooks` call
  (`core/src/hook_runtime.rs:806` maps `CompactionTrigger::Auto => "auto"`),
  and the RemoteCompactionV2 path (active on our gpt-5.6-sol sessions —
  it was in the enabled-features line of these very probes) calls the same
  hook outcome (`core/src/compact_remote_v2.rs:149`).
- No token counts in any hook payload. Usage still comes from the rollout,
  as in #517.
- Output semantics (source + upstream docs, not driven): SessionStart may
  return `hookSpecificOutput.additionalContext` (injected into the model
  context, ~2,500-token spill default); PreCompact returning
  `continue:false` BLOCKS the compaction (upstream test
  `continue_false_stops_before_compaction`). Matchers apply to `source`
  (SessionStart) and `trigger` (Pre/PostCompact).

## Verdict and proposal (proposal only — nothing implemented)

The engine is solid on 0.146.1: deterministic fire order, exact payloads,
direct compaction signal. ADOPT, with the trust wrinkle handled explicitly.

- **Replace #517's usage-collapse differencing with `PostCompact`** as the
  primary detection: the hook hands the script `session_id`,
  `transcript_path`, `cwd`, and `trigger` — strictly more than notify's
  payload, at the exact moment of compaction instead of one turn late.
  Steer text and idempotence layers carry over unchanged; the generation
  counter keys naturally off `turn_id`. `PreCompact` gives the WARN arm a
  precise "compaction imminent" moment (today it is a 70% threshold guess).
- **`SessionStart` (`source:"startup"`) for the opening task-file send**,
  and `source:"compact"` as a second re-read signal.
- **Deployment shape**: per-launch `-c hooks....` registration +
  `--dangerously-bypass-hook-trust` in `scripts/fleet/dispatch.sh` mirrors
  how notify is registered today (no global state, scratch-safe, proven
  firing). Alternative: one-time "Trust all" on the fleet machine with
  hooks in `~/.codex/hooks.json`; then no flag is needed, but every edit to
  a hook silently disables it in exec until re-trusted — an outage-by-
  maintenance trap for a fleet. The per-launch flag avoids that class.
- **Keep notify as the fallback** (per brief): it is version-proven and
  registration-compatible; the hooks path degrades safely to it if a codex
  update changes hook semantics (0.147.0 is already out — re-verify on
  update).

## Bycatch (taxonomy per [AGENTS.md](../../../../AGENTS.md))

- **Probe residue in the user's real codex config (ask):** my first TUI
  probe launched before I verified env inheritance, so it ran against the
  real `~/.codex`: it added
  `[projects."/tmp/.../scratchpad/hooks-probe/cwd"] trust_level = "trusted"`
  (config.toml line 37 at probe time) and one rollout
  (`sessions/2026/08/11/rollout-2026-08-11T13-44-52-019ff1ed-....jsonl`).
  Not removed — editing the user's live config from a builder felt wrong;
  one two-line prune to approve. The same session also proved a trap worth
  recording: `agent-tmux launch` panes do NOT inherit the caller's
  environment variables — env must ride inside the pane command
  (`-- env CODEX_HOME=... codex`). Suspect the same applies to any
  env-dependent fleet launch.
- **Comment drift, `codex features list` vs reality (none in our repo):**
  no Invar-repo findings; the probe touched fleet tooling only.
- **Distillation possibility (existing, now stronger):** #517 already named
  the duplicated rollout-locating logic in `steer.sh` / `fleet-watch.sh`.
  The hooks payload (`transcript_path` delivered directly) would delete
  that generator entirely if adopted — one more consumer for the same seam
  decision.
- **Plain nonsense, upstream (not ours):** codex prints NOTHING when a
  trusted-hash mismatch disables a hook in `exec` mode — a check that can
  only fail silently. Named here so the adoption task plants a positive
  control (a canary hook whose absence of output is itself alarmed) rather
  than trusting silence.

## Artifacts (committed in this task folder, branch `fleet/523-codex-hooks-engine-probe`)

- [probe-523-capture-hook.sh](probe-523-capture-hook.sh) — the capture program (header explains reading the log)
- [probe-523-hooks.json](probe-523-hooks.json) — the exact registration file that fired
- [probe-523-capture-tui-lifecycle.log](probe-523-capture-tui-lifecycle.log) — SessionStart→PreCompact→PostCompact→SessionStart(compact)→SessionEnd
- [probe-523-capture-exec-sessionstartend.log](probe-523-capture-exec-sessionstartend.log) — exec-mode pair with full env dump
- [probe-523-trusted-state-config.toml.excerpt](probe-523-trusted-state-config.toml.excerpt) — the persisted trust state

## Instrument feedback

EASY: agent-tmux launch/send-wait/peek covered the whole TUI drive.
CONFUSING: launch does not pass caller env to the pane (cost one void
probe round; see bycatch). MISSING: nothing — no new verb wanted.
