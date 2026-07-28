# READY — #163 (Settings selection reveal)

Status: READY

Commit: `215e06e91011ded4159727644a7e0181c01676a5`
(`Keep Settings selection inside painted viewport`)

The worktree is clean. Nothing was pushed, merged, tagged, or deleted, and
`scripts/merge-gate.sh` was not run.

## Finding

The 80x24 defect reproduced through the real PTY. After twelve Down steps,
`settingsSelected=12` and `settingsSelectedLabel="Reduced motion (instant agent
typing)"`, but scroll remained zero and no selected marker was painted.

The requested seam-local measurement produced:

- computed reveal target: row 17
- published viewport span: rows 0–20
- actual painted row: row 22
- difference: 5 rows

The five-row difference does not equal the two-row section header. The header
hypothesis is false: `settingsLines.findIndex(...)` already includes section
spacers and headings. The missing geometry came from OpenTUI implicitly
hard-wrapping earlier long Settings lines while `settingsContentRows`,
`scrollTop`, and `revealViewportRow` continued to count one row per logical
line.

`revealViewportRow` is shared by the command palette, Quick Open, Settings, and
the context menu. Its other consumers already supply one painted row per
content row, so the shared reveal calculation was left unchanged.

## Change

- Settings text now disables implicit wrapping and truncates overflow, making
  its painted row geometry match `settingsContentRows` and the shared reveal
  helper.
- Added the UI invariant `Settings selection stays inside its viewport`.
- Extended the real-PTY overlay smoke to discover every current Settings
  descriptor and assert the selected marker is inside the published viewport
  after every Down and Up step at 120x40 and 54x12.

The `invariants` skill kept the contract in
`src/modules/ui/ui.invariants.md`, because the defect is in the UI projection;
the Settings model contract explicitly excludes the panel UI.

## Driven evidence

- Before: 80x24 selected `Reduced motion…` off-screen with
  `settingsPanel` scroll 0.
- After: 80x24 paints `› Reduced motion…` at terminal row 18 with
  `settingsPanel` scroll 0.
- Scale parity: the same 80x24 drive on 10-line and 100,000-line fixtures
  painted the selection at row 18; both exited 0.
- Contract smoke: all 38 discovered descriptors stayed revealed on every Down
  and Up step at both 120x40 and 54x12.

## Positive control

The defect was replanted by removing `wrapMode: 'none'` and `truncate: true`.
The overlay smoke exited 1:

`Timed out waiting for grid condition: Settings descriptor 5 is painted inside
its published viewport at 54x12`

The final grid contained only earlier wrapped Settings rows and no selected
descriptor 5. Restoring the fix produced `ALL-PASS`, exit 0, at both
geometries.

## Verification

- `bun install` — exit 0
- `bunx tsc --noEmit` — exit 0
- `bun test` — exit 0; 1,692 pass, 0 fail
- `bash scripts/conventions-gate.sh` — exit 0
- invariant checker `--all` — exit 0
- invariant checker `--refs` — exit 0; 909 annotations, 67 lattice links,
  0 problems
- `bun scripts/check-coverage-ratchet.ts` — exit 0
- `bun scripts/harness/smoke-overlay-dialog-harness.ts` — exit 0,
  `ALL-PASS`
- `git diff --check` / committed-tree inspection — clean

## Bycatch

- UNFIXED — On commit `215e06e`, with a generated file open,
  `bun run drive --size 10 --geometry 80x24 --key 'Control+,'` leaves
  `settingsOpen=false` while publishing `focus="editor"` and
  `terminalFocused=true`. The visible Settings gear still opens the panel.
  Reproduced three times (including a post-commit confirmation); this task did
  not touch the focus or key-routing path.
