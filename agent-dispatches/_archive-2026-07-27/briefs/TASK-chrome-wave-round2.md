# ROUND 2 — your layout change broke two probes. Prove which, then fix the right thing.

Work ONLY in `/tmp/conductor-chromewave` (branch `feat-chrome-wave`, currently at `23102b6`,
main already merged in). Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete.
Append to `/tmp/chrome-wave-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

Your round-1 work is ACCEPTED — the three surfaces, the frame captures, the six positive
controls, and the invariant-record updates all stand. Do not redo them. Two smokes you did
not run are red, and they are red because of your change.

## What I measured (build on this; do not re-derive)

`SKIP_PERF=1 INVAR_GATE_WORKERS=3 bash scripts/merge-gate.sh` on this branch: **two hard
reds, each retried once and failed again.** Logs preserved in
`/tmp/merge-gate-failures.1327127/`.

**1. `smoke: agent-search harness`**

```
Timed out waiting for grid condition: the themed search icon paints in the agent engine mode line
│  claude ⇄ · perm: bypass ·  ⌕                                                   │
```

Read that carefully: **the captured frame CONTAINS `⌕`.** The glyph paints. The predicate
still failed. Before your change the line read `engine: claude ⇄ · follow: o…`; you reduced
it to `claude ⇄ · perm: bypass · ⌕`, which was the correct response to the user's overflow
complaint. The `engine:` and `follow:` labels are gone.

**2. `smoke: scrollbars harness`**

```
Timed out waiting for grid condition: the diff pane vertical thumb is painted before frame collection begins
```

You reclaimed the diff view's hidden tab row, so diff pane content moved up one row.

Note this was already a KNOWN RISK, flagged and dated in task #105:
`scripts/smoke-agent-search.sh:66` hardcodes `⌕` via `characters.indexOf("⌕")`, which finds
the FIRST occurrence in the frame. It was flagged as "an appearance dependency of exactly
the class that re-broke twice during the icon vocabulary work." Your footer may now
introduce a second `⌕`, which would make `indexOf` resolve to the wrong one.

## Job 1 — establish WHICH failed, the probe or the app. Do this before any edit.

Two possibilities, and they need opposite fixes:

- **the probe is stale** — it locates its target by a label or a row position you legitimately
  changed, while the user-visible behaviour is correct;
- **the app is wrong** — e.g. reclaiming the tab row genuinely broke diff pane geometry so
  the thumb really is missing or misplaced.

**Decide by DRIVING the real user path**, not by reading the predicate. Open the diff view
and look at the thumb. Open the agent pane and look at the search affordance. Report the
frames. If the user-visible behaviour is right, the probe is stale; if it is wrong, you have
a real defect and the probe was correct to fail.

State the verdict for each smoke separately. They may differ.

## Job 2 — fix accordingly

**If a probe is stale:** re-key it to something STRUCTURAL, not to your new labels. Swapping
`engine:` for `perm:` just moves the dependency and it will break on the next legitimate
copy change. Locate the line by its owner or its semantic role; locate the glyph through the
theme vocabulary (`ThemeIcons`) rather than a hardcoded literal; find the row by what owns
it rather than by an offset. While you are there, close the `characters.indexOf("⌕")`
appearance dependency at `smoke-agent-search.sh:66` — reading the vocabulary is the fix
named in #105.

**If the app is wrong:** fix the app and leave the probe alone. It did its job.

Either way the assertion must still be able to FAIL. Quote a planted red for each smoke you
touch. A probe rewritten until it passes is not a probe.

Do NOT widen a timeout, and do NOT delete or weaken either assertion to get green. If you
believe an assertion has genuinely been retired by the design change, say so and leave it —
retiring a contract is the conductor's call, not yours, and mid-change you may be wrong.

## Job 3 — name the rest of the blast radius

This is the durable part. A layout change invalidates **every** probe that locates by
position or by label text, and that set is larger than the set of files you edited. Two
found each other by accident tonight; there may be more.

Sweep the harness and smoke scripts for probes that depend on things you moved: the agent
footer's text, the panel heading controls, the diff toolbar row, the reclaimed tab row.
Report the list even where the probe currently passes — a probe that passes by luck is next
week's red. Fixing them is optional and secondary; ENUMERATING them is required.

## Verification — quote exact exit codes

Both failing smokes 3x each, plus `bunx tsc --noEmit`, `bun test`,
`bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`. Never read `$?` after a pipeline.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class`, never
`Class`). Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the
tree clean.
