## In plain words

The Tasks header had pipe characters that looked like buttons but did nothing. The file Open button also started a graphical picker on a machine with no graphical screen, so its click waited forever. I gave every header cell one real action, made headless file opening use the in-app picker, and made both task views read the same current phase.

## READY

Commit `a4c36b4b` (`Make Tasks and file controls tell the truth`) completes [brief 533-1](brief-533-1-tasks-header-pipes-and-dead-open-button.md) and [brief 533-2](brief-533-2-2.md).

## What changed

- [TasksDashboardPaneRenderer.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneRenderer.ts) now paints ` LIVE  ACTIVE  DONE  ▷ ` as four adjacent padded segments. Paint, hover, tooltip, and activation use the same half-open ranges.
- [tasks-status.ts](../../../../scripts/tasks/tasks-status.ts) now derives `exploring` or `building` from the current line delta through `taskPhaseForLineDelta`. The CLI and pane no longer keep separate process-local edit history.
- The pane now paints the shared `strong` task-number segment in bold. It no longer adds a separate gate row. Gate state stays in the shared READY detail.
- [Sidebar.ts](../../../../src/modules/ui/Sidebar.ts) now routes pane tooltips from the same local pointer coordinates used for clicks.
- [NativeFileDialog.ts](../../../../src/modules/system/NativeFileDialog.ts) now requires `DISPLAY` or `WAYLAND_DISPLAY` before it selects `zenity` or `kdialog`. A headless click falls through to the in-app picker.
- The SSH picker fixture now declares a graphical session because its `zenity` stub represents a client-native graphical picker.

## Phase-drift diagnosis

The CLI watch process and the pane process each owned a private `firstEditSeen` set. Each process started at a different time. A task could therefore stay `building` in one view after its current delta returned to zero while the other view said `exploring`.

Both readers now call one pure helper with the current `{ added, removed }` values. At 10:29 on 2026-08-06, the same fleet read showed task 533 as `building`, `+283 -115` in both surfaces. The CLI capture was `     · building  21m  +283 -115 ...`. The pane capture was `     · building round 2 ...` at its narrower visible width.

## Visual parity table

`fg`, `dim`, `warning`, `success`, `error`, `accent`, `round`, and `motion` are the shared projection tones. ANSI values are the codes carried by that same projection.

| Visible element | Pane cells and tones | CLI ANSI output | Result |
| --- | --- | --- | --- |
| Header | ` LIVE ` selected/hover/rest, ` ACTIVE `, ` DONE `, and ` ▷ ` or ` ■ ` each own all padded cells | CLI global header is `INVAR TASKS · <time> · 60fps paint · ledger ticks · Ctrl+C to exit` | Pane-only navigation. Fixed: no literal pipes or dead cells. |
| Scope row | ` Fleet extras describe the main Invar checkout only.` in `dim` | No foreign-workspace mode | Pane-only and only present outside the fleet checkout. |
| Gate row | No standalone row | No standalone row | Fixed, then identical. Gate text comes from the READY detail on both surfaces. |
| Task title | `  ` `fg`; `#533` `strong` plus bold; ` tasks-header-pipes-and-dead-open-button` `fg` | plain prefix; `\e[1m#533`; plain label | Identical shared segments. |
| Building detail | `     ` `dim`; glyph and each `building` letter use explicit `motion` colors; ` round 2` uses `#d7af5f`; duration uses `accent`; delta and identity use `dim` | ANSI `2`; motion `38;5;30..51`; round `38;5;179`; duration `36`; delta and identity `2` | Identical shared segments. Pane clips the shared tail at its inner width. |
| READY detail | leading `dim`; degraded attach `warning`; `◉ READY` and gate result `success` or `error`; running gate uses the gold motion ramp | ANSI `2`, `33`, `32` or `31`, and gate `38;5;172..221` | Identical shared segments. |
| Phase glyphs | Building breath `· • ● •`; exploring compass `↑ ↗ → ↘ ↓ ↙ ← ↖` | Same glyph tables | Identical. |
| Duration | `accent` | ANSI `36` | Identical. |
| Line delta | One `dim` segment such as `  +283 -115` | ANSI `2` | Identical. |
| Attach text | `dim` when live; `warning` when missing | ANSI `38;5;240` when live; `33` when missing | Identical. |
| Hover and selection | Palette hover or selection background covers the complete padded control or complete task group | No pointer or selected-pane state | Pane-only. It follows the shared UI control grammar. |
| Motion | Six-step building and exploring ramps, eight exploring glyphs, and six-step gate ramp; motion stops when unobserved | Same tables and elapsed-time step function | Identical generator and count order. Separate surfaces can sample adjacent frames. |
| Narrow width | Shared rows clip with the pane ellipsis after the last visible segment | CLI clips at terminal width | Same source projection. Each container owns its available width. |
| ASCII fallback | Header and attach actions use theme fallback glyphs | CLI task projection keeps its supported text glyphs | Pane-only controls remain readable. |

