---
name: context-usage
description: >-
  Read the conductor's own live context size mechanically — the speedometer.
  Use when you need the current context percentage, when a CTX or CHECKPOINT
  event names a number you want to re-verify, or when calibrating the gauge
  against the UI. The gauge is scripts/context-usage.sh; fleet-watch rides it
  on every event batch and fires CHECKPOINT at 85% (ANCHOR PROTOCOL trigger).
---

# Context usage — the conductor's speedometer

One command:

```bash
bash scripts/context-usage.sh
```

Output, one machine-parseable line:

```text
CONTEXT_TOKENS=<n> RAW_PCT=<n>% COMPACT_PCT=<n>% (UI gauge) FILE=<transcript>
```

## How it works

- Ground truth: the LAST assistant message's usage block in the newest
  session transcript (`cache_read + cache_creation + input`). No estimate.
- Budget is DERIVED, never hardcoded: `CONTEXT_BUDGET_TOKENS` override →
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (exported by the harness into every Bash
  call; adapts when the user changes the setting) → 400k last-resort fallback.
- `COMPACT_PCT` matches the UI gauge: it runs against the usable window
  (budget minus the autocompact reserve). The reserve default is 36k,
  calibrated 2026-07-29 (script 86.4% raw when the UI read 95%). Override:
  `CONTEXT_COMPACT_RESERVE_TOKENS`. Recalibrate if the UI visibly drifts.
- The transcript directory defaults to the conductor's project dir
  (`~/.claude/projects/-home-parallels-dev-ibr`); override with
  `CONTEXT_PROJECT_DIR`, or pass an explicit transcript path as `$1`.

## Who consumes it

- **fleet-watch** (`scripts/fleet/fleet-watch.sh`): rides one `CTX:` line on
  every event batch, and fires `CHECKPOINT:` once per crossing of
  `CHECKPOINT_PCT` (default 85) — the trigger for the ANCHOR PROTOCOL
  (conductor skill, `project.conductor.md` family 0).
- **The conductor at loop ticks**: run it whenever a decision depends on
  remaining runway; anchor BEFORE ~85%.
