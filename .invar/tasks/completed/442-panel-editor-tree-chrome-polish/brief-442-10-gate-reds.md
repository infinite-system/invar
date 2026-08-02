# Brief #442 round 10 — your gate came back red, twice

## In plain words

Your work went into the full gate and two checks failed. Both fail on
your branch alone, with nothing merged in, so they are yours and not a
merge accident. One is a real test failure. One is a count you wrote
down that does not match what your smoke actually does.

## What happened

The conductor gated `main + #442 + #443 + #448`. `GATE_EXIT=1`. Both
failures reproduce on your branch by itself — verified by running the
failing test directly in your worktree with nothing merged.

`#443` and `#448` were re-gated without you, came back `ALL-PASS`, and
have landed. Main has moved. Merge it forward before you start.

## Failure 1 — unit test red

```text
src/modules/filetree/FileTreePaneContent.test.ts:74
FileTreePaneContent > publishes pane identity and preserves pointer activation
expect(pane.tooltipAt(8, 0)).toBeNull()
Received: "Reveal open file"
```

This is your conditional reveal-button shift. The tooltip now answers
one column wider than the test allows. Decide which is right — the
test may be encoding the OLD geometry, or your hit area may genuinely
be one cell too wide. Drive it and say which, with cell evidence. Do
not just move the number until it passes.

## Failure 2 — coverage ratchet

```text
coverage declaration: scripts/harness/smoke-panel-chrome-harness.ts:
project.coverage-deltas.md:29 declares assertions 25 -> 16, waits 46 -> 49,
but actual counts are assertions 25 -> 19, waits 46 -> 55.
```

Your declaration understates your own smoke. The ratchet is telling
the truth about what the file asserts. **Fix the declaration to match
reality, never the reverse.** If the actual counts surprise you, that
is worth a sentence in the report — it means the smoke grew in a way
you did not intend.

## Why this reached the gate at all

Conductor's fault, and the fix is in your verification list below. You
were told not to run `merge-gate.sh`, which is correct. But you ran
only FOCUSED unit tests, so a full-suite red went unseen, and the
coverage ratchet exists only inside the gate. From now on the last
step before reporting is `bun test` in full.

## Invariants in scope

Rounds 1 through 9 unchanged. Additionally:

- [The UI contract](../../../../src/modules/ui/ui.invariants.md) — the
  reveal-button geometry record, if the shift turns out to be wrong
  rather than the test.
- [project.invariants.md](../../../../project.invariants.md) — the
  newly landed `Live static reads follow the receiving class`. Main now
  runs `static-self-read-census` inside the conventions gate. If your
  merge introduces a flagged read, fix it to `this` or
  `this.constructor`; do not add an allowlist row.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## Verification

- `git merge main` FIRST. Main has #443 and #448 on it.
- The two failures above, each shown red before and green after.
- `bun test` in FULL. Not focused. This is the step that was missing.
- `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`, invariant
  checker `--all` and `--refs`.
- Re-run your own PTY smokes after merging main.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## Report

Open with `## In plain words`. Say which of the two you judged the
test wrong about and which you judged the code wrong about, with the
evidence for each.
