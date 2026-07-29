# 292 — a drive action's status completion must wait for its painted target

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: verification-integrity (bycatch of #278, dispositioned by #279)

## Outline

#278 recorded one exact miss: `settingsOpen=true` published BEFORE the
`Mirror activity bar on right` label painted, so the follow-up text
click missed. #279 proved this is a SEPARATE generator from the settle
registry: boot settlement evaluates `$settledStatusRules`, but action
status completion uses `awaitStatusWithoutFrame` — an interactable
status can complete without its painted target existing.

Fix shape: action completion for an interactable state must couple
state AND paint (the status plus the frame that makes it clickable).
The contract must not publish an interactable state before its
interactables paint. Do not widen any timeout.

Reproduction is intermittent (once in #278; #279's two follow-up
drives did not reproduce) — build the failing condition
deterministically (hold the paint, assert the click misses) rather
than retrying the race.

Possibly related observation (unproven): #281's round-1 gate red where
`status.settingsOpen === true` never published after a status-gear
click — different polarity (status never came vs status came early);
treat as separate unless diagnosis proves otherwise.

## Invariants in scope

- harness.invariants.md (drive settled-observations record, #279's
  refinement); the settings overlay records in ui.invariants.md.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- #278 completed report (the recorded miss); #279 report (generator
  split, two non-reproductions).

## Evidence from #299 (2026-07-29)

Merge-gate Drive.test.ts Markdown-settle captured a stale "Parsing
Markdown…" frame while status already reported markdownParsing=false —
status led the paint; exact same-tree rerun passed 11/11. This is this
record's defect class observed in the wild (status/paint ordering), not a
new one.