The new FrameProbe assertion in [smoke-tasks-dashboard-harness.ts](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts) counts every visible READY segment cell by its declared projection color. It also checks that `#902` has bold cell attributes beside a normal label. A planted wrong warning tone makes the check fail.

## Driven evidence

- Before the fix, the default Tasks header painted `| LIVE | ACTIVE | DONE | ▷`.
- Before the fix, hovering `↥` set `hoveredHeaderAction` but showed no tooltip. Clicking it started `zenity` without `DISPLAY` or `WAYLAND_DISPLAY` and opened no picker.
- After the fix, hovering `↥` painted `Open file`. Clicking it changed `boundedListPopup.open` from `false` to `true`.
- I selected [project.tasks.md](../../../../project.tasks.md), hovered `⊙`, and saw `Reveal open file`. After the click, the selected path was [/home/parallels/dev/invar/project.tasks.md](../../../../project.tasks.md).
- I clicked the first and last cells of all three lens segments in alternating order. Every click changed `tasksLens` to the owning lens. I clicked both outer padding cells of the cycle control and observed `tasksCycling` change `false → true → false`.
- The 10-line and 100,000-line shared scale drives both showed ` LIVE  ACTIVE  DONE  ▷ `. In both drives, Open hover showed its tooltip and Open click opened and closed the in-app picker.
- The Tasks smoke drove zero, one, many, insertion, removal, remove-last, hover sweeps, lens cycling, scrolling, 120×36 narrow geometry, Unicode, ASCII, and 500 tasks. It asserted graph state after each state change.

## Verification

- `bun test ...`: 58 passed, 0 failed, 548 expectations across 7 affected test files.
- `bun run typecheck`: passed.
- `bun run build`: passed. The compiled output contains 455 modules.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,402 annotations and 287 lattice links resolved, with 0 problems.
- `bun run check`: passed.
- `bun run contracts`: `behavioral-contracts: ALL-PASS` on the final uninterrupted run.
- [smoke-tasks-dashboard-harness.ts](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts): passed all Tasks arms and positive controls.
- [smoke-file-open-harness.ts](../../../../scripts/harness/smoke-file-open-harness.ts): passed headless fallback and graphical native tiers, including the 100,000-line file.
- [smoke-ssh-channel-harness.ts](../../../../scripts/harness/smoke-ssh-channel-harness.ts): passed native client selection, uploads, resize, exit, OSC 52, and 30 keyboard encodings.

## Invariant review

The header implicates “Dashboard controls state their selection and next action,” not “Each dashboard lens has one stable row shape.” The row-shape record governs task body rows. Removing the pane-only gate row does implicate row shape, and now restores the shared two-row Live task shape.

I refined [tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md) to require padded segments with no literal separators or dead cells. “Panel controls share paint and hit geometry” remains satisfied because each control reads one stored range.

## Bycatch

- The welcome screen says `Ctrl+P command palette`, but `Ctrl+P` opens Go to File. I reproduced it twice from the default welcome screen. I did not change it because it is outside task 533.

## Worktree state

The task commit is `a4c36b4b`. The worktree is clean except for dispatcher-owned [AGENTS.md](../../../../AGENTS.md) and the untracked builder priming file. I did not commit either file.
