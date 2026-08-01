# Brief #444 round 3 — union with #442's smoke, both assertion sets survive

## In plain words

The other task is fixed now. It changed the same test file you did.
Bring its branch in, put both sets of checks into one file, and run it
to prove both still hold. Neither set may be dropped to make the merge
easy.

## Why you and not them

You own the trail assertions and understand what each wait is for.
#442 owns the chrome assertions. Someone has to hold both, and you are
the one whose checks are easiest to lose silently — a dropped chrome
assertion fails loudly on their next drive, a dropped trail assertion
just stops testing history and nothing complains.

#442's reds are fixed and its branch is green on its own checks. Both
branches have already merged main independently.

## What to do

1. `git merge fleet/442-panel-editor-tree-chrome-polish`.
2. Expect roughly six conflicting hunks in
   `scripts/harness/smoke-navigation-history-harness.ts`, plus possible
   conflicts in `src/modules/workspace/Workspace.ts` and
   [src/modules/navigation/navigation.invariants.md](../../../../src/modules/navigation/navigation.invariants.md).
3. Classify EVERY conflict against the merge base before resolving. A
   union merge without the base cannot tell "we added" from "they
   deleted". Say in the report which side each hunk came from.
4. Resolve as a UNION. Their chrome checks (project row tone,
   breadcrumb row placement, padded `❮ ❯` buttons, file-tab strip
   colors) and your trail checks (file to comparison to file, forward,
   the forty-comparison depth case) must ALL be present and ALL pass.
5. If two assertions genuinely contradict — not merely overlap — stop
   and report it. That is a real design disagreement between the two
   tasks and the conductor decides, not you.

## The count declaration

Both branches touched [project.coverage-deltas.md](../../../../project.coverage-deltas.md). #442 corrected its
panel-smoke row to the measured `25 → 19` and `46 → 55` this round.
After your union, the navigation smoke's own counts will change again.
**Measure them and declare the measured numbers.** Never adjust a
declaration to avoid a ratchet failure; the ratchet is reporting what
the file actually contains.

## Invariants in scope

Rounds 1 and 2 stand. Additionally:

- [The UI contract](../../../../src/modules/ui/ui.invariants.md) —
  #442 added editor-area path ownership records this round. Confirm
  your `EditorContentMount.displayedPath` seam agrees with what they
  recorded; you both touched that seam from different sides.
- [design.invariants.md](../../../../design.invariants.md) — new from
  #442: chrome order, backgrounds, spacing. Your merged smoke must not
  contradict it.
- `Live static reads follow the receiving class` in
  [project.invariants.md](../../../../project.invariants.md).

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## Verification

- The merged navigation smoke, run and passing, with BOTH sets of
  assertions present. State the assertion count before and after.
- `bun test` in FULL, not focused.
- Your other PTY smokes, and #442's panel-chrome and tree-scroll
  smokes, all re-run on the merged tree.
- `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`, invariant
  checker `--all` and `--refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## Report

Open with `## In plain words`. List every conflicting hunk, which side
it came from, and how you resolved it. Confirm no assertion from
either branch was dropped.
