# TASK — #161: the Files pane is blank at settled boot while the model holds 50 rows

Work ONLY in `/tmp/conductor-blanktree` (branch `fix-blank-file-tree`, cut off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push, merge, tag or delete anything. Report to
`/tmp/blanktree-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then `bun install` FIRST — a fresh
worktree has no `node_modules` and every preflight reds on unresolved imports until you do.

## The defect

The editor opens on a real repository and the file tree is empty. It is the worst possible first
impression and it was found as bycatch, not by anyone looking for it.

Observed twice, on two different commits — `063e3ab` and `5f22cd8` — with:

    bun run drive --open /tmp/conductor-staticscpu --geometry 120x40

The pane was blank at **settled** boot even though **`treeRows=50` was published**.

## Read that pair of facts before forming a theory

Fifty rows in the model, zero rows painted. So the tree was BUILT: this is not a scanning
problem, not an ignore-query problem, not activation cost (#78 already made activation O(depth)).
The defect is downstream of a populated model, in publication or paint.

**Check the #159 mechanism FIRST.** That defect, landed hours ago, is exactly this shape:
`PanelHost` synchronously held the new semantic model, `RootView` called `requestRender()` in the
same input turn, OpenTUI coalesced that request into a frame already in flight, and
`StatusChannel` — which projects during paint — never wrote the new state. The waiter was not
waiting for a late publication; it was waiting for one with no publisher.

A first-paint render request issued in the same turn as workspace activation is precisely that
interleaving. `src/modules/ui/RenderRequest.ts` is the capability #159 added for it. If the boot
path requests a render in-turn, you may have the same bug at a second site.

If it IS the same cause, say so loudly — two confirmed instances turn a fix into an audit class,
and the audit is `mutation -> reachable publisher -> observed condition`. If it is NOT, the
elimination is still worth a paragraph, because the next person will have the same suspicion.

## Step 1 — reproduce on current main, and report a SEQUENCE

It was observed on a diagnostic branch. Confirm it reproduces on current main before hunting.

Boot N>=20 times and print the ordered pass/fail sequence. **A rate reads as randomness; a
sequence names a cause.** The narration flake was solved by a perfect 0,1 alternation that
identified wall-clock phase instantly, where "50% failure" would have said nothing. If the
sequence has structure — first-boot-only, alternating, after-N — find what shares that period.

**If it does not reproduce in 20 boots, do NOT close it as fixed.** An intermittent blank file
tree that hides is not a blank file tree that is gone. Say so plainly and raise N once.

## Step 2 — separate the two branches

Blank-with-a-populated-model has exactly two mechanisms and they need different fixes:

- **never published** — no frame after the mutation carries the tree to paint;
- **published then lost** — a later projection overwrites it with an earlier empty state.

#159 was the never-published branch, and it distinguished them with a deterministic planted
interleaving rather than by preference. Do the same. Guessing between these two and fixing the
wrong one produces a change that appears to work because the defect is intermittent.

## Constraints

- **Never widen a settle wait to make the tree appear.** If the tree can legitimately be empty at
  the moment of the check, the instrument must OBSERVE that rather than wait longer.
- Positive control mandatory: plant the interleaving, quote the red, then the green. A boot check
  that can only ever pass is not a check.
- If the fix is in the app rather than the harness, that is the better outcome — say so loudly.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor
(`$Class = Static($Raw); Class = $Class`), never `Class = Static($Class)`; `Reactive()` is exempt
because it mutates in place. conventions-gate rules 1.8/1.9/1.95 enforce all three across `src`
and `scripts`. Invariant records live at `src/modules/<domain>/<domain>.invariants.md` and are
cited by ROOT-RELATIVE path. Full descriptive identifier names — `increment` not `inc`, `index`
not `i`. 80 columns.

## BYCATCH

Report every defect you SEE; fix only the one you were SENT for. Put them under a `## Bycatch`
heading with the exact reproduction, how many times it reproduced, and which commit. The
conductor converts them into tasks — five were lost last night because they were reported and
never converted, so the heading is load-bearing.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 907
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`, plus the
N-run boot sequences from steps 1 and 2.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
