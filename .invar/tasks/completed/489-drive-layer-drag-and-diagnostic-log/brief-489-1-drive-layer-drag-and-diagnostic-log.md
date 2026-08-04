# Brief 489-1 — the drive-layer batch: six accumulated builder asks

## In plain words

Six asks from five builders, one instrument pass. Each is small; the
batch pays out to every future agent. Read [the task file](task-489-drive-layer-drag-and-diagnostic-log.md) — it
accumulated the asks verbatim with their sources.

## The six items

1. DriveSession drag verb: press, glide, release with humanPace
   awareness — transcript/terminal selection without raw driver
   calls (#487, #495 asked).
2. Diagnostic-log access: a DriveSession getter for the warm
   driver's actual log path + a tail/read helper; document the
   TUI_LOG_PATH replacement in the drive-pty skill (#487).
3. Negative screen condition: waitForTextGone exists — verify it
   covers the #356 ask (wait until a control/text is ABSENT) and
   document; add what is genuinely missing.
4. CLI narrow output: the one-shot is gone; give --attach/--eval a
   --show FIELD[,FIELD] filter so probes print selected status
   fields, not 350 lines (#356 r2 ask, adapted to the alias).
5. showScreen(rows) fix: accepted a row-band argument and printed
   nothing; fix or reject loudly (#501).
6. Doc notes into the drive-pty skill: type()+waitForRepaint
   pre-satisfied trap (#458); status waits use JSON quoting (#356).

## Reproduce by DRIVING first

For each item, drive the CURRENT behavior first (the missing verb,
the silent showScreen) — one sighting each — then extend. Locking
coverage: extend DriveSession.test.ts or the harness self-checks;
drive each new verb against the real app once.

## End state

All six shipped or explicitly refuted with evidence; drive-pty skill
updated (it is the builders' primer — keep it tight); DriveSession
tests green; a driven demo snippet per new verb in the report.

## Invariants in scope

- Harness input and output use a real PTY; Harness waits observe
  conditions ([scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md)) — the drag verb
  must be real PTY bytes, no teleport.
Answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; SKIP_GATE=1 commits; the conductor
gates and lands.
