# Panel primitives UX pack — READY

Branch: `feat-panel-ux`

Exact tip: `31bfcc12cb303f2f39366fb94c847e29310a9fde`

Rebased onto: `origin/main` at `249b5abe6c9c4ce3e943ce42a388b79d7fe8d1c1`

Commit: `31bfcc1 feat(ui): separate panel content regions`

## Design decisions

- The shared `PanelHost` remains the one pane-layout and splitter seam. Each resolved content cell now
  owns a generic heading-and-body region; the outer panel border has no terminal/agent title.
- Terminal and Agent status controls are pane-presence controls. Opening the second item produces the
  canonical `terminal | agent` side-by-side layout, focuses the new region, and closing either item
  leaves the other region intact.
- F9 accelerates that same visible action: it adds the missing companion pane or collapses a split to
  the focused pane. Matching terminal, agent, and split actions are also in the command palette.
- `panelActiveContent` reports the focused visible pane under a split, preserving compatibility for
  status-driven harnesses and consumers.
- The initial bottom-panel height is 45 percent of available layout rows through the protected
  `LayoutModel.defaultBottomPanelProportion` seam. It is evaluated only at construction and does not
  overwrite a later user drag. Driven expectations are 9 panel rows in a 24-row terminal and 21 panel
  rows in a 50-row terminal.
- Status controls retain their actions and end in `clock → right dock`, with the right-dock control
  occupying the outermost three columns. Both controls are real pointer targets; the clock click is an
  intentional no-op.

## Files

- Panel model and projection: `src/modules/ui/PanelHost.ts`,
  `src/modules/ui/RootView.ts`, `src/modules/ui/StatusBar.ts`,
  `src/modules/ui/PaneContent.ts`
- Application and compatibility wiring: `src/modules/app/Bootstrap.ts`,
  `src/modules/app/AppStatusProjection.ts`,
  `src/modules/commands/CommandDefaults.ts`
- Proportional default: `src/modules/layout/LayoutModel.ts`
- Unit coverage: `src/modules/ui/PanelHost.test.ts`,
  `src/modules/layout/LayoutModel.test.ts`
- Contracts: `src/modules/ui/ui.invariants.md`,
  `src/modules/layout/layout.invariants.md`,
  `src/modules/terminal/terminal.invariants.md`,
  `src/modules/agent/agent.invariants.md` and matching terminal annotations
- Driven coverage: panel split, layout, agent, terminal, terminal-stage, agent-pane UX,
  agent-engine switch, and paste harnesses under `scripts/harness/`

No converted file-grammar module (`diff`, `editor`, `git`, `lsp`, `markdown`, or `syntax`) was
modified. `TASK.md` remains the original untracked dispatch brief.

## Verification

| Instrument | Result |
|---|---|
| `/home/parallels/.bun/bin/bun x tsc --noEmit` | PASS |
| `/home/parallels/.bun/bin/bun test` | PASS — 1,108 tests, 0 failures after rebase |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 0 problems |
| `/home/parallels/.bun/bin/bun scripts/check-file-grammar.ts` | PASS — six converted modules enforced; report-only legacy debt unchanged |
| `bash scripts/conventions-gate.sh` | PASS after rebase |
| `smoke-panel-split-harness.ts` | ALL-PASS — mouse open, separate headings, focused key routing, divider, F9 parity, close/reopen |
| `smoke-layout-harness.ts` | ALL-PASS — exact 24/50-row defaults, slot/splitter geometry, clock and outermost dock clicks/order |
| `smoke-agent-harness.ts` | ALL-PASS — mouse and keyboard open paths |
| `smoke-terminal-harness.ts` | ALL-PASS |
| `smoke-terminal-stage-harness.ts` | ALL-PASS — pane-ID/geometry-aware split compatibility |
| `smoke-agent-pane-ux-harness.ts` | ALL-PASS — own heading plus complete agent UX path |
| `smoke-agent-engine-switch-harness.ts` | ALL-PASS |
| `smoke-agent-permissions-harness.ts` | ALL-PASS |
| `smoke-agent-search-harness.ts` | ALL-PASS |
| `smoke-audio-narration-harness.ts` | ALL-PASS |
| `smoke-paste-harness.ts` | ALL-PASS — terminal/agent split routing and focus compatibility |
| `smoke-clipboard-frame-boundary-harness.ts` | ALL-PASS |

The complete affected-smoke list above was rerun after the rebase. No gate, push, merge, branch
deletion, or tag operation was performed.
