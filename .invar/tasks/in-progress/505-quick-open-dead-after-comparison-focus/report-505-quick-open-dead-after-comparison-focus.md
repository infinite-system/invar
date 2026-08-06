# READY report — global chords survive read-only focus

## In plain words

A focused comparison treated Ctrl+P like plain `p` and moved to another change. I made read-only surfaces return global chords to the app. Quick Open now opens there, while terminal and agent panes still keep Ctrl+P.

## Result

Commit `d119e44d` (`Keep global chords live on read-only surfaces`) completes [#505 (Quick Open dead after comparison focus)](brief-505-1-quick-open-dead-after-comparison-focus.md).

The change adds one routing fact to [PaneContent](../../../../src/modules/ui/PaneContent.interface.ts): `ownsRawKeyInput`. Only [TerminalPaneContent](../../../../src/modules/terminal/TerminalPaneContent.ts) and [AgentPaneContent](../../../../src/modules/agent/AgentPaneContent.ts) declare it.

[Bootstrap](../../../../src/modules/app/Bootstrap.ts) now uses that fact at both shared surface families:

- A contributed editor surface receives editor-scoped actions, but global actions run first.
- A hosted pane receives global actions only when it does not own raw key input.
- A pane without a keybinding context follows the same rule.
- Reserved and `applicationGlobal` actions keep their earlier precedence.

No router branch names comparison, Markdown, image, media, terminal, or agent kinds.

## Reproduction and cause

I opened an untracked-file comparison through the real PTY. I then moved focus to the editor column and sent Ctrl+P.

Before the change, the settled state was:

- `workspaceSet.active.focus = "editor"`
- `contributors.git.activeWorkspace.showingComparison = true`
- `quickOpen.open = false`

[GitComparisonContent](../../../../src/modules/git/GitComparisonContent.ts) handles plain `p` as previous-change navigation. The old router called that handler before it resolved the global Ctrl+P binding. The handler saw the name `p`, consumed the chord, and prevented Quick Open.

After the change, the same drive reached `quickOpen.open = true`. The comparison stayed open beneath the overlay.

## Driven boundary sweep

The final PTY pass drove these focus owners:

- Comparison: Ctrl+P opened Quick Open and kept the comparison open.
- Markdown preview: Ctrl+P opened Quick Open and Escape returned to preview focus.
- PNG image viewer: Ctrl+P opened Quick Open and Escape returned to the image.
- Media pane: Ctrl+P opened Quick Open and Escape returned to `media-demo`.
- Files: Ctrl+Shift+O opened the workspace-path folder picker.
- Editor: the existing Quick Open path stayed green.
- Terminal: Ctrl+P kept Quick Open closed and reached the child as byte `10` hexadecimal.
- Agent: Ctrl+P kept Quick Open closed.
- Terminal and agent: Ctrl+Shift+X still opened Extensions through the `applicationGlobal` route.

The routing census found raw-input ownership at exactly two sites: terminal and agent. Files, Git, Structure, Monitoring, Tasks, Database, Media, and context-free notice panes omit it.

## Adversarial and scale evidence

The drives covered open, close, return, and retained-focus order changes. They also covered read-only and raw-input sides of the boundary.

The Markdown preview contract passed with 10 and 100,000 lines. The media contract passed at small and large geometry. The behavioral contracts also passed editor and diff scale arms at 2,000 and 100,000 lines.

The final screen and graph agreed after every new chord step. The final diagnostic log showed no new warning from these drives.

## Positive controls

I planted three failures, one at each changed boundary:

1. I restored contributed-surface-first routing. [The git-watch smoke](../../../../scripts/harness/smoke-git-watch-harness.ts) failed with exit code 1. `quickOpen.open` stayed `false` for 15,000 milliseconds.
2. I marked Media as a raw-input owner. [The media smoke](../../../../scripts/harness/smoke-media-harness.ts) failed at `Ctrl+P opens Quick Open while the media pane owns focus`.
3. I removed terminal raw-input ownership. [The reserved-chord smoke](../../../../scripts/harness/smoke-reserved-chord-harness.ts) failed at `the terminal consumes Ctrl+P without opening Quick Open`.

I removed each plant. The same checks then passed.

## Smoke changes

- [The git-watch smoke](../../../../scripts/harness/smoke-git-watch-harness.ts) now locks the original comparison-focused Ctrl+P failure.
- [The Markdown mode smoke](../../../../scripts/harness/smoke-markdown-view-mode-harness.ts) locks preview focus at both document scales.
- [The image preview smoke](../../../../scripts/harness/smoke-image-preview-harness.ts) locks image-viewer routing.
- [The media smoke](../../../../scripts/harness/smoke-media-harness.ts) locks hosted read-only pane routing.
- [The reserved-chord smoke](../../../../scripts/harness/smoke-reserved-chord-harness.ts) locks Files, terminal, and agent ownership.

## Verification

- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,401 annotations, 287 lattice links, 0 problems.
- `bunx tsc --noEmit`: passed.
- Focused unit pass: 120 passed, 0 failed, 451 expectations.
- `bun run build`: passed and produced `dist/iv`.
- `bash scripts/conventions-gate.sh`: passed.
- Five changed PTY smoke families: passed.
- `bash scripts/smoke-keyboard-invariant.sh`: passed the complete byte table.
- `bash scripts/behavioral-contracts.sh`: passed once with `ALL-PASS`.
- `git show --check d119e44d`: passed.

The behavioral pass reported one non-blocking diff cadence canary at 32.6 frames per second. Its floor is 28.

## Invariants in scope

### Focus owns the keystroke

Verdict: **refines and upheld**.

The current record treats every focused surface like a child-backed input surface. This task shows a smaller generator. Focus owns raw input only where a child or composer can consume it.

Proposed refinement for [the keybindings record](../../../../src/modules/keybindings/keybindings.invariants.md):

> A focused surface owns its scoped bindings. It also owns unmatched global chords only when it declares raw key input. Otherwise, effective global bindings return to the host.

The reserved and `applicationGlobal` exceptions remain unchanged. I did not edit the record because the brief asks for a proposal.

### A focused panel routes keystrokes to its active pane content

Verdict: **refines and upheld**.

Proposed refinement for [the UI record](../../../../src/modules/ui/ui.invariants.md): raw-input panes receive unmatched global chords. Read-only panes return effective global actions to the host before `handleKey`.

### A focused pane consumes only its own scoped bindings

Verdict: **strengthened**.

The host still dispatches pane-scoped actions only when the resolution names that pane context. The new raw-input fact now decides the global branch without pane-kind tests.

### Bindings are intent addressed

Verdict: **upheld**.

The binding table and action identifiers did not change. The router uses resolution context and one surface capability.

## Sighting sweep

The Ctrl+Shift+O sighting from [#498 (global chords blocked by a focused panel)](../../completed/498-global-chords-blocked-by-focused-panel/report-498-global-chords-blocked-by-focused-panel.md) is refuted.

I focused Files and sent Ctrl+Shift+O through the PTY. Quick Open opened with `quickOpenMode = "workspacePath"`. The new smoke locks that result.

## Bycatch

None observed.

## Instrument feedback

EASY. DriveSession exposed comparison state, workspace focus, overlay state, and pane kind. The warm server made the focus distinction visible without a second probe.

## Worktree

The worktree contains the dispatch-injected [AGENTS.md](../../../../AGENTS.md) change and untracked [builder fundamentals](../../../worktrees/505-quick-open-dead-after-comparison-focus/BUILDER-FUNDAMENTALS.md). I did not commit either file.

I did not run `scripts/merge-gate.sh`, push, merge, tag, or remove the branch.
