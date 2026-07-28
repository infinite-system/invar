# TASK — #163: the Settings selection can move below the painted viewport at 80x24

Work ONLY in `/tmp/conductor-settingsreveal` (branch `fix-settings-reveal`, cut off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push, merge, tag or delete anything. Report to
`/tmp/settingsreveal-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then `bun install` FIRST — a
fresh worktree has no `node_modules` and every preflight reds on unresolved imports until you do.

**Two other builders are live on unrelated defects.** Your work is structural (is a row inside a
span), not a timing measurement, so contention does not invalidate it — but do not launch parallel
drives of your own, and do not run the merge gate.

## The defect

At **80x24**, navigating in Settings to a row immediately **below a section boundary** updates
`settingsSelectedLabel` while leaving the selected row **below the painted viewport**. The user
presses Down, the selection genuinely moves, and the thing they selected is off-screen.

Found as bycatch by the graphics-tier builder (#99) while placing the new Graphics tier row. It
reproduced more than twice. The tier itself was placed visibly in Appearance, so the GENERIC
reveal path is what is wrong and it is untouched.

## Start from the discriminator, then verify it

The section boundary is the tell. A reveal calculation that accounts for a row's height but not
for a section HEADER's rows will be short by exactly the header's height — which is why the
failure appears immediately below a boundary and nowhere else.

**That is a hypothesis, not a cause.** Measure it before believing it: five structural diagnoses
were overturned by measurement in this project in two nights, and one of them was built and
shipped as a fix before it was refuted. Print the computed reveal target, the viewport span, and
the row's actual position at the moment of the failure. The difference should equal the header
height if the hypothesis is right; if it does not, the hypothesis is wrong and the number will
say so immediately.

## A false lead you must not walk into

The glide-jam builder found a Settings layout red that turned out to be a **STALE PROBE, not an
app defect**: its initial 120x50 frame showed rows near the bottom of the viewport with the
primary-dock span below them, but driving Down through the real PTY reached the hidden row and
the resulting frame showed it selected at row 47. The viewport had scrolled correctly the whole
time.

So a probe reporting a hidden row is NOT by itself proof of this bug. Distinguish the two by
DRIVING at 80x24 and LOOKING at the frame. If the row is genuinely unreachable by continued
navigation, it is the app; if navigation reaches it, the probe was reading a moment that had not
finished.

## Order of work

1. **Reproduce by driving** at 80x24, at a section boundary. No assertion written yet.
   `bun run drive --open <dir> --geometry 80x24` is the on-ramp (#137). Use a fresh isolated
   HOME (`HOME=$(mktemp -d)`) — the harness HOME is shared and persistent, and a leaked
   `settings.json` will make your run disagree with everyone else's.
2. **Instrument the reveal seam**, not the whole navigation path.
3. **Iterate drive → change → drive.** One instrument at a time.
4. **Write the contract only after the symptom is gone.**

## The contract to lock in — the class, not the instance

Whenever `settingsSelected` changes, the selected descriptor's row must be inside the published
viewport span. Assert that on **every navigation step**, not at one geometry. A test pinned to
80x24 and one boundary retires this instance; the step-wise invariant retires the class, and the
class is what will otherwise come back at the next size someone tries.

## Constraints

- **Never widen a wait** to let the viewport catch up, and never special-case the boundary row.
  A reveal that needs an exception for headers has the wrong model of its own layout.
- Positive control mandatory: re-introduce the defect, quote the red, then the green.
- If the reveal calculation is shared with another surface (a list popup, the shortcut overlay),
  say so — a fix at the shared generator is worth more than a fix at the Settings call site, and
  enumerating the consumers before calling a defect local is the standing rule here.

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
conductor converts them into tasks — seven were reported and only two converted last night, so
the heading is load-bearing and the evidence in it is what makes the finding survive.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 907
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`, plus the
driven 80x24 reproduction before and after.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
