# Brief #476 round 1 — reload survives a failed boot; MCP gains size

## In plain words

Two small fixes on one seam. First, a failed reload must keep the old app
alive instead of serving a dead one. Second, MCP callers need the same
generated-file option the command line already has.

## Read first

1. [task-476](task-476-reload-keeps-a-disposed-session-on-boot-failure.md) —
   both scopes, including the fix shape.
2. The serve loop in [DriveSession](../../../../scripts/harness/DriveSession.ts)
   and [InvarMcpServer](../../../../scripts/harness/InvarMcpServer.ts).

## The work

1. Reload: boot the replacement FIRST; dispose the old app only after the
   new one reaches ready; on boot failure answer the error and keep the old
   session live. Both arms: a forced boot failure (unwritable home) leaves
   the previous session answering attaches; a normal reload still swaps and
   the old app is disposed (no leak — prove the old pid exits).
2. MCP `server_start` gains `sizeLines`, passed through to the existing
   --size fixture machinery. Round-trip it from a scripted MCP client.

## Invariants in scope

- [Observability never crashes the app](../../../../src/modules/system/system.invariants.md)
- [Harness app homes are complete and isolated](../../../../scripts/harness/harness.invariants.md)
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, even when None observed.

## PTY usability — still tracked

Report the `## PTY usability` section.

## Verification

Both arms as above; `bun test` FULL; `bunx tsc --noEmit`; conventions gate;
checker `--all`/`--refs`. NO merge-gate; SKIP_GATE=1.

## End state

A report file in this folder, number-first, opening with `## In plain words`.
