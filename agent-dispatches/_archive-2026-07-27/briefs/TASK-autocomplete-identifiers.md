# TASK — #131: autocomplete misses ALL bare identifiers (imports AND file-locals)

Work ONLY in `/tmp/conductor-autocomplete` (branch `fix-bare-identifier-completion`).
Do NOT run `scripts/merge-gate.sh`. Do NOT push, merge, tag, or delete branches — the
conductor lands work. Write your report to `/tmp/autocomplete-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH`.

## ⚑ DRIVE IT FIRST. Reproduce before you diagnose.

Open a real TypeScript file in your own PTY, type a two-character prefix of an imported
symbol, and watch what the popup does. Then do the same for a `const` declared ten lines
above the cursor. You must SEE both failures before you form a theory.

Write no assertion until the symptom is gone.

## What the user reported

Verbatim, ~20:50: *"right now the imported things at top of file do not autocomplete when
you start typing, that's a hole"*. Then, clarifying five minutes later: *"imported or
defined constants, constants also don't auto complete"*.

The second report is what makes this tractable. Locally **defined** constants fail too.
Imports and file-locals share nothing except being **bare identifiers** — as opposed to
member access after a `.`, which demonstrably works, since its kind glyphs land correctly.

So this is near-certainly ONE defect, not two: bare-identifier completion is either never
requested, or requested with a context that yields nothing.

**Measure it anyway. Do not assume.** Five confident structural diagnoses died to
measurement this week; a structural read is a hypothesis, not a finding.

## Diagnosis order

1. **Is a request issued at all** for a bare word prefix with no preceding `.`? Instrument
   the provider call, or read the `completionRequestCount` status field the flyweight work
   already publishes. **If the count is zero, the trigger condition is the defect** — most
   likely trigger-character-only, with no identifier-prefix trigger.
2. **If a request IS issued**, capture the raw tsgo response.
   - Response contains the symbols → the defect is client-side, in filtering or mapping.
   - Response is empty → the position, context, or `triggerKind` being sent is wrong; also
     check whether `isIncomplete` handling is dropping the first result set.
3. **Member access must keep working.** It is your regression control, and it is the one
   part of this feature the user has seen behave.

## Out of scope — do not conflate

**Auto-import** (offering symbols that are not yet imported, and adding the import
statement as an additional text edit) is NOT part of this task. It is a different feature
with different failure modes. Note it as a follow-up in your report; do not build it.

## Acceptance

A driven smoke against **real tsgo** — not a stub — with one fixture exercising all three
shapes:

- (a) named **and** default imports;
- (b) file-local `const`, `function`, and `class` declarations;
- (c) member access, as the regression control.

Type 2–3 character prefixes and assert **from the emulator grid** that each candidate
appears with its correct kind mark: `const` → value family, `function` → callable,
`class` → type.

The flyweight contract must hold: **zero** extra provider requests per keystroke beyond
the existing counts, and popup update latency flat at 5,000 items. Assert this on counts,
not on wall-clock — a count-based contract cannot be excused by machine load.

**Positive control is mandatory.** Break the completion path deliberately and quote the
red. A check that can only fail toward "pass" is not an instrument.

## Scale parity

Drive at both scales. A 20-line file and a 100k-line file must complete the same way and
at the same cost per keystroke.

## Bycatch

Report other bugs you notice. Do not chase them. Fix one only if it is small, obvious,
clearly correct, and in a file you already touched — list each separately.

## Verification — quote exact exit codes

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, and the completion smoke **3 times**. One
verification pass at the end. Never read `$?` after a pipeline.

Owner surfaces: `src/modules/lsp` and `src/modules/ui/CompletionPopup`.

Full descriptive identifier names (no abbreviations), 80 columns, ivue conventions
(subclass `$Class`, never `Class`). Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>` and leave the tree clean.
