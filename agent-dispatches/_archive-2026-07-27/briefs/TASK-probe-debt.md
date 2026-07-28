# TASK — #143: eight probes keyed to retired copy or fixed rows

Work ONLY in `/tmp/conductor-probedebt` (branch `fix-probe-structural-keys`, off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/probedebt-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

## Why this is not cosmetic

These eight were enumerated by a census during the chrome-wave work and deliberately left. Two
things since then say they are load-bearing debt, not tidiness:

1. **A probe in this same family was PASSING FOR THE WRONG REASON.** `smoke-scrollbars-harness`
   matched unrelated right-edge paint and called it the diff scrollbar — so `DiffView`'s scrollbar
   sliders had never been given theme colours and nobody knew. It surfaced only when a layout
   change perturbed the coincidence. Any probe below may be hiding the same kind of defect.
2. **`smoke-agent-permissions-harness` already hard-failed** on exactly this cause (waiting on the
   retired literal `bypass permissions on`), blocking a landing until it was repaired.

So the job is not "make them robust for later". It is "find out what they are currently failing to
check."

## The eight

AGENT-FOOTER, currently green but copy-coupled:
- `scripts/harness/smoke-agent-pane-ux-harness.ts` — finds `perm: bypass` AND assumes the border is
  the following row (copy + positional).
- `scripts/harness/smoke-terminal-follow-harness.ts` — finds `perm:`, excludes `follow:`.
- `scripts/harness/smoke-agent-engine-switch-harness.ts` — finds global `claude ⇄` / `codex ⇄` text
  before checking panel bounds.

AGENT-FOOTER, already stale on retired long-form labels:
- `scripts/smoke-agent-pane-ux.sh`
- `scripts/smoke-agent-engine-switch.sh`
- `scripts/smoke-agent-permissions.sh`

DIFF-TOOLBAR / POSITIONAL:
- `scripts/harness/smoke-diff-overview-harness.ts` — literal `↑`/`↓` glyphs plus a fixed
  `trackTop = 2`.
- `scripts/smoke-diff-overview.sh` — hardcodes toolbar rows 3/4 plus a workspace offset and searches
  textual `Next`.

## Method, per probe — this order matters

1. **Run it. Record pass/fail as it stands.** A currently-failing one is a different job from a
   currently-passing one.
2. **Decide by DRIVING whether it is actually checking the property it claims.** For each, ask: if
   the behaviour it names were broken right now, would this probe go red? The scrollbar case proves
   that "green" does not answer this. Where you can, plant a break in the BEHAVIOUR and see whether
   the probe notices — that is the only honest test of a probe.
3. **If a probe is not checking its property, say so loudly and fix what you find.** A real defect
   found here is the most valuable outcome of this task, more than eight tidy re-keys.
4. **Re-key structurally.** Locate by owner or published state — `ThemeIcons` for glyphs, published
   `panelHeadingGeometry` / panel viewport / heading `contentId` for geometry, status keys for
   state. The chrome-wave round-2 repairs are the template; copy that shape.
   **Re-keying to the NEW copy string is forbidden** — it reschedules the identical failure, and the
   footer text is still being iterated on.
5. **Positive control per probe you touch**, quoted. A probe rewritten until it passes is not a
   probe.

## On the four `.sh` files specifically

Several are in the gate-skipped `*_full_tmux_smoke` class (#105) — which is why they rotted
unnoticed. For each, first check whether its harness twin already covers the same property as a
superset. **If so, retiring the shell duplicate is the better answer than repairing it**: declare it
in the coverage ratchet with the reason and PARK the file (repo rule — never delete). Repairing a
duplicate that the gate never runs buys nothing.

State a verdict per file: repaired, retired-and-parked, or left with a reason.

## Scope

These eight only. Do not expand into other probes even if you spot them — enumerate those instead,
as this census did for you.

## Verification — quote exact exit codes

Every probe you touched 3x, plus `bunx tsc --noEmit`, `bun test`,
`bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`. Never read `$?` after a pipeline.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class`, never `Class`).
Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
