# 289 — preview scroll syncs with editor scroll (setting, default ON)

State: IN-PROGRESS
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: USER-DIRECTED (2026-07-29 12:2x)
Sequencing: AFTER #286 lands — consumes its source<->preview position map.

## Outline

User: scrolling the editor scrolls the preview in step (and the setting —
default ON — turns it off for zero-distraction reading).

Design decided with the user:
1. **Leadership rule (the generator):** the pane receiving user input is
   the LEADER; the other follows; a programmatic follow NEVER triggers a
   follow back. This kills the feedback loop and makes bidirectional
   sync safe (preview-led scrolling moves the source when the preview is
   what the user is scrolling).
2. **The map is #286's:** source-line <-> rendered-block mapping built
   for TOC-jump follow; scroll-sync is its continuous consumer. Do not
   build a second map (seam law).
3. **Setting:** `markdownPreviewScrollSync`, default true, contributed
   (round-trips by #264's law). OFF = both panes scroll independently.
4. Approximate mapping is acceptable between anchors (interpolate within
   blocks); exactness at headings.

Verify by DRIVING: wheel the editor through a long doc — preview tracks
(assert at three depths); wheel the preview — source tracks; toggle OFF —
independence both directions (both polarities); jumps (#286) still land
reading-position. Positive control: break the follow direction, red.

## Invariants in scope

- The markdown split record (#286's map + sync seam); settings records;
  the leadership rule becomes a recorded component.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- User message 2026-07-29 12:2x; [#286](../286-toc-click-drives-preview-scroll-into-view/task-286-toc-click-drives-preview-scroll-into-view.md).
