# READY — #157 (external harness control over MCP)

## Result

Design complete and committed on `design-mcp-bridge`.

- Commit: `96358bc docs: design external harness MCP control`
- Deliverable: `project.mcp-control.md`
- Record location: root `project.*` because the design crosses task launch, workspace identity,
  editor commands, consent, terminal observation, and four external harnesses.
- No bridge code was implemented.

## Design outcome

- Transport: loopback-only MCP Streamable HTTP on an OS-assigned port. Stdio is rejected because
  its client-spawns-server ownership is inverted here; Unix sockets are rejected because the four
  harness clients do not share that transport.
- Discovery: per-launch private runtime config/arguments for Claude Code (`--mcp-config`), Codex
  (`-c mcp_servers...`), Pi (`-e` with a pinned `pi-mcp-adapter` and `--mcp-config`), and Hermes
  (`HERMES_HOME` with a structurally merged launch-only `config.yaml`).
- Identity: random application, workspace, and launch identities plus one revocable bearer token
  bound server-side to exactly one task and workspace. There is no global/latest endpoint,
  workspace-path lookup, fixed port, or workspace-local endpoint file.
- Tool surface: a deliberate semantic read/navigation/find/diagnostics vocabulary is proposed;
  atomic revision-checked edit and save are recommended but explicitly left for the user's
  decision. No generic command escape hatch or git/shell duplication is selected.
- Attribution and consent: visible harness/task presence, per-call state, attributed undo, audit
  events, and host-owned mutation consent scoped to the launched task.
- Lifecycle: stale credentials fail closed; Invar restart cannot redirect an old harness to a new
  process; atomic edits complete or do not begin; pending work and consent are cancelled on exit.
- `#46 (TerminalObserver reverse presence)`: shares this transport, identity, auth, lifecycle, and
  presence. Its bounded redacted ring remains a separate read-only generator exposed through MCP
  pull/resource surfaces, with notifications only as an optional accelerator.
- Build plan: six independently gateable waves, with the four-harness launcher adapters delivered
  as one matrix rather than a Claude-first bridge.

## User decision still required

Before the mutation wave, choose one:

1. Recommended: deliberate semantic tools including atomic edit and save.
2. Read/navigation only; harnesses edit through their native filesystem tools.
3. Mirror the editor command registry through a separately designed command manifest.

The design does not choose this on the user's behalf.

## Dependency finding

`#156 (tasks capability)` has not yet produced branch work to inspect:

- `feat-tasks-capability` pointed to `bf57bcf`, identical to `main`.
- `/tmp/conductor-tasks` was clean.
- No `tasks.invariants.md` existed.

The design targets the brief's promised environment/argv contribution point and requires its exact
type/name to be reconciled after #156 lands. It explicitly forbids creating a second launcher.

## Verification

`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`

- Result: `884 annotation(s) resolved, 67 lattice link(s) resolved, 0 problem(s)`
- Exit code: `0`

`bash scripts/conventions-gate.sh`

- Result: `conventions-gate: PASS`
- Exit code: `0`

No code was added, so no code or behavioral test was invented. The app was not driven for this
prose-only design task.

Worktree after commit: clean.

## Bycatch

None observed. This design-only task did not drive the application.
