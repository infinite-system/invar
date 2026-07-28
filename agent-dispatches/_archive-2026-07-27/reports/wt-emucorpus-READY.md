# Emulator conformance corpus — READY

Branch: `feat-emulator-conformance-corpus`

Tip: `b4511a2c21edd3d09619c1f34dbf9ea5b1728c27`

Rebased before implementation and final verification onto `origin/main`
`a01c576aa23a71d286ce18b20920eabab14510d3`.

## Fixture counts

The corpus contains 64 readable fixture definitions and executes 161 tests:

| Category | Fixture definitions | Executed tests |
| --- | ---: | ---: |
| SGR | 8 | 8 |
| Cursor | 7 | 7 |
| Erase and scroll | 11 | 11 |
| Text and cell width | 3 | 3 |
| OSC and DEC modes | 8 | 8 |
| Reply protocol | 1 | 1 |
| Recorded OpenTUI gaps | 7 | 7 |
| Other documented gaps | 6 | 6 |
| Chunk-split representatives | 10 | 107 |
| Recorded-real OpenTUI streams | 3 | 3 |
| **Total** | **64** | **161** |

The direct fixtures assert characters, foreground/background mode and value,
all projected SGR attributes, cell width, cursor, title, cwd, replies, and
exposed mode state.

## Chunk-split parameterization

Ten representative parser-state classes are encoded to bytes and replayed
across two `write()` calls at every byte boundary: CSI truecolor SGR, DEC 2026,
OSC with BEL, OSC with ST, DCS with ST, APC with ST, ESC save/restore, three-byte
CJK UTF-8, four-byte astral UTF-8, and combining-mark UTF-8. These definitions
generate 107 boundary tests. The generic CSI representative covers the shared
CSI parser generator used by cursor, erase, scroll, and SGR commands.

## Recorded fixture provenance

Captured 2026-07-24 through the real `PtyTestDriver` and unmodified OpenTUI app
at 80x24:

- dark boot stream through ready;
- F1 keypress diff replayed after the dark boot;
- fresh light-theme boot with user settings
  `{ "theme": "light", "glyphMode": "unicode" }`.

Each base64 byte stream has an expected JSON grid containing all 24 text rows,
cursor position, and one representative cell for every distinct color,
attribute, and width signature. Re-record with:

`bun scripts/harness/record-terminal-emulator-fixtures.ts`

Then review the expected-grid diff and run:

`bun test src/modules/terminal/TerminalEmulatorConformance.test.ts`

## Honest gap report

Explicit ignore/pass-through decisions covered by fixtures:

- OSC 52 clipboard requests: ignored by the grid-only oracle.
- OSC 10/11 color queries: ignored because headless has no renderer colors.
- OSC 99 notification, OSC 1337 capability, and OSC 66 shell-integration
  requests emitted by OpenTUI: ignored.
- XTGETTCAP DCS: ignored.
- Kitty keyboard and graphics probes: ignored.
- CSI version, pixel-size, and modify-other-keys probes: ignored.
- Sixel DCS and Kitty graphics APC payloads: ignored.
- DEC private modes 2027, 2031, and unknown modes: ignored.
- DECRQM probes for 1016, 2027, 2031, 1004, 2004, and 2026: status replies
  pass through `onReply`, with no grid change.
- Cursor-shape state is not projected into `TerminalCell`.
- OSC 8 hyperlink target metadata is not projected; underline styling is.

## Findings and fixes

No cell-grid correctness bug was exposed.

The corpus did expose missing public observability needed to specify the
existing dialect. `TerminalEmulator` now records OSC 0/2 title, OSC 7 cwd, SGR
mouse-encoding state, bracketed-paste state, mouse tracking, origin mode,
synchronized-output mode, and alternate-screen activation. This adds metadata
inspection only; it does not change pane rendering.

The now-green corpus completed the already-recorded ring retirement:
`ring_step` was removed, and wrap/git-log/agent-pane-ux/terminal tmux originals
remain available only through `INVAR_FULL_TMUX=1` audits.

## Verification transcript

- `bunx tsc --noEmit` — PASS, exit 0.
- `bun test src/modules/terminal/TerminalEmulatorConformance.test.ts` —
  161 pass, 0 fail, 1570 expectations, about 0.5 s.
- `bun test` — 985 pass, 0 fail, 14,402 expectations across 109 files,
  4.05 s.
- `bun .claude/skills/invariants/scripts/check_invariants.mjs --all` —
  PASS; terminal contract reports 1 reality and 7 chosen invariants.
- `bun .claude/skills/invariants/scripts/check_invariants.mjs --refs` —
  533 annotations resolved, 39 lattice links resolved, 0 problems.
- `bash scripts/conventions-gate.sh` — PASS.
- Live merge-gate check before each smoke — no active merge gate.
- `bun scripts/harness/smoke-terminal-harness.ts` — ALL-PASS.
- `bash scripts/smoke-terminal.sh` — ALL-PASS.
- No merge gate was run, per TASK.md.
- Commit used `SKIP_GATE=1`, per TASK.md.

Worktree status after commit contains only the pre-existing untracked
`TASK.md`; no implementation changes remain uncommitted.
