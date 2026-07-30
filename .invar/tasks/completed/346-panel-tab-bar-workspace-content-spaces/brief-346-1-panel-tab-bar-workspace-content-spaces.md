# Brief #346 round 1 — the panel grows a tab bar of workspace content spaces

codex auto-reads [AGENTS.md](../../../../AGENTS.md). Load the invariants skill for governed code.

## The task

Read the task file in this folder FULLY — it carries the user's ten-point
spec assembled across several messages (tabs replace pane titles, spaces
are multi-pane containers, Database plugin appears as a space, count chip
with icon collapses the right pane list, per-pane close removed, rounded
pane frames removed for density, close control lives on the tab). Execute
the whole spec. #342 landed (task panes load; nested-shell smoke covers
them) — build on current main.

## Method — drive first, contract last

1. Drive the real app's bottom panel first: current titles, rounded
   frames, pane list. Iterate drive -> change -> drive per spec point.
2. Scale: tabs must stay correct as spaces are added/cycled; drive
   keyboard AND mouse paths.
3. The Database space rides the existing plugin registry (Database
   provider/consumer plugins) — no parallel mechanism.
4. Contract assertions AFTER each behavior is right; extend existing
   panel/panel-chrome smokes where possible, one new smoke only for the
   genuinely new tab-bar surface.

## Rules

- No merge-gate.sh by hand; no SKIP_GATE. Commit through the hook;
  GATE_EXIT=0 is part of DONE. Commit BEFORE writing READY — real hash
  and GATE_EXIT in the report header, never placeholders. Write your
  READY report into THIS folder in the main checkout (absolute path), not
  only your worktree copy.
- Known flaky classes: #214 panel-chrome, #359 panel-split, #362 markdown
  preview clipping, #371 git-watch. Name them if they bite; do not chase.
  #214/#359 live in the panel machinery you are CHANGING — if your change
  makes those smokes deterministic (better or worse), that is signal:
  report it loudly.
- Builders never push; the conductor lands.

## Invariants in scope

- Panel/layout records (src/modules/layout and src/modules/ui contracts
  touching panel cells, panel-chrome, dividers) and the plugins contract
  ([src/modules/plugins/plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md)) for the Database space.
  Answer record by record: upheld / violated / needs refinement, plus
  records this list missed. Removing pane titles and rounded frames may
  REFINE existing chrome records — propose wordings.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md) taxonomy; include ## Bycatch even if "None observed."
You are deep in the machinery #361 crashed in (panel teardown + terminal
buffer write) — if you see that shape, capture everything.

## Definition of done

READY report in this folder: driven evidence per spec point, gate chain,
invariants answered record by record, bycatch.
