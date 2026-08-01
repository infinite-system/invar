# Brief #452 round 2 — union with the chrome/history branch, then done

## In plain words

Another branch rewrote the same panel test file you added your
equal-name check to. Bring it in, put both sets of checks together,
and run it. Neither set may be dropped to make the merge easy.

## Why

`fleet/444-history-is-editor-area-view-states` is READY and already
contains `#442`'s chrome work (it did that union in its own round 3).
The conductor's trial merge of your branch on top produced exactly ONE
conflicted file:

```text
scripts/harness/smoke-panel-chrome-harness.ts
```

Everything else merged automatically, including `Bootstrap.ts` and
`smoke-workspace-tabs-harness.ts`.

## What to do

1. `git merge fleet/444-history-is-editor-area-view-states`.
2. Classify the conflicting hunks against the merge base before
   resolving — a union merge without the base cannot tell "we added"
   from "they deleted".
3. Resolve as a UNION. Their chrome assertions (splitter columns 37
   and 91, editor-action colors, toggle padding, superscript count)
   and your identity assertions (restored `terminal` id, two
   `Database 3` panes with distinct ids, closing one leaves the other)
   must ALL be present and ALL pass.
4. If two assertions genuinely contradict rather than overlap, stop
   and report it. That is a design disagreement and the conductor
   decides.
5. Re-measure [project.coverage-deltas.md](../../../../project.coverage-deltas.md) for this smoke and declare
   the MEASURED numbers. Never adjust a declaration to avoid a ratchet
   failure.

## Keep your open question open

Your report says the original all-terminal incident remains unproven,
and that a newly created terminal should have owned a fresh
`OpenPty`. Do not quietly resolve that during the merge. If the union
work surfaces anything about it, say so; if not, the open question
stands as written. An honest unknown is the most valuable line in that
report.

## Invariants in scope

Round 1's list stands. Additionally:

- [The UI contract](../../../../src/modules/ui/ui.invariants.md) and
  [design.invariants.md](../../../../design.invariants.md) — #442 added
  editor-area path ownership and chrome order/background records. Your
  identity change touches PanelHost from a different side; confirm they
  agree.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## Verification

- The merged panel-chrome smoke, run and passing, with BOTH assertion
  sets present. State the assertion count before and after.
- `bun test` in FULL, not focused.
- Your focused identity tests and the other PTY smokes, re-run on the
  merged tree.
- `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`, invariant
  checker `--all` and `--refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## Report

Open with `## In plain words`. List every conflicting hunk, which side
it came from, and how you resolved it. Confirm no assertion from
either branch was dropped.
