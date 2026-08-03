# Brief #459 round 3 — no confirmation on instance close, ever

## In plain words

The open question from round 2 is answered. Closing a single instance
never asks, even when a command is running in it. Containers still ask.

## The ruling

User, verbatim: **"no confirm at all, even for foreground process"**.

So:

- **One instance → no dialog, unconditionally.** Do not special-case a
  running foreground command. Do not add a setting. Do not add a
  softer prompt, a toast asking to undo, or any other pause wearing a
  different name. The gesture closes the instance.
- **A plugin tab / container → keeps its dialog**, carrying the count
  of instances it will close, exactly as round 2 specified.

## Why this is stated so flatly

The obvious engineering instinct here is to preserve *some* guard for
the running-process case, because killing live work feels different.
That instinct is overruled. VS Code kills a terminal without asking,
and the user has chosen the same. A guard reintroduced under another
name would defeat the ruling while appearing to respect it — that is
the failure mode to avoid, not a missing feature to fill.

If you believe the code makes an unconditional close genuinely unsafe
— not merely surprising — say so in the report with the mechanism, and
stop. Do not implement a compromise unasked.

## Scope reminder

Round 1's defects still stand and outrank this: the phantom Database
pane first, then the empty-state message, then the self-hiding list.
This round only settles the confirmation question.

## Verification

- Both arms: closing ONE instance paints NO dialog — including one
  with a live foreground command — and the instance is gone; closing a
  CONTAINER holding instances still paints one, stating the count.
- Drive the real gesture: hover the row, click the close glyph.
- The `closePanelContentsListRow` helper no longer needs a
  confirmation path for instance rows. Keep only what container
  closes require.
- `bun test` in FULL, `bunx tsc --noEmit`,
  `bash scripts/conventions-gate.sh`, invariant checker `--all --refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## Invariants in scope

- [The UI contract](../../../../src/modules/ui/ui.invariants.md) — any
  record asserting that destructive panel actions confirm. This
  refines it to blast radius rather than action kind; propose the
  wording, do not delete the record.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## End state

The report gains one line confirming unconditional instance close, and
names any place a confirmation survived and why.
