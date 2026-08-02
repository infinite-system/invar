# Brief #442 round 11 — the tab dirty dot is gone

## In plain words

The dot that shows a file has unsaved changes no longer paints on the
tab. Six tests caught it. It works on main and breaks with your tab
rewrite, so it came from your change.

## Evidence

Gate on `main + #442 + #444`: `GATE_EXIT=1`, six smokes failed.

```text
smoke: editor harness
  Timed out waiting for grid condition: the active tab paints its dirty dot
smoke: dirty-marker harness
  Timed out waiting for grid condition: the typed line and the tab dirty
  marker are both painted
also: scrollbars, agent-pane-ux, agent-cancel, behavioral-contracts
```

The conductor ran the SAME smoke on main, unmerged:

```text
smoke-dirty-marker: ALL-PASS
```

So this is a regression from the merged branches, not a pre-existing
red and not flake. `TabBar.ts` and `TabBarRenderer.ts` are yours.

## What to do

Drive it first: open a file, type, and LOOK at the tab. Do not start
from the test. The dot is either not being drawn, drawn in a cell the
new layout moved, or overwritten by the tab chip background you
changed this round.

This is user-visible. It is not a test-expectation problem like round
10's tooltip — main proves the behaviour exists and your branch loses
it.

## Ask yourself what else the rewrite dropped

Six smokes failed on ONE missing indicator. That ratio suggests the
dirty dot may not be alone: enumerate every per-tab indicator the old
renderer painted (dirty, active, preview/italic, close affordance,
overflow arrows) and confirm each still paints. Do not fix only the
one the gate named — the gate names what it happens to cover.

## Invariants in scope

- [The UI contract](../../../../src/modules/ui/ui.invariants.md) — any
  record covering tab rendering or the dirty marker. If the dirty dot
  has NO record, that absence is why a rewrite could silently drop it:
  propose the record, with an `Impossible if true` naming the missing
  dot.
- Rounds 1 through 10 stand.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy.

## Verification

- The drive, before and after, with cell evidence.
- All six named smokes green on your branch.
- `bun test` in FULL.
- `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`, invariant
  checker `--all` and `--refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## Report

Open with `## In plain words`. Say what dropped the dot, and list every
other per-tab indicator you checked.
