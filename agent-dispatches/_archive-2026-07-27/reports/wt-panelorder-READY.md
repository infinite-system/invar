# Panel ordering second repair round-trip — READY

Branch: `feat-panel-ordering`

Exact committed tip: `482104f0f1466c36f0bb9562ea907f85dd01f36f`

Repair files are intentionally uncommitted:

- `scripts/harness/smoke-settings-applied-harness.ts`
- `scripts/harness/smoke-clipboard-frame-boundary-harness.ts`

`TASK3.md` remains the untracked dispatch brief.

## Repairs

### Settings applied-effect census

- Added `panelContentOrder` to the harness-owned applied-effect census.
- Extended the harness setting value type to admit the persisted string-array setting.
- Added a real PTY drive: open Agent, open Terminal, verify the initial
  `agent,terminal` persisted and rendered orders, press `Alt+Up`, then require both
  `panelContentOrder` and `panelCellIds` to flip to `terminal,agent`.
- The harness now reports `PASS all 36 schema fields have an applied-effect drive`.

### Clipboard frame boundary

The product focus path was correct. The preserved failure frame and a solo reproduction both showed
the command in the focused terminal, but the restored agent-left/terminal-right split made the typed
`printf IDLE-TERMINAL` wrap as `IDLE-TERMI` / `NAL`.

- The smoke now discovers the terminal cell from `panelCellIds`, `panelCellColumns`, and the published
  bottom-panel slot rather than retaining an order-specific screen coordinate.
- It executes the staged `printf` so `IDLE-TERMINAL` is emitted at terminal column zero before
  selection.
- Both terminal deselection/cleanup clicks reuse the discovered terminal body point.
- No product focus-routing code changed.

## Standalone instruments

| Instrument | Result |
|---|---|
| `/home/parallels/.bun/bin/bun x tsc --noEmit` | PASS |
| `/home/parallels/.bun/bin/bun test` | PASS — 1,280 tests, 0 failures, 15,411 assertions |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 630 annotations and 39 lattice links resolved, 0 problems |
| `/home/parallels/.bun/bin/bun scripts/check-file-grammar.ts` | PASS — 369 TypeScript files, 0 violations, 23 converted modules enforced |
| `bash scripts/conventions-gate.sh` | PASS |
| `bash scripts/smoke-settings-applied.sh --meta` | PASS — every schema field has an applied-effect drive |
| `git diff --check` | PASS |

All implicated recorded invariants are upheld: the settings repair strengthens the single persisted
panel-order and split-order evidence, while the clipboard repair preserves the real-PTY,
emulator-oracle, semantic-wait, focused-cell routing, and frame-boundary clipboard contracts.

## Former gate reds rerun solo

| Harness | Result |
|---|---|
| `smoke-settings-applied-harness.ts` | ALL-PASS, solo 1/1 — real reorder drive passes and all 36/36 settings are covered |
| `smoke-clipboard-frame-boundary-harness.ts` | ALL-PASS, solo 1/1 — terminal, transcript, and composer copy pass 5/5 in every active/idle phase |

## Affected panel, agent, and terminal smokes

All ran sequentially with no concurrent app harnesses:

- `smoke-panel-split-harness.ts` — ALL-PASS, including keyboard/drag reorder and restart persistence
- `smoke-layout-harness.ts` — ALL-PASS
- `smoke-paste-harness.ts` — ALL-PASS
- `smoke-terminal-harness.ts` — ALL-PASS
- `smoke-terminal-stage-harness.ts` — ALL-PASS
- `smoke-terminal-follow-harness.ts` — ALL-PASS
- `smoke-agent-harness.ts` — ALL-PASS
- `smoke-agent-pane-ux-harness.ts` — ALL-PASS
- `smoke-agent-cancel-harness.ts` — ALL-PASS
- `smoke-agent-engine-switch-harness.ts` — ALL-PASS
- `smoke-agent-permissions-harness.ts` — ALL-PASS
- `smoke-agent-search-harness.ts` — ALL-PASS
- `smoke-audio-narration-harness.ts` — ALL-PASS

The first `agent-cancel` diagnostic invocation used an absolute Bun path without exporting Bun into
the child `PATH`; its generated `#!/usr/bin/env bun` mock could not start and both mock logs remained
empty. The standard repository environment (`PATH=/home/parallels/.bun/bin:$PATH`) passed the harness
in 2.8 seconds. This was runner setup, not a product or harness timeout.

No merge gate, push, merge, commit, branch deletion, or tag operation was performed.

Conventions loaded from blob `c997d269147658d175aa8b0506d266302c333a61`.
