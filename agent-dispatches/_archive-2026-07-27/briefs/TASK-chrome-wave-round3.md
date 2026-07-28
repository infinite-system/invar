# ROUND 3 — one red left: the third stale probe you already enumerated

Work ONLY in `/tmp/conductor-chromewave` (branch `feat-chrome-wave`, main already merged).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Append to
`/tmp/chrome-wave-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

Round 2 is ACCEPTED and is the best work of the night — do not redo any of it. In particular
the split verdict was exactly right: `agent-search` was a stale probe, and the diff scrollbar
was a REAL defect whose probe had been passing by matching unrelated right-edge paint. Finding
that is worth more than the green would have been.

## The one remaining red

Full gate on this branch (run `1477002`): a single failure.

```
smoke: agent-permissions harness
Timed out waiting for grid condition:
  snapshot.findText("bypass permissions on") !== null
```

You already enumerated this file in your own blast-radius census under "stale legacy copy,"
and correctly did not expand into it — the round-2 brief scoped you to two smokes. This round
is that expansion, for this one file only.

Cause: the footer previously contained the long-form literal `bypass permissions on`; the
user-requested reduction shortened it to `perm: bypass`.

## CRITICAL — do not conflate this with the other agent-permissions problem

There is a SEPARATE, tracked defect (#109) in which `agent-permissions` flakes intermittently
INSIDE the serialized quiet tail on clean main. That one is a race in the permission-resolution
path: `AgentSession.resolvePermission()` changes a visible entry and bumps `renderRevision`,
and it flakes where nothing else is running, so contention is already excluded by design.

**These are different defects.** Yours is a stale literal in a probe. Fixing yours does not fix
#109, and #109 is NOT yours to fix in this round. If you happen to observe evidence bearing on
it while driving, report it separately and clearly labelled — do not merge the two stories.

## The fix

Apply the rule your round 2 established, not a re-key: locate the permission state through its
**semantic owner or published status**, not through rendered copy. Re-keying to the new
`perm: bypass` string just reschedules this exact failure the next time the footer text
changes — which it will, because the user is still iterating on that line.

Follow your own round-2 templates: resolve glyphs via `ThemeIcons`, take geometry from the
published `panelHeadingGeometry` / panel viewport / heading `contentId`, and scan only the
structurally owned row.

**Decide probe-versus-app by driving first**, per smoke, as you did in round 2 — do not assume
"stale probe" because it is the cheap answer. Round 2 proved one of these three was a real app
defect hiding behind a lucky pass. Open the agent pane, look at the permission state, and say
which it is with the frame that justifies it.

Plant a red and quote it. A probe rewritten until it passes is not a probe.

## Scope discipline

ONLY `agent-permissions`. The other seven probes in your census are tracked as #143 and are
deliberately out of scope — do not expand. If closing this one makes an adjacent one trivially
correct, say so in the report rather than doing it.

## Verification — quote exact exit codes

The `agent-permissions` smoke 3x, plus `bunx tsc --noEmit`, `bun test`,
`bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`. One verification pass at the end. Never read `$?`
after a pipeline.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class`, never
`Class`). Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the
tree clean.
