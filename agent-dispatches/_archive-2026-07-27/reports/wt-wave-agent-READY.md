# Agent FILE GRAMMAR conversion — READY

Branch: `grammar-wave-agent`

Tip: `7b212616732427fa61d3ee996061744ee3dc765a`

Final base: `origin/main` at `cbc9f1c` (final rebase reported the branch up to date).

## Files converted

Implementation files converted to FILE GRAMMAR:

- `src/modules/agent/AgentComposer.ts`
- `src/modules/agent/AgentFactory.ts`
- `src/modules/agent/AgentPaneContent.ts`
- `src/modules/agent/AgentPaneRenderer.ts`
- `src/modules/agent/AgentPermissions.ts`
- `src/modules/agent/AgentProviderRegistry.ts`
- `src/modules/agent/AgentSpinner.ts`
- `src/modules/agent/AgentSpinnerFrames.ts`
- `src/modules/agent/AgentThinkingIndicator.ts`
- `src/modules/agent/AgentToolSummary.ts`
- `src/modules/agent/AgentTranscriptProjection.ts`
- `src/modules/agent/AgentTranscriptSearch.ts`
- `src/modules/agent/ClaudeStreamMapping.ts`
- `src/modules/agent/CliStreamBackend.ts`
- `src/modules/agent/CodexAppServerBackend.ts`
- `src/modules/agent/CodexAppServerMapping.ts`
- `src/modules/agent/CodexStreamBackend.ts`
- `src/modules/agent/CodexStreamMapping.ts`
- `src/modules/agent/EchoAgentBackend.ts`
- `src/modules/agent/MockAgentBackend.ts`
- `src/modules/agent/SdkStreamBackend.ts`
- `src/modules/agent/TranscriptContextSerializer.ts`

Supporting changes:

- Added colocated strict-mode tests for factory, renderer, spinner frames, and stream backends.
- Moved `AgentPermissions.test.ts` from `__tests__/` to the module root.
- Updated `src/modules/app/Bootstrap.ts` to consume the live `AgentPaneContent.Class` seam.
- Added `agent` to `CONVERTED_MODULES` in `scripts/check-file-grammar.ts`.
- Appended all four post-rebase grammar-only commits to `.git-blame-ignore-revs`.
- Left `AgentBackend.interface.ts` and `AgentEvents.interface.ts` interface-first and unchanged.

## Notable decisions

- Detached helpers and module constants became class methods/getters; expensive immutable derived values use cached `$` getters.
- Converted private members to the required protected floor while preserving public APIs.
- Preserved overridable static dispatch through `this` and late-read cross-module seams.
- Kept `SdkStreamBackend.gateToolCall` as a prototype method and used a thin callback closure at the SDK boundary to preserve receiver capture.
- Kept the pane transcript target identifier behind the live `AgentPaneContent.Class` seam.
- No behavior changes were introduced; no merge gate was run.

## Commits

| Commit | Purpose |
| --- | --- |
| `fcc678a172e2cf3355d43ce0760f0a50324c0573` | Mapping/projection grammar conversion |
| `b1bc65a09d121e1962ebd30e5a83085bd5954b5f` | Pane/composer grammar conversion |
| `79f535e4d37189e62a50121ac4ea7f14f4ba8269` | Backend grammar conversion |
| `7e2d71f6d47683432ce1958939a440fc6d4c4f90` | Agent enforcement and final module cleanup |
| `7b212616732427fa61d3ee996061744ee3dc765a` | Blame-ignore bookkeeping |

Each of the four grammar-only hashes passed `git cat-file -e <hash>^{commit}` and `git merge-base --is-ancestor <hash> HEAD` at the final tip.

## Verification

### Static and unit instruments

| Instrument | Result |
| --- | --- |
| `bun scripts/check-file-grammar.ts` | PASS — 324 TypeScript files; `agent` enforced with zero violations; 10 converted modules enforced |
| Agent structural private-member query | PASS — 0 private members |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 609 annotations, 39 lattice links, 0 problems |
| `bunx tsc --noEmit` | PASS — exit 0 |
| `bun test` | PASS — 1,225 passed, 0 failed, 15,463 assertions across 152 files |
| `git diff --check origin/main..HEAD` | PASS |

### Driven user-path instruments

Before every driven run, the machine-quiet check reported `merge_gate=0`, `driven_smoke=0`, and `sibling_verification=0`. Each harness ran sequentially and solo 1/1.

| Harness | Result | Duration |
| --- | --- | ---: |
| `smoke-terminal-follow-harness.ts` | ALL-PASS | 4.0 s |
| `smoke-agent-pane-ux-harness.ts` | ALL-PASS | 11.9 s |
| `smoke-agent-harness.ts` | ALL-PASS | 4.7 s |
| `smoke-audio-narration-harness.ts` | ALL-PASS | 5.0 s |
| `smoke-paste-harness.ts` | ALL-PASS | 1.9 s |

Working tree after completion contains only the supplied untracked `TASK.md`; it was not modified or committed.
