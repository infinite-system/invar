# TASK — #184: the stable failure-log path can serve a PREVIOUS run's logs

Work ONLY in this worktree. Do NOT run `scripts/merge-gate.sh` as verification of your own change —
main is currently RED on an unrelated harness-wait regression (#188, being fixed in parallel), so a
full gate tells you nothing about your work. Do NOT push, merge, tag or delete. Report to
`/tmp/184-failure-log-provenance-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then `bun install`
FIRST.

**ANOTHER BUILDER IS LIVE (#188) and it owns `scripts/harness/`.** Your change belongs in
`scripts/merge-gate.sh`. Do not touch anything under `scripts/harness/` — if you believe you must,
stop and say why in the report instead.

## The defect

Reported as bycatch by #178. Run the gate, then:

    readlink /tmp/merge-gate-failures     # prints nothing

The stable path is a DIRECTORY, not a symlink. `ln -sfn` therefore creates a child link *inside* it
rather than replacing it, so reading the stable location can return logs from an earlier run. Current
per-run evidence lives under `/tmp/merge-gate-failures.<pid>`.

## Why this is worse than a broken convenience link

The stable path exists so a person or agent can find "the failures from the last gate" without
knowing a pid. If it can serve a PREVIOUS run's logs, the diagnosis path itself lies — silently,
because a stale log is indistinguishable from a fresh one.

This is not hypothetical. Tonight the conductor read
`/tmp/merge-gate-failures.3227709/behavioral-contracts-...attempt1.log` while diagnosing #168. That
was the pid-qualified path and it was correct. **Had it been the stable path, #168 could have been
diagnosed from a different run's evidence with no way to notice** — and #168 turned on an exact frame
count (`58`) that would have been meaningless from the wrong run.

Same family as **#90** (harness diagnostic channels need a provenance guard — a stale
`artifacts/tui.log` line can satisfy assertions). Both are "an artifact path that cannot prove which
run produced it." Consider whether one mechanism serves both; if so, say so and scope this task to
the gate half.

## Two acceptable resolutions — pick one and justify it

1. **Make it a real symlink, replaced every run.** Keeps the convenience. Requires handling the
   existing directory (it is already there on this machine, so the fix must cope with the wrong type
   being present, not just create correctly on a clean box).
2. **Remove the stable path entirely** and print the resolved pid-qualified directory in the gate's
   failure output. Defensible and arguably better: **a path that cannot be trusted is worse than no
   path**, because its existence invites use. The gate already prints failure log locations per step,
   so the loss is small.

If it stays, it must be VERIFIABLE — print the resolved target when the gate reports failures, so the
reader sees which run they are about to read.

## Positive control, and it is the whole test

1. Run something that produces failures twice, with different content each time.
2. Require the stable path to resolve to the SECOND run's directory.
3. Require the FIRST run's logs to remain reachable under their own pid path — do not trade staleness
   for data loss.
4. Plant a stale DIRECTORY at the stable path and require the gate to replace or reject it rather
   than nest inside it. This is the actual bug, so this step is mandatory.

You do not need a full gate to exercise this — a minimal harness that writes fake failure logs through
the same code path is better, because it is fast and repeatable. Say which you used.

## Constraints

- Do NOT delete anyone's existing pid-qualified evidence directories. They are read during diagnosis
  and several from tonight are still being referenced by open tasks (#168, #172, #188).
- Never make the gate's failure reporting quieter to simplify the fix.
- If the resolution is removal, update every reference to the stable path — grep for
  `merge-gate-failures` across `scripts/`, `project.*.md`, `CONTRIBUTING.md` and
  `.claude/skills/` so no doc keeps recommending a path that no longer exists.

## Repo law

Full descriptive identifier names — `increment` not `inc`. 80 columns. Shell scripts start
`set -euo pipefail`.

## BYCATCH

Report every defect you SEE; fix only what you were SENT for, under a `## Bycatch` heading with exact
reproduction, repetition count, commit — **and state for each whether you verified it at the merge
base.** A bycatch observation made only on your changed tree cannot distinguish "I revealed this" from
"I caused this"; #168 got that wrong tonight and turned a good fix into a red main.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bash scripts/conventions-gate.sh`, `bunx tsc --noEmit`, `bun test`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, plus the four positive-control steps above with their
observed paths quoted.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
