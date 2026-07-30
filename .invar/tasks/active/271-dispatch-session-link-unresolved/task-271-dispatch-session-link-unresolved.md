# 271 — dispatch's session link resolves UNRESOLVED for every builder

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: fleet-hygiene

## Outline

Four consecutive landings (#268, #238 claude; #264 codex; and earlier
tonight) ended with `land: WARNING — session archive failed` because
`tmp/transcripts/session-link-<name>.txt` reads
"UNRESOLVED — no engine session file appeared after launch". Each time the
session file DID exist and the conductor repaired by timestamp/content:

- claude: `~/.claude/projects/-...-invar-worktrees-<name>/<uuid>.jsonl`
  (per-worktree project dir; appears within seconds of launch)
- codex: `~/.codex/sessions/YYYY/MM/DD/rollout-<stamp>-<uuid>.jsonl`
  (lazy — appears at first turn, i.e. AFTER dispatch's resolution window)

Fix dispatch.sh's resolution: either (a) wait-with-condition for the file
(bounded, a wait must be a condition — the marker is the file existing
with the worktree path / task marker inside), or better (b) defer
resolution entirely: write the DETERMINISTIC search recipe into the link
file (engine, launch timestamp, worktree path, content marker) and let
archive-session.sh resolve at ARCHIVE time, when the file must exist.
Candidate (b) removes the race by moving the read to where the data is
settled — likely the invariant fix.

Both polarities: a landing with a live session archives green; a landing
whose session file genuinely never appeared must still FAIL LOUDLY (no
silent empty archive). Positive control for each engine.

## Invariants in scope

- `scripts/fleet/dispatch.sh` (resolution seam), `archive-session.sh`
  (consumer); the a-wait-must-be-a-condition rule.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- Landing logs of #268/#238/#264 (2026-07-29 06:5x–08:1x); repaired links
  in tmp/transcripts/.
