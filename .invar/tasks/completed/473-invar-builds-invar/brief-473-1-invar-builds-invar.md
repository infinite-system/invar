# Brief #473 round 1 — the MCP doorway and the instrument fixes

## In plain words

Agents drive the app through shell commands today. Give them a proper MCP
server that exposes the SAME drive and graph verbs, and fix the small
instrument problems two builders reported tonight. No new capability — only
a new doorway to what exists.

## Read first, in this order

1. [task-473](task-473-invar-builds-invar.md) — the composition, the
   boundaries, and the accumulated builder feedback at the bottom. That
   feedback IS part of this round's scope.
2. [the drive-pty skill](../../../../.claude/skills/drive-pty/SKILL.md) — the
   instrument you are wrapping and repairing.
3. [GraphClient](../../../../scripts/harness/GraphClient.ts) and the
   serve/attach machinery in
   [DriveSession](../../../../scripts/harness/DriveSession.ts).

## The work

1. **The MCP server** (stdio, new file under scripts/harness/). Tools:
   `drive_attach(snippet)`, `graph_get(path)`, `graph_await(path, value,
   timeoutMs)`, `graph_set(path, value)` (description must say EXPERIMENT
   ONLY, never verification), `screen(firstRow?, lastRow?)`,
   `server_start(workspace?)`, `server_reload`, `server_stop`. Every tool is
   a thin call into the existing GraphClient/attach protocols against the
   checkout-keyed server. NO teleport path: input reaches the app only as
   real PTY bytes through the existing verbs. Include a short README or
   skill section showing how Claude in the agent pane connects.
2. **The attach exit-code bug**: a failed snippet prints the failure but was
   observed once exiting 0. Reproduce, fix, and add the regression test.
3. **`app.show` label argument** (a label is currently treated as another
   status path).
4. **GAP 1 check**: a builder wanted "a condition wait for status-only
   fields" — `waitForStatus` already exists in the fluent chain. Find why
   the builder missed it (help text? skill?), fix the documentation split
   (status-versus-graph) in `--help` and the skill, and only build something
   new if a real gap remains.
5. **`--size N` fixture option** for DriveSession runs (generated N-line
   file in the temp workspace), so scale arms need no separate smoke.
6. **Unify or document the stop commands** (`bun run drive` vs DriveSession
   `--stop`).
7. **Mirror resize forwarding**: forward the hosting terminal's SIGWINCH to
   driver.resize so the mirrored app follows the pane.

## Invariants in scope

- [Harness input and output use the real PTY](../../../../scripts/harness/harness.invariants.md) — the MCP is a doorway, never a teleport.
- [Graph observation reads and never mutates](../../../../src/modules/system/system.invariants.md) — graph_set keeps its experiment framing.
- [Every wait names itself](../../../../scripts/harness/harness.invariants.md) — MCP tool errors carry the same loud misses.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, even when it reads
None observed.

## PTY usability — still tracked

Use the drive loop for verification; report the `## PTY usability` section:
easy, confusing, missing.

## Verification

- MCP round trip, both arms: a scripted stdio MCP client calls graph_get and
  drive_attach against a live server and gets real values; a wrong path
  through MCP returns the loud miss; a failed snippet returns an MCP error
  (and the CLI attach exits nonzero — fix 2's regression).
- `bun test` in FULL, `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`,
  invariant checker `--all` and `--refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`. The
  conductor gates and lands.

## End state

A report file in this folder, number-first per the task system naming,
opening with `## In plain words`, with invariant verdicts, bycatch, and PTY
usability sections.
