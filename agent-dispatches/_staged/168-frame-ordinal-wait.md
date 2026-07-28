# TASK — #168: waits that ask for "the next frame" instead of a condition. Three instances.

Work ONLY in this worktree. Do NOT run `scripts/merge-gate.sh`; do NOT push, merge, tag or delete.
Report to `/tmp/168-frame-ordinal-wait-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then
`bun install` FIRST — a fresh worktree has no `node_modules` and every preflight reds on unresolved
imports until you do.

## The defect

`scripts/harness/SynchronizedOutputQuiescence.ts:63` throws:

    error: Timed out waiting for the next complete synchronized frame
           (completed frames observed: 58)

**"The next complete synchronized frame" is a wait for frame N+1 to EXIST.** It is not a condition
on content. This repo has an ESTABLISHED invariant that harness waits observe conditions and not
frame ordinals, and its rejected-alternatives section gives the reason: an action whose target is
ALREADY PAINTED emits no frame, and coalescing changes ordinals. A frame-ordinal design was
proposed once in this project and killed by that invariant.

So when the app has nothing to repaint, frame 59 never arrives — on any machine, at any load. The
gate labels these `starvation-class` and retries them, which is a contention story attached to an
unreachability defect.

## Three confirmed instances, all in gate logs

1. **behavioral-contracts, plugin-manifest drive.** Timed out after 58 completed frames,
   immediately following `PASS the language-provider fixture opens in the editor`. Preserved at
   `/tmp/merge-gate-failures.3227709/behavioral-contracts-felt-invariants-.attempt1.log`.
2. **Shortcut Help sheet.** Timed out after EIGHT completed frames with the sheet visibly open
   showing Quit and Go to File rows. Reported as bycatch by the #172 builder on `a41e682`.
3. The same wait is reached by other harnesses — enumerate them, do not assume these are the only
   two sites.

Both passed on retry and on standalone rerun. That is the signature, not an exoneration: a
condition that has no publisher in one ordering will be satisfied in another, so retrying is a
coin flip that usually wins.

## DO NOT read this as contradicting #155, which landed frame-count mode

Getting this backwards would undo #155, so the distinction is load-bearing:

- **Counting frames that ALREADY OCCURRED is sound.** An assertion over observed history — "the
  glide produced N moving frames", "this operation cost one frame" — measures something that
  happened. No clock, cannot be slow, cannot flake under load. #155 built that and it stays.
- **WAITING for frame N+1 to arrive is not.** It predicts the app will paint again, and nothing
  guarantees it will.

One counts the past. The other bets on the future. Only the second is the defect.

## Work

1. **Enumerate every caller** of `SynchronizedOutputQuiescence`'s next-frame wait. Report the list.
   A fix at one site leaves the class open, and #172 showed the value of asking who else consumes a
   seam before calling a defect local.
2. **For each caller, name what it actually wants to be true.** "The sheet is open and shows Quit"
   is a condition. "One more frame happened" is a proxy for it. Replace the proxy with the claim.
3. **Where a caller genuinely needs to know a repaint occurred**, that is a legitimate need — but it
   must be expressed as a condition on the RESULT of the repaint, not on the frame counter. If you
   find a case where no observable content distinguishes before from after, say so explicitly; that
   is a finding about the app's observability, and it belongs in the report rather than being
   papered over.
4. Apply the #159 audit as you go: `mutation -> reachable publisher -> observed condition`. For each
   wait, is a subsequent frame GUARANTEED by the action preceding it, or merely likely?

## Constraints

- **NEVER widen the timeout and never raise the frame budget.** Both convert the defect into a
  slower version of itself, and the timeout is what disguised it as a flake for days.
- Positive control mandatory per repaired site: plant the no-further-frame interleaving, quote the
  red, then the green. A wait that can no longer fail is worse than the flake it replaced.
- Do NOT fix any individual flaky smoke beyond converting its wait — #177 holds an open hypothesis
  that the gate's one-retry-per-run pattern is a single shared cause, and point-fixing smokes would
  destroy the evidence that measurement needs.

## Reproduction

behavioral-contracts is the serial-tail step that reaches instance 1. Run it N>=10 and report the
ordered pass/fail SEQUENCE, not a rate — the narration flake was solved by a 0,1 alternation that a
percentage would have hidden entirely. If it will not reproduce, the planted interleaving is your
evidence instead; say which you used.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor
(`$Class = Static($Raw); Class = $Class`), never `Class = Static($Class)`; `Reactive()` is exempt
because it mutates in place. Invariant records live at
`src/modules/<domain>/<domain>.invariants.md` and are cited by ROOT-RELATIVE path. Full descriptive
identifier names — `increment` not `inc`, `index` not `i`. 80 columns.

## BYCATCH

Report every defect you SEE; fix only the one you were SENT for. Put them under a `## Bycatch`
heading with exact reproduction, how many times it reproduced, and which commit. The conductor
converts them into tasks — five were lost in one night because they were reported and never
converted, so the evidence in that section is what makes a finding survive.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 913
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`, plus the
per-site positive controls and the N-run sequence.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
