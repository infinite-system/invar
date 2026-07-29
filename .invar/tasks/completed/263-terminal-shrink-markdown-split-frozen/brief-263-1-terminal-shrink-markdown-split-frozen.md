# Brief — #263: a terminal shrink never re-lays-out the markdown split until a mouse event

Read first: `.invar/tasks/in-progress/263-terminal-shrink-markdown-split-frozen/task-263-*.md`.

One paragraph: open the preview via Ctrl+Shift+V (no click anywhere),
shrink 120x40 → 60x25 — the panes keep wide widths indefinitely
(`MarkdownSplitView.tick` sees `rootRenderable.width` pinned through 460
ticks) and the preview runs off-screen. ONE mouse event on the source pane
or divider BEFORE the resize makes the same shrink settle; a click on the
preview does not. Something in the resize path arms only after a pointer
event crosses the app — find that generator (hit-region registration? lazy
layout subscription?), fix it, and RESTORE the terminal-shrink coverage
#237 removed from the markdown smoke (a debt this task repays).

Evidence has ACCUMULATED since filing — read all three:
- #237's probes (committed in its completed folder):
  `probe-237-narrow-resize-settle.ts`, `probe-237-narrow-resize-handshake.ts`.
- #238 round 3 hit the INVERSE in the markdown smoke: the split keeps a
  stale narrow CONTENT viewport when the editor column GROWS back — it
  worked around it with a preview remount through the user's toggle
  (`smoke-markdown-harness.ts`, see the round-3 report). If your generator
  fix makes that remount unnecessary, REMOVE the workaround and say so.
- #264's report reproduced the shrink-freeze twice more on main.

Sibling suspect, same family (task #260 exists — do not fix, but report
if one diagnosis explains both): the FIRST pointer click of a drive
session lands nowhere; pointer-armed lazy state is the common smell.

Never widen a timeout; a wait must be a condition. Positive control: the
restored terminal-shrink smoke arm must fail with your fix reverted.

## Invariants in scope

- The ui layout/resize records (geometry aggregates, #217's family); the
  markdown split record; the settled-frame contract if touched.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## End state (mechanical)

READY report in the task folder: the generator named with evidence, the
fix, the RESTORED shrink coverage green + positive control, the #238
remount workaround removed-or-justified, green `bun test` + markdown and
layout smokes. The conductor gates at landing.
