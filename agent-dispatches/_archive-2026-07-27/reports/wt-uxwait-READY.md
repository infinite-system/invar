# READY — agent-pane UX visual-condition waits

## Result

Committed the visual assertion waiting sweep as:

- Commit: `de85916e46122d6f05779c7ac20eb175a3c83cba`
- Subject: `fix(harness): wait for asserted visual outcomes`
- Branch: `fix-agent-pane-ux-expand-wait`

No merge-gate run was started. `pgrep -af '[m]erge-gate'` was empty before the repeated harness runs.

## Converted assertions

| Port | Converted visual outcomes |
| --- | --- |
| `agent-pane-ux` | Collapsed tool contents, expanded pretty-printed input, wrapped reply after collapse, newest tail plus scrollbar, and PageUp revealing the earliest turn now wait on named grid conditions before assertion. The expansion assertion now checks the rendered pretty-printed content; expanded semantic state remains a separate assertion. |
| `agent-engine-switch` | Claude/Codex chrome, retained producer labels, ported-context label, fresh-provider identity, and first Codex label. |
| `agent-permissions` | Pending-tool absence behind the prompt and denied-result absence were added to the visual conditions that anchor the negative assertions. |
| `agent-search` | The themed search icon and engine mode line. |
| `editor` | Dirty-dot paint/clear, restored fixture content, drag-selection paint before silence, editor/tree click targets, long-line target, and source-row availability. |
| `gutter-diff` | Clean tracked content plus absence of a diff marker. |
| `hover` | Pre-dwell card absence and post-copy card persistence. |
| `mode-coherence` | Buffer-count badge behind the command palette. |
| `panel-split` | Terminal split-width output plus preservation of blurred agent text. |
| `pixel-preview` | Blank underlying emulator cells for kitty and sixel projections. |
| `scrollbars` | Clipped tree filename tail at the leftmost horizontal offset. |
| `shortcut-help` | Status-bar question-mark button. |
| `tabs` | Overflowed tab chrome/breadcrumb and both count-badge samples. |
| `terminal` | Status-bar clock and application-screen absence after quit. |
| `tree-scroll` | Clicked file content after semantic active-buffer publication. |

The repeated editor run exposed one additional ordering race: selection status could publish before
the selection paint, causing the following frame-silence assertion to begin too early. The smoke now
waits on the painted selection background before entering the silence interval.

## Other-port sweep

All 41 ports other than `agent-pane-ux` were inspected for action → immediate visual
`requireCondition` sampling without a condition wait on the asserted grid content.

| Finding | Ports |
| --- | --- |
| Fixed | `agent-engine-switch`, `agent-permissions`, `agent-search`, `editor`, `gutter-diff`, `hover`, `mode-coherence`, `panel-split`, `pixel-preview`, `scrollbars`, `shortcut-help`, `tabs`, `terminal`, `tree-scroll` |
| No residue found | `activitybar`, `agent`, `audio-narration`, `bracket-match`, `comment-styling`, `diagnostics`, `diff-overview`, `find`, `git-blame`, `git-log`, `git-watch`, `goto-definition`, `image-preview`, `indent-guides`, `markdown`, `move-line`, `navigation-history`, `openproject`, `paste`, `quickopen`, `search-mouse`, `selection`, `settings-applied`, `voice-picker`, `word-delete`, `workspace-tabs`, `wrap` |

`harness.invariants.md` now states that a visual assertion after an action is preceded by a named
grid condition on the asserted content, and that synchronized-output quiescence alone is insufficient
when the action can span frames.

## Repeated harness runs

### Target port

| Port | Required | Result | Per-run duration |
| --- | ---: | ---: | --- |
| `agent-pane-ux` | 10 consecutive solo | 10/10 PASS | 11–12 seconds |

### Other modified ports

| Port | Required | Result | Per-run duration |
| --- | ---: | ---: | --- |
| `agent-engine-switch` | 5 consecutive | 5/5 PASS | 5 seconds |
| `agent-permissions` | 5 consecutive | 5/5 PASS | 5–6 seconds |
| `agent-search` | 5 consecutive | 5/5 PASS | 5 seconds |
| `editor` | fresh 5 consecutive after the selection-paint fix | 5/5 PASS | 10–11 seconds |
| `gutter-diff` | 5 consecutive | 5/5 PASS | 0–1 seconds |
| `hover` | 5 consecutive | 5/5 PASS | 1 second |
| `mode-coherence` | 5 consecutive | 5/5 PASS | 4–5 seconds |
| `panel-split` | 5 consecutive | 5/5 PASS | 0–1 seconds |
| `pixel-preview` | 5 consecutive | 5/5 PASS | 2–3 seconds |
| `scrollbars` | 5 consecutive | 5/5 PASS | 2–3 seconds |
| `shortcut-help` | 5 consecutive | 5/5 PASS | 0–1 seconds |
| `tabs` | 5 consecutive | 5/5 PASS | 0–1 seconds |
| `terminal` | 5 consecutive | 5/5 PASS | 5–6 seconds |
| `tree-scroll` | 5 consecutive | 5/5 PASS | 0–1 seconds |

## Full verification

| Check | Result |
| --- | --- |
| `$HOME/.bun/bin/bunx tsc --noEmit` | PASS |
| `$HOME/.bun/bin/bun test` | PASS — 1005 tests, 0 failures, 14,430 expectations across 111 files |
| `$HOME/.bun/bin/bun .claude/skills/invariants/scripts/check_invariants.mjs --all` | PASS |
| `$HOME/.bun/bin/bun .claude/skills/invariants/scripts/check_invariants.mjs --refs` | PASS — 535 annotations and 39 lattice links resolved, 0 problems |
| `bash scripts/conventions-gate.sh` | PASS |
| `git diff --check` | PASS |

The worktree has no uncommitted tracked changes. `TASK.md` remains the original untracked task file.
