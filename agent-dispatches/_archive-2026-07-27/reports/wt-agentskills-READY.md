# READY — Agent skills and slash-command resolution

## Tip

- Branch: `fix-agent-skill-awareness`
- Tip: `70a438b94e4285e7ad9575bf68309ec31a8b4207`
- Commit: `fix(agent): load workspace instructions and resolve slash turns`
- Rebased base / `origin/main`: `d8a642e46e6c57161d06cc4af73ebb3ea7e54e5b`
- `merge-base HEAD origin/main` matches that base.
- Worktree: clean (`git status --porcelain` returned no entries).
- The untracked task brief was parked recoverably at `/tmp/wt-agentskills-TASK.md`
  to satisfy the clean-tree requirement.

## Delivered behavior

- `SdkStreamBackend` now passes the exact SDK option
  `settingSources: ['user', 'project']`.
- The installed `@anthropic-ai/claude-agent-sdk` declarations accept
  `settingSources?: SettingSource[]`, where `SettingSource` is
  `'user' | 'project' | 'local'`. The currently installed declaration also
  documents that omission loads all sources; explicitly selecting user and
  project sources pins the intended Invar behavior and excludes local settings.
- `AgentPromptResolver` resolves a leading `/<name>` through the existing
  `Files` seam, confined first to the workspace and then to the selected
  instruction root:
  1. `.claude/skills/<name>/SKILL.md`
  2. `.claude/commands/<name>.md`
- A hit strips optional YAML frontmatter, sends the instruction body, and
  appends the user's arguments. A miss reaches the backend byte-for-byte
  unchanged. Path escapes are refused.
- Resolution happens in `AgentSession` before its single backend-send seam, so
  it applies to SDK, CLI, and Codex backends without pretending that Codex has
  native Claude-skill support.
- The agent invariant now states the provider distinction: Codex natively reads
  `AGENTS.md`; Claude project skills may still be expanded into ordinary prompt
  text for a Codex turn.
- `BoundedListPopup` was not changed.

## Files

- `src/modules/agent/AgentPromptResolver.ts`
- `src/modules/agent/AgentPromptResolver.test.ts`
- `src/modules/agent/AgentSession.ts`
- `src/modules/agent/AgentSession.test.ts`
- `src/modules/agent/AgentFactory.ts`
- `src/modules/agent/SdkStreamBackend.ts`
- `src/modules/agent/agent.invariants.md`
- `scripts/harness/smoke-agent-cancel-harness.ts`

The mandatory pre-commit hook applied the repository's single-quote Prettier
policy to all staged TypeScript files, so touched legacy files include
mechanical quote normalization.

## Native and live-agent evidence

- Installed CLI: Claude Code `2.1.220`.
- Native CLI slash resolution: **yes**. A live
  `claude -p "/ivue Reply with exactly NATIVEIVUE."` turn exited `0` and
  returned `NATIVEIVUE`.
- Live SDK project-awareness turn: **yes**. With the updated
  `SdkStreamBackend`, a real turn in this repository asked for the named
  structural parse-don't-grep project skill without allowing file/tool reads;
  it completed and answered `ast-query`.

## Verification

| Instrument | Result | Exit |
| --- | --- | ---: |
| `bunx tsc --noEmit` | no diagnostics | 0 |
| Targeted agent tests | 33 pass, 0 fail, 95 assertions | 0 |
| `bun test` | 1323 pass, 0 fail, 15573 assertions, 202 files | 0 |
| Invariants `--all` | all contracts pass | 0 |
| Invariants `--all --refs` | 668 annotations, 41 lattice links, 0 problems | 0 |
| `bun scripts/check-file-grammar.ts` | 383 files, 0 violations | 0 |
| `bash scripts/conventions-gate.sh` | PASS | 0 |
| Quiet-machine agent-cancel PTY harness | `RESULT: ALL-PASS` | 0 |
| PTY slash payload assertion | exact `hang-SKILLBODYANCHOR\n\nARGUMENTANCHOR` | 0 |
| Live native CLI `/ivue` turn | exact `NATIVEIVUE` | 0 |
| Live SDK project-skill turn | exact `ast-query` | 0 |
| `git diff --check origin/main...HEAD` | clean | 0 |
| Final `git status --porcelain` | empty | 0 |

