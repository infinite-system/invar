# TASK — #192: five residual generic waits from #168. One audit, not five fixes.

Work ONLY in this worktree. Branch `fleet/192-waits`. Do NOT push, merge, tag or delete. Report to
[/tmp/192-waits-READY.md](../../../../../../../../../../../tmp/192-waits-READY.md). `export PATH=$HOME/.bun/bin:$PATH`, then `bun install` FIRST.

**YOU ARE THE ONLY BUILDER.** You may run `scripts/merge-gate.sh`. Take the machine-wide quiet lock for
timing runs and **check `/tmp/invar-quiet-lock.journal` for a `degraded` entry afterwards** — the lock
gives up after 120 s and runs anyway (#183).

## The shared cause, already established

#168 converted 75 wait sites off a forbidden primitive and gave 72 of them the GENERIC predicate ("the
driven input produces an observed screen change"), naming only 3 sites as legitimately needing that. A
generic predicate is a PROXY at any site whose claim is narrower than "something repainted." **Seven
harnesses have now regressed from that one task** — two repaired by #188, one by #189, two by #191.
These are the rest.

## Two repair patterns that worked. Copy them.

**#189 — observe the claim, not a change.** The scrollbar wait accepted any byte change in the row, so an
intermediate 44-cell thumb satisfied it before the exact extent arrived. Repair:
`frame.thumbLength < stableHorizontalFrame.thumbLength`. Control: a one-character edit that cannot
lengthen the champion (RED), then the 180-character edit (GREEN).

**#191 — never carry a coordinate across a settling condition.** A wait took a transcript coordinate from
an intermediate frame and clicked a row the agent turn had since moved. Repair: await PUBLISHED state
proving the operation completed (`readTerminalInput` done, `agentBusy === false`), then REACQUIRE the
coordinate from the stable grid, then click.

## The sites

**1. `smoke-shortcut-help-harness` — START HERE, it is a HARD GATE RED.**
`Timed out waiting for grid condition: PageDown changes the shortcut sheet while seeking Ctrl+Shift+H`.
Escalated 2026-07-28 07:50: on main's gate at `23a681b` it **retried and still failed** — no longer a
retry-passer. Log `/tmp/merge-gate-failures.319930/smoke-shortcut-help-harness-.log`. Also failed twice
in one earlier baseline pool run and once-then-retried in another. At merge base: YES.
Note what the name claims: PageDown CHANGES THE SHEET. If the sheet is already scrolled to its end, or
`Ctrl+Shift+H` is already visible, there is no change to observe and the wait is asking for something
unreachable. #168's own repaired plugin-manifest site was exactly this — inert input, no publisher.

**2. `smoke-scrollbars-harness`** — `the diff pane horizontal thumb is painted before frame collection
begins`. Reproduced a second time: YES. At merge base: NO. At `52dcde4`: YES.

**3. `smoke-scrollbars-harness`** — `wrap-off overview marks leave track and thumb geometry unchanged`.
Reproduced a second time: NO. At merge base: NO. At `52dcde4`: YES.

**4. `smoke-panel-chrome`** — `the Agent 2 list close removes only that instance`. Once, passed on retry.
Reproduced a second time: NO. At merge base: YES.

**5. `smoke-panel-split-harness`** — timed out waiting for `panelContentOrder.join(',') ===
'agent,terminal'` plus matching cell IDs, then passed retry
(`/tmp/merge-gate-failures.258154/smoke-panel-split-harness-.attempt1.log`). At merge base `5494a3e`: NO,
and absent from the three `e407bfd` baseline roots. **Weakest member — if it will not reproduce, say so
and leave it.**

Sites 2, 3 and 5 read "merge base NO." Do NOT read that as fixed; a handful of merge-base gates may
simply not have hit an intermittent. Treat them as intermittent until a quiet N>=10 says otherwise, and
state which reading your measurement supports.

## Check this first, it is cheap and it caught #191's blocker

Does the site assert rendered TEXT whose visibility depends on available width? #191's hard red was a
predicate requiring a path suffix that the WORKTREE'S OWN LONG PATH pushed outside the terminal cell —
invisible in the main checkout, failing in every worktree. Any predicate keyed to a header, breadcrumb,
tab title or status string inherits the worktree name as a hidden input. One comparison run against
`/home/parallels/dev/tui-editor` settles it per site.

## Method

For each site, answer ONE question **in writing before touching it**: WHAT RESULT DOES THIS WAIT ASSERT?
Then make the wait observe that result. Where a site legitimately claims only "something repainted," say
so explicitly and leave it — #168 correctly identified three such sites; the defect was the ratio, not
the existence of the generic case.

The deliverable is the ENUMERATION, not a count: a table of site -> named result -> repaired or
justified-generic. Ordered PASS/FAIL sequences, never rates.

## Forbidden

Do not widen a timeout. Do not restore a removed primitive — the `awaitNextCompletedFrame` and
`awaitQuiescence` censuses must stay at zero identifiers under `scripts/harness`. Do not touch
`smoke-reserved-chord-harness.ts`; its Quick Open intermittent is **#194** and it also hard-failed on the
same gate. Expect it red in your own gate runs and report it as bycatch without fixing it.

## Positive control

Both directions per repair: break it, quote the exact red, restore, quote the green.

## Terminal condition

A full `scripts/merge-gate.sh` reaching ALL-PASS **except** for `reserved chord`, which belongs to #194.
State clearly which steps were green and which you are handing off.

## BYCATCH

Every defect you SEE, under `## Bycatch`, with exact reproduction, repetition count, and **whether you
verified it at the merge base.**

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor; `Reactive()` is exempt.
Harness invariant records at [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md), cited by ROOT-RELATIVE path. Full
descriptive identifier names. 80 columns.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (>= 924 annotations / 67
lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`,
`bash scripts/behavioral-contracts.sh`, the per-site table, the full gate.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
