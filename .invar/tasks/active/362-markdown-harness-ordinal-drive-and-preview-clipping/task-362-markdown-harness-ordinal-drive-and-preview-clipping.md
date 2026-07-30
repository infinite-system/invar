# #362 — markdown harness: ordinal settings drive and a preview clipping red

State: ACTIVE
Priority: verification-integrity
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #337 (two markdown-harness defects, 2026-07-30)

1. Same class as #337's deterministic red, still live:
   scripts/harness/smoke-markdown-harness.ts:2428 uses a bare
   driver.sendKeys('Up') then waits for settingsSelectedLabel ===
   'Preview side'. Any new Markdown setting registered between 'Preview
   side' and 'Scroll source and preview together' turns the smoke
   deterministically red (the #340 mechanism). Found by
   census-337-ordinal-settings-navigation.ts (in #337's folder), static
   finding, not driven. Repair: selectSettingByLabel or derive steps from
   settingsLabels.
2. Layout-under-load red seen at #337's gate attempt 1: hard assertion
   FAIL "preview row missing: alpha" at smoke-markdown-harness.ts:173
   (reached from 1464) — the dumped grid shows the preview pane narrower
   than its table, marker clipped to 'alph'. Standalone on the same tree:
   94 PASS twice. Load average 2.51, 6 pool workers. Same
   layout-under-load family as #359/#214 but a DIFFERENT smoke and an
   assertion, not a timeout — the gate does not retry it, so it hard-reds
   gates under load.

## Work

Fix 1 mechanically (label walk). For 2: find why the preview pane can lay
out narrower under load (real layout race vs harness geometry race), make
the assertion observe settled layout, and prove both polarities.
