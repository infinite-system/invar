# TASK — #146: the glide cap's minimum is a dead zone; one notch must always move

Work ONLY in `/tmp/conductor-glidemin` (branch `fix-glide-minimum-deadzone`, off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/glidemin-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

## The defect

At the schema MINIMUM of `Maximum glide after input (ms)` — 100 ms — a single wheel notch applies
an impulse and travels **zero rows** before the cap ends the glide. Observed during the glide work:
the smoothness instrument's preflight `scrollTop > 0` wait timed out at 100 ms and a 300 ms cap was
used instead.

The instrument timeout is the symptom. The product problem is that **a value the settings schema
offers the user produces an editor where a wheel notch does nothing.** A user who selects 100 ms
concludes the app is broken, not that they chose an aggressive setting.

## The decision is made — implement it, do not re-open it

**Guarantee at least one row of travel for any single notch, regardless of the cap.** Do NOT
"fix" this by raising the schema minimum.

The reason is an invariant, not a preference. The whole glide-jam fix rests on *every input event
survives as exactly one impulse* — input the user performed is never silently dropped. A notch that
applies an impulse and moves nothing has been dropped in every sense the user can perceive.
Raising the minimum only relocates the dead zone to wherever the new floor sits; it does not remove
the class.

Read `scroll.invariants.md` first. The record *The glide tail is bounded and effective* is currently
**provisional** with this defect as its Open question. Closing this completes that record — so part
of the job is updating it: remove the Open question, and promote the Status if and only if the
invariant now genuinely holds at every selectable value.

## Constraints that make this non-trivial

- **Do not reintroduce discarded velocity.** #138 fixed overflow being thrown away at the ceiling;
  a naive "always commit one row" that bypasses the impulse queue could re-break that. Route
  through the same generator.
- **Do not special-case the minimum.** The guarantee must hold for EVERY cap value, which means it
  belongs in the impulse/commit path, not in a `if (cap === 100)` branch. An exception list is the
  tell that the rule is at the wrong level.
- **The 900 ms default must not change.** Prove it: the existing default's row travel and saturated
  tail frames must be unchanged. If they move, you have altered feel, which was not asked for.
- **Scale parity:** the guarantee holds identically at 2k and 100k lines.

## Contract

Drive the real PTY path and assert on COUNTS:
- at the minimum cap, ONE notch travels >= 1 row — the assertion that currently cannot pass;
- at the default cap, row travel and tail frames match the pre-change numbers exactly;
- across the full settable range (spot-check minimum, a middle value, maximum), a single notch
  always travels >= 1 row;
- events-to-impulses remains exactly 1:1 (the #138 invariant).

**Positive control mandatory:** restore the old behaviour and quote the red proving the new
assertion detects it.

**And extend the settings-applied drive to cover the MINIMUM value**, not just a mid-range one —
the round that added this field used 300 ms precisely because 100 ms was unreachable, so the
schema's own boundary is currently untested. That gap is why this shipped.

## Bycatch

Report other bugs; do not chase them.

## Verification — quote exact exit codes

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh` 3x, and the
settings-applied harness 3x. Never read `$?` after a pipeline.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class`, never `Class`).
Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
