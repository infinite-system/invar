# TASK — `drive` requires every action to repaint, and names targets by cell number

USER-DIRECTED and sequenced by the user: "a primary task is to improve the drive tool then, the drive
stubs will pollute the repo" and "first the drive script should be solid so recipes stand on solid
foundations."

`drive` is the repo's exploratory instrument — the one-command way to run the real app, act on it, and
read its published state. Every future investigation leans on it. It currently encodes two assumptions
that are not true, and both make it lie quietly rather than fail.

## Why this comes before anything built on top of it

A follow-on decision (recorded in [project.decisions.md](../../../../project.decisions.md)) is to store drive RECIPES — intent — rather
than drive code, precisely because stored scripts rot. A recipe reads "open the nested fixture, collapse
the first top-level region, type at the root, page past the collapsed body."

That only pays off if the TOOL can express those nouns. If `drive`'s only spelling is `--click 60,20`,
every recipe sends its reader back into coordinate archaeology and the recipe's whole promise — cheap,
faithful re-derivation — is false. **The recipe's vocabulary and the tool's targeting vocabulary must be
the same vocabulary**, or recipes become translation exercises with a fresh chance to get the
translation wrong. Do NOT write recipes in this task; make them possible.

## Defect 1 — every action must repaint. Exact site.

`scripts/harness/Drive.ts:421-422`:

```ts
this.sendAction(driver, action, columns, rows);
await driver.awaitScreenChange(timeoutMilliseconds);
```

Unconditional, for every `--key`, `--wheel` and `--click`. So an action that legitimately paints nothing
hangs until timeout. Reproduced by two separate builders:
`bun run drive --key Control+k --key '['` times out after the first, frame-silent chord step. The same
chord succeeds when delivered as one sequence through the PTY latency instrument — which proves the app
is fine and the TOOL's expectation is wrong.

This is the eighth spelling of this repo's dominant defect class: asking for evidence of a change that
will not happen (#159, #161, #168, #187, #188, #189, #205's clipboard wait, now `drive`). Read the
conductor skill's section on it, and on its inverse the pre-satisfied wait, before designing.

**The repair is NOT "tolerate N frame-silent actions."** A step's completion condition must be STATED
rather than inferred from repaint. Frame-silent steps are legitimate and enumerable — chord prefixes,
keys that no-op at a clamp, keys a focus owner swallows without repainting. Each step either names what
it waits for or declares itself frame-silent, and a frame-silent declaration that turns out to paint is
itself worth reporting, because it means the model of the gesture is wrong.

Note the shape already exists in this file: the file-open path (`Drive.ts:334-390`) uses named
`awaitGridCondition` predicates reading published status, and there is already a conditional branch with
an early `return` at `Drive.ts:416-418`. Extend that structure rather than inventing a parallel one.

## Defect 2 — targets are fixed cell coordinates

[scripts/harness/drive.md](../../../../scripts/harness/drive.md) documents `--click 60,20`, and a real drive from this session contains
`--click 45,7` — two integers encoding "the fold gutter of the first top-level region," true only for
today's gutter width, sidebar width and layout defaults. #143 was this class at scale: "eight probes
still keyed to retired copy or fixed rows." A coordinate that lands one column off does not fail; it
clicks the wrong thing and the drive still exits 0.

Add role/text-resolved targeting so a drive names WHAT it clicks and the tool resolves WHERE at replay
time. This is the rule already enforced for probes (locate by role/text, not fixed row) and for glyphs
(read the vocabulary; `⌕` and `▁` both burned this repo). Keep raw coordinates available for genuine
geometry tests, but as the exception that justifies itself rather than the default spelling.

## What must be proven — both directions, or it is unverified

- The chord case completes with no timeout: `--key Control+k --key '['` exits 0.
- A POSITIVE CONTROL showing the new step model still FAILS when a step's stated condition genuinely
  never arrives. A step model that can no longer time out is not a fix, it is a removed check.
- Role-resolved targeting hits the same element as `--click 45,7` does on today's layout, AND still hits
  the right element after a simulated layout shift (change a width/dock that moves it). Per standing
  doctrine, a targeting fix verified against one layout is a fix with one tested outcome — enumerate the
  states, do not replay the one case in front of you.
- `drive` still works for its existing documented uses; [scripts/harness/drive.md](../../../../scripts/harness/drive.md) updated to match the
  code, since a doc that describes retired behaviour is its own defect (that happened twice today).
- `git diff --stat`. The user's governing criterion is whether a change complexifies everything
  downstream; the line count is part of the verdict, not a footnote. Prefer extending the existing
  condition vocabulary over adding a second mechanism.

## Out of scope

Any stored or replayable drive CORPUS, and writing recipes. The corpus was declined by the user ("the
drive stubs will pollute the repo"); recipes wait on this foundation by the user's explicit ordering. If
this work changes what looks feasible, that is a new conversation with the user, never an inference from
this task.

Do NOT run `scripts/merge-gate.sh`, push, merge, tag, or delete branches.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor; `Reactive()` is
exempt. Invariant records at `src/modules/<domain>/<domain>.invariants.md` (harness contracts in
[scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md)), cited by ROOT-RELATIVE path. Full descriptive identifier names
— `lineIndex` not `i`. 80 columns. A fragment, not a substitute for the conventions and skills.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (zero problems; read the
count off this tree), `bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh`,
plus the drive invocations above with their exit codes.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean. Report to
[/tmp/204-drive-tool-READY.md](../../../../../../../../../../../tmp/204-drive-tool-READY.md): the chord case before and after, each positive control shown red then
green, the layout-shift evidence for targeting, the diff stat, and anything you could not establish.
