# 114 — the modularity umbrella

State: ACTIVE — Wave A landed, Wave B open
Created: 2026-07-28
Engine: claude
Environment: linux
Model: opus-5
Effort: high
Priority: architecture-hygiene
Assignment note: Umbrella reduction — three plugin kinds and the contribution seam. Wave B.

## Outline

LSP becomes a provider, the terminal becomes a hosted runtime, and agents arrive via tasks + MCP rather
than as a plugin. The umbrella that #122 and #35 are sequenced behind.

### Progress, measured as host references

The done-test is mechanical — count the host files that name a module:

| module | host references |
| --- | ---: |
| `modules/git/` (extracted by #96) | 0 |
| `modules/lsp/` at the cut | 4 |
| `modules/lsp/` after Wave A | **0** ✅ |
| `modules/terminal/` (Wave B) | 4 — untouched |
| `modules/editor/` (#122) | 4 — untouched |

**Wave A (LSP as provider) is closed.** Wave B (terminal as a hosted runtime) and #122 (the editor
capstone) remain.

### Why agents are NOT a plugin

The agent half runs through a terminal profile rather than a bespoke plugin surface: launch
claude/codex — later pi/hermes/any CLI agent — in a PTY terminal pane, `cwd` = the workspace folder,
with context verified present. Codex auto-reads `AGENTS.md`; claude auto-reads `CLAUDE.md` (a redirect
to `AGENTS.md`); IBR arrives via `--append-system-prompt-file .claude/skills/ibr/IBR.md` for the
claude lineage. The context must be VERIFIED present, not assumed — that is the part that fails
silently.

### Pairings to settle rather than build twice

- **#46 (TerminalObserver, reverse presence)** — the editor observing the terminal and an external
  agent driving the editor are the two directions of one channel. Determine whether they share a
  design, and say so either way.
- **#157 (external harnesses over MCP)** — its open questions (transport, discovery, instance identity,
  the tool surface, attribution/consent, lifecycle) are the same seam viewed from outside.

### Sequence

**#114 → #122 → #35.** #35's job is the proof: if adding a new pane requires touching the host, the
capstone is not done.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
