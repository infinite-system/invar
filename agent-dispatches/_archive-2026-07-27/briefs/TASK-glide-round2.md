# ROUND 2 — your glide fix is ACCEPTED. Two gate reds it did not run.

Work ONLY in `/tmp/conductor-glidejam` (branch `fix-glide-input-interference`, currently at
`11c8163`, main already merged). Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/
delete. Append to `/tmp/glide-jam-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

Your round-1 work stands and is not to be redone. The ownership reduction, the impulse queue,
the 150/150 event-to-impulse preservation, the 209-212 -> 57-58 projection-pass drop, the
lodash evaluation, the 900 ms default chosen by driving 450/650/850, and the calibrated
~150 events/s harness are all accepted. Two smokes you did not run are red on the full gate
(run `1460509`), and both are consequences of ADDING A SETTING.

## Red 1 — `smoke: settings-applied harness`: NOT a probe defect. A missing obligation.

```
FAIL all 36 schema fields have an applied-effect drive
```

This contract requires **every settings schema field to have a drive proving the setting
actually takes effect**. `Maximum glide after input (ms)` is the new field and has no such
drive, so the count no longer matches.

This is the gate working exactly as intended, and it is the more important of the two. A
setting that persists but does not demonstrably CHANGE BEHAVIOUR is a dead control, and this
repo gates that class deliberately because a user cannot see the difference between "the
setting is applied" and "the setting is stored and ignored."

Write the applied-effect drive for the new field. It must be a real driven proof: set the
value, drive the gesture, and assert the OBSERVABLE consequence differs. You already have the
perfect instrument for this from round 1 — rows travelled and post-input saturated frames at a
given events/s. A short cap must travel measurably fewer rows than a long cap through the real
PTY path. Assert on counts, not wall-clock.

Do NOT satisfy this by exempting the field, loosening the count, or asserting only that the
value round-trips through the store. Round-tripping is persistence, not application.

## Red 2 — `smoke: layout harness`: establish probe-versus-app BY DRIVING first.

```
Timed out waiting for grid condition: snapshot.findText("Sidebar position") !== null
  && snapshot.findText("Bottom panel alignment") !== null
  && snapshot.findText("Primary dock vertical span (when bottom panel is open)") !== null
```

It needs those three Layout labels visible SIMULTANEOUSLY. Adding a row to the Scrolling
section plausibly pushed them out of the visible viewport.

Two possibilities, opposite fixes, and you must decide by opening Settings in a real PTY and
looking:

- **stale probe** — the three rows are still reachable (scroll, resize, or section
  navigation) and only this probe's assumption that they co-occupy one screen has broken.
  Then re-key it to reach them structurally: use the published settings/section geometry and
  scroll to each field, rather than requiring three labels in one frame.
- **app regression** — the Settings overlay cannot actually reach those rows at a normal
  terminal size any more. Then it is a real usability defect: a settings pane that grows
  until controls become unreachable is broken, and the fix is in the overlay's scrolling or
  section layout, not in the probe.

State the verdict with the frames that justify it. If it is the app, fix the app and leave the
probe alone — it did its job.

Note this is the THIRD instance tonight of a probe keyed to co-located copy breaking on a
legitimate layout change, and one of the earlier ones turned out to be masking a real defect
(a diff scrollbar with no theme colours, whose probe had been passing by matching unrelated
paint). So do not assume "stale probe" is the cheap answer — verify.

## Blast radius — enumerate, do not expand

Adding a settings row perturbs every probe that assumes settings-row positions or that a set
of labels shares one screen. Sweep for those and REPORT the list even where currently green.
Fixing them is out of scope (they are tracked as #143); naming them is required.

## Verification — quote exact exit codes

Both failing smokes 3x each, plus the settings-applied contract, `bunx tsc --noEmit`,
`bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, and the glide/scrollbar contracts you touched. Plant
a red for the new applied-effect drive and quote it — a drive that cannot fail proves nothing.
Never read `$?` after a pipeline.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class`, never
`Class`). Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the
tree clean.
