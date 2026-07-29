# READY — scrollbar colours follow the live theme

## Scope

Scrollbar theme derivation is complete at commit
`6c8c89df007c6bb7bde3f2553f23ee321d11bc41`.

The change covers the shared `ScrollbarSync` bars, the scrollbar consumer census, the PTY
dark-to-light-to-dark contract, and the related UI invariant. It preserves the corner and
axis-parity work from [scrollbar corner ownership #290](../../completed/290-scrollbar-corner-vertical-owns-bottom/report-290-scrollbar-corner-vertical-owns-bottom.md).

## Result

[ScrollbarSync.ts](../../../../src/modules/ui/ScrollbarSync.ts) no longer reads
`theme.palette` while it constructs bars. New bars start hidden. `applyBar` reads the live palette
and applies its `panel` and `dim` pair during each visible frame.

[smoke-scrollbars-harness.ts](../../../../scripts/harness/smoke-scrollbars-harness.ts) now checks
the exact pair in both axes. At 500 and 100,000 lines, it proves:

- dark uses `16161e/787c99`;
- light uses `848cb5/d4d6e4`;
- the light frame contains neither dark colour;
- switching back restores the dark pair;
- the returned dark frame contains neither light colour;
- the horizontal endpoint, vertical corner owner, and equal-axis colours stay correct.

[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md#a-scrollbar-track-is-derived-per-frame-from-its-region-rect)
now records live colour derivation as part of the per-frame track rule. Its evidence and
impossibility boundary name the two-scale theme-switch drive.

## Capture-shape census

The census started from [scrollbar drag and thickness #282](../../completed/282-scrollbar-drag-broken-and-horizontal-thickness/report-282-scrollbar-drag-broken-and-horizontal-thickness.md#consumer-enumeration).
AST queries covered `SolidThumbScrollBar`, `trackOptions`, colour members, and synchronization
methods.

| Consumer | Construction shape | Live appearance path | Result |
|---|---|---|---|
| `ScrollbarSync` | Captured `theme.palette.panel/dim` in `trackOptions` | `applyBar` runs for all five bars | Fixed at the shared call |
| `ScrollableTextViewport` | Constructs hidden bars without colours | `updateScrollbars` calls the live `colors()` dependency | No capture |
| `DiffView` | Constructs both bars without palette colours | `synchronizeScrollbars(palette)` applies both colours | No capture |
| `RootView` pooled panel cells | Constructs hidden vertical bars without colours | Panel synchronization applies `palette.panel/dim` | No capture |
| `SolidThumbScrollBar` painter | Keeps the native slider reference | Each paint reads the slider’s current foreground and background | No capture |

The remaining construction options are stable identity or layering data. They include IDs,
orientation, hidden state, and explicit z-index. The live thickness paths also refresh during
synchronization. The sweep found no second reactive appearance snapshot.

## Driven evidence

Before the fix, the existing PTY instrument reproduced this at both scales:

> OBSERVED #284: colours stayed 16161e/787c99 after the live light switch

After the generator change, the same drive stopped printing that observation. The final contract
passed the full dark-to-light-to-dark sequence at 500 and 100,000 lines.

The positive control restored the construction-time `trackOptions` snapshot. The updated contract
went red before any drag:

```text
error: FAIL 500-line light theme switch uses the live panel and dim pair
```

I then removed the planted defect.

## Verification

- `bun test`: PASS, 1,934 tests, 68,673 expectations, 0 failures.
- `bun scripts/harness/smoke-scrollbars-harness.ts`: PASS.
- `bun scripts/harness/smoke-settings-applied-harness.ts`: PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: PASS,
  1,134 annotations, 221 lattice links, 0 problems.
- `git diff --check`: PASS.
- Worktree: clean.

The pre-commit hook also ran the full merge gate before the ignored task-link correction. All
runtime steps passed. The gate remained red because the copied root task link was broken and the
parallel scrollbar smoke needed one clean retry. The standalone final scrollbar smoke passed
without a retry.

## Bycatch

- The injected [root task brief](../../../../.invar/worktrees/284-scrollbar-theme-captured-at-construction/TASK.md)
  used task-folder-relative links from the repository root. The invariant checker reproduced the
  broken contract link twice. I corrected the ignored local copy, and the checker then reported
  0 problems. The injected file is not branch content, so the commit does not include this edit.
- The hook’s parallel smoke pool timed out once in the scrollbar smoke. Its automatic retry passed.
  The standalone final run passed once at both scales. I did not reproduce the timeout outside the
  loaded gate.
