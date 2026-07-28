# TASK — #170: `Ctrl+,` does not open Settings, while the gear button does

Work ONLY in this worktree. Do NOT run `scripts/merge-gate.sh`; do NOT push, merge, tag or delete.
Report to `/tmp/170-ctrl-comma-swallowed-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then
`bun install` FIRST — a fresh worktree has no `node_modules` and every preflight reds on unresolved
imports until you do.

## The defect

Reported as bycatch by the #163 builder on commit `215e06e`:

    bun run drive --size 10 --geometry 80x24 --key 'Control+,'

leaves `settingsOpen=false` while publishing `focus="editor"` AND `terminalFocused=true`. The
**visible Settings gear still opens the panel**. Reproduced three times including a post-commit
confirmation. That branch did not touch focus or key routing, so this is pre-existing.

## The asymmetry is the most useful fact here

The gear works and the chord does not. That isolates the defect to INPUT ROUTING and exonerates
everything downstream — the panel, its state, its rendering. Do not spend time there.

## The second clue, and it may be the whole thing

`focus="editor"` and `terminalFocused=true` are published TOGETHER. Those should not both be
authoritative at once: if the editor owns focus, the terminal should not also be claiming the
keystroke. The chord then arrives somewhere with no handler for it and is swallowed.

**That makes this a candidate regression of #101** ("Focus owns the keystroke: a minimal justified
reserved set, everything else passes through"), or a hole in that contract which the generated-file
path exposes.

**Read #101's contract FIRST** and establish whether this configuration is one it claims to cover.
If it is, the contract has a hole rather than the code having a new bug — and the hole is the
finding, because a contract that does not cover a reachable state is worth more attention than one
missed keystroke.

## Order of work

1. **Reproduce, then find which variable actually matters.** The report names three conditions at
   once — 80x24, a `--size 10` generated file, and the chord. **Vary them independently.** If it
   reproduces at 120x40, geometry is incidental and the report's framing is misleading. If it needs
   the generated file, ask what that path does to focus that opening a normal file does not.
2. **Trace the chord with an instrument, do not infer it from the routing table.** Establish where
   `Control+,` is consumed — reserved set, editor, terminal, or nothing. A routing table can be
   perfectly correct while the keystroke never reaches it, which is precisely the failure shape
   here. Five structural diagnoses were overturned by measurement in this project in three nights.
3. **Then decide whether the dual publication is cause or symptom.** `focus="editor"` with
   `terminalFocused=true` may be the defect itself, or a faithful report of a genuinely ambiguous
   state that something upstream created. Those need different fixes.

## CONFLICT AVOIDANCE — put your driven assertion in a NEW smoke file

A parallel builder (#168) currently has **40 files under `scripts/harness/` modified**, including
`smoke-overlay-dialog-harness.ts` — the file where a Settings assertion would most naturally go.

So do NOT extend an existing harness smoke. **Add a new focused one**, e.g.
`scripts/harness/smoke-reserved-chord-harness.ts`, and register it. A new file cannot conflict, and
the subject deserves its own smoke anyway: this is about reserved chords reaching their handler
regardless of which surface holds focus, which is a distinct claim from "the overlay dialog behaves."

Touching `src/` is fine — #168 is entirely inside `scripts/harness/`.

## The contract to lock in

A reserved chord must reach its handler regardless of which surface holds focus, or must be
explicitly documented as surface-scoped. Assert it by **DRIVING the chord**, not by unit-testing the
key table — the table being right is exactly what is not in question.

If the fix is that `terminalFocused` should never be true while `focus` names another surface, that
is a state invariant worth recording in its own right, and it is checkable on every publication
rather than only for this chord.

## Constraints

- Do NOT special-case `Control+,`. If Settings needs its own escape hatch, the routing model is
  wrong and the fix is in the model.
- Do NOT widen a wait. The gear proves the panel opens instantly when the command arrives; nothing
  here is slow.
- Positive control: with the fix in, break it again and require the driven assertion to red, then
  restore and require green.
- Check the OTHER reserved chords while you are in there. If `Control+,` is swallowed in this state,
  ask which others are — and report the list even if you only fix this one. An enumerated blast
  radius is worth more than a single repair (#143's lesson).

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor
(`$Class = Static($Raw); Class = $Class`), never `Class = Static($Class)`; `Reactive()` is exempt
because it mutates in place. Invariant records live at
`src/modules/<domain>/<domain>.invariants.md` and are cited by ROOT-RELATIVE path. Full descriptive
identifier names. 80 columns.

## BYCATCH

Report every defect you SEE; fix only the one you were SENT for, under a `## Bycatch` heading with
exact reproduction, repetition count, and commit.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 913
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`, plus the
driven reproduction before and after and the reserved-chord enumeration.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
