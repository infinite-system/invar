# READY — #263 (terminal shrink leaves the Markdown split frozen)

State: READY

Branch: `fleet/263-terminal-shrink-markdown-split-frozen`

Commit: `fc9cf49aee5a1fa7e6e73b798ff9cae07ba3a4cb`

Worktree: clean

Compaction: one automatic context compaction before round two

Conventions: [project.conventions.md](../../../../project.conventions.md) at `2e6c207555c2aeecd49d460e5d8ca3ed8ba030af`

## Result

Terminal shrink now reflows the Markdown split from 120 by 40 to 60 by 25. Published width and
height match the accepted renderer viewport. The preview pane, divider, and source pane stay inside
the 60-column grid at 10 and 100,000 lines.

The accepted round-one diagnosis was incomplete. Round two disproved the proposed stdout resize
bridge as a controlling fix. I removed the bridge registration twice. The full Markdown smoke stayed
green both times, including an immediate no-input resize. I did not keep a redundant bridge.

The actual frozen-frame generator was `RootView.synchronizeLayoutGeometry`. It preferred any
positive `layoutCanvas.width` and `layoutCanvas.height` over the renderer dimensions. During resize,
those Yoga values still described the previous frame. The layout therefore accepted a new renderer
viewport but resolved all slots from the old 120-column canvas.

The stale published width had a separate, smaller cause. `App.attach` published dimensions at boot,
but the resize handler did not publish them again. That made the round-one status probe report 120
after the renderer had accepted 60.

## Implementation

- `src/modules/ui/RootView.ts` now resolves layout from the renderer's current width and height.
  Workspace-tab chrome is still removed from that live viewport before `LayoutModel.resolve`.
- `src/modules/app/Bootstrap.ts` publishes renderer width and height in the resize handler before it
  renders the new layout.
- `src/modules/terminal/OpenPty.ts` checks the `TIOCSWINSZ` return value. It throws with the errno and
  requested geometry when the ioctl fails.
- `src/modules/terminal/OpenPty.test.ts` proves that a broken resize reports
  `OpenPty TIOCSWINSZ failed with errno 9 for 60x25`.
- [src/modules/terminal/terminal.invariants.md](../../../../src/modules/terminal/terminal.invariants.md) now owns the runtime boundary as
  **A controlling PTY resize reaches the renderer**.

No `node_modules` file changed. No harness-only resize signal was added.

Possible upstream hardening remains separate: OpenTUI can test Bun's process-level `SIGWINCH`
dimension ordering and use a fresh stream dimension source when needed. The Invar app smoke did not
need that change, so it is not the fix for this defect.

## Restored contract

`scripts/harness/smoke-markdown-harness.ts` now drives two generated Markdown fixtures:

- 10 lines
- 100,000 lines

Each arm uses the real PTY and the unmodified app entry point. It first proves that an immediate
no-input resize publishes 60 by 25, restores 120 by 40, opens the Markdown preview, conceals the
auto-revealed right dock, and then performs the required 120 by 40 to 60 by 25 shrink.

The final condition requires all of these facts:

- Published width is 60 and published height is 25.
- The terminal emulator grid is 60 by 25.
- The rendered preview heading remains visible.
- Preview right edge, divider, source left edge, and source right edge are all inside column 60.

The large fixture is generated at run time. No large file is committed.

## Positive controls

The proposed bridge control did not go red:

```text
bridge registration removed
10-line arm: PASS
100000-line arm: PASS
smoke-markdown-harness: ALL-PASS
```

That result refuted the bridge as the generator.

The layout control did go red. I restored the old preference for a positive Yoga canvas size and
ran the same smoke. Published dimensions reached 60 by 25, but the grid condition failed:

```text
Timed out waiting for grid condition:
10-line Markdown split fits the 60-column viewport
```

The final frame showed `╭─Preview` continuing beyond the 60-column edge. I then removed the planted
defect. The same smoke passed at both scales.

The ioctl assertion also has a real failure source. Its test closes the owned master descriptor,
calls `resize(60, 25)`, and observes errno 9 in the thrown message.

## Dock-growth decision

I re-drove the #238 (structure dock defaults right with Markdown outline) dock-conceal path after the
terminal fix. Removing its preview remount still failed. The pane borders widened, but the preview
table kept its narrow body viewport and clipped `alpha` to `alph`.

This is not the terminal-shrink generator. I left the remount workaround in place and filed
#272 (Markdown preview body viewport stays stale after parent growth). Its task records the suspected
one-pass-late body layout and the required real-PTY positive control.

## Verification

- Invariant checker: 1,066 annotations, 217 lattice links, zero problems.
- `bun test`: 1,855 passed, zero failed, 68,300 expectations across 288 files.
- `bun scripts/harness/smoke-markdown-harness.ts`: `ALL-PASS`.
- `bun scripts/harness/smoke-layout-harness.ts`: `ALL-PASS`.
- `bun run typecheck`: passed.
- `git diff --check`: passed.
- Mandatory pre-commit merge gate: `ALL-PASS`.
- Parallel PTY pool: 61 jobs passed.
- Gate retry tally: no step passed only on retry.
- Commit: `fc9cf49aee5a1fa7e6e73b798ff9cae07ba3a4cb`.
- Worktree: clean.

## Bycatch

- FILED: #272 (Markdown preview body viewport stays stale after parent growth). Concealing the right
  dock widens the pane borders, but the preview body still paints at its previous width. The defect
  reproduced again after the terminal-shrink fix.
- STANDING GAP: #136 (shared scale fixture corpus cache) already tracks the lack of a reusable shared
  scale-fixture generator. This smoke needed language-valid Markdown at 10 and 100,000 lines, so it
  generated those bounded fixtures locally instead of committing large files.
- EXISTING TASK DRIFT: the task tracker still reports state mismatches for
  #114 (modularity umbrella provider runtime), #122 (editor becomes final contributor), and
  #223 (database plugin proves provider seam). This task did not alter those records.
