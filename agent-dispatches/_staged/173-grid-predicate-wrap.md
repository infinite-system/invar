# TASK — #173: predicates that search for contiguous text in a surface whose job is to wrap it

Work ONLY in this worktree. Do NOT run `scripts/merge-gate.sh`; do NOT push, merge, tag or delete.
Report to `/tmp/173-grid-predicate-wrap-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then
`bun install` FIRST — a fresh worktree has no `node_modules` and every preflight reds on unresolved
imports until you do.

## The defect

Reported as bycatch by the #172 builder on `a41e682`. A predicate timed out waiting for the
contiguous grid string:

    /resolver-smoke ARGUMENTANCHOR

The final grid **visibly contained it**, wrapped across two rows as
`/resolver-smoke ARGUM` + `ENTANCHOR`. It passed on retry and on a standalone rerun.

## Why this is a defect and not an intermittent

The app rendered the correct content. The predicate could not see it because it searches for a
contiguous run of characters in a grid whose entire purpose is to wrap text at the pane boundary.
Whether the assertion passes therefore depends on **where the line happens to break** — a function
of pane width, content length, and everything printed before it. None of which the assertion
mentions.

That makes it an assertion coupled to PRESENTATION while claiming to test CONTENT. It passes today
and fails whenever something upstream shifts a column, and the failure looks like a flake rather
than the coupling it is.

The retry passing is what makes it dangerous: it will keep being absorbed into the retry tally as
noise rather than read as a probe that cannot express its own subject. Same family as #143 (probes
keyed to fixed rows) and the `characters.indexOf("⌕")` dependency flagged in #105.

## The sweep

Find every harness predicate that asserts a MULTI-WORD CONTIGUOUS string against a surface that
wraps. The at-risk consumers, because they wrap by design:

- the agent composer and transcript — word-boundary wrap is a landed contract (#52)
- the markdown preview
- overlay dialog bodies
- anything using the shared break-opportunity generator (#72)

Report the full list before fixing, and say which are genuinely at risk versus which assert short
single-token strings that cannot straddle a boundary. A narrow, justified list beats a broad sweep.

## The fix

Compare against the surface's LOGICAL text, not the painted grid: join the rows of the owning
region and normalise the wrap before matching — or assert on the published semantic value where one
already exists, which is better still because it needs no grid reading at all.

**The wrap boundary is not part of the claim being made, so it must not be part of the assertion.**

If a shared helper for "read the logical text of a region" does not exist, create ONE and route the
consumers through it. Do not fix five call sites five ways — that is how #69 (one text-input
primitive) and #72 (one break-opportunity generator) came to exist, and the same reasoning applies
to reading a wrapped surface back.

## Constraints

- **Do NOT widen the wait or add a retry.** The content is already painted when the predicate runs;
  waiting longer cannot help, and that is itself the tell that this is not a timing defect.
- Positive control, both directions: force a wrap in the middle of the target string and require the
  repaired predicate to still find it; then plant a genuinely absent string and require a red. A
  matcher that cannot fail is worse than the flake it replaced.
- Do NOT fix any individual flaky smoke beyond this coupling. #177 holds an open hypothesis that the
  gate's one-retry-per-run pattern is a single shared cause, and point-fixing smokes destroys the
  evidence that measurement needs.
- If joining rows would hide a REAL defect — a case where the app wrapped somewhere it should not —
  say so. The goal is an assertion that tests content, not one that tolerates anything.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor
(`$Class = Static($Raw); Class = $Class`), never `Class = Static($Class)`; `Reactive()` is exempt
because it mutates in place. Invariant records live at
`src/modules/<domain>/<domain>.invariants.md` and are cited by ROOT-RELATIVE path. Full descriptive
identifier names — `increment` not `inc`, `index` not `i`. 80 columns.

## BYCATCH

Report every defect you SEE; fix only the one you were SENT for, under a `## Bycatch` heading with
exact reproduction, repetition count, and commit.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 913
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`, plus the
per-site positive controls.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
