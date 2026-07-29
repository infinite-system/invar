# 237 — markdown preview sits LEFT of the source by default and opens automatically

State: ACTIVE
Created: 2026-07-29
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
Priority: user-directed
Assignment note: User roadmap 2026-07-29. After #35; pairs with #236 (land the stylesheet first so what auto-opens is worth reading).

## Outline

Two user decisions, verbatim intent:

1. **Preview on the LEFT of the .md source by default**, with a setting to
   put it right for those who want it (`markdownPreviewSide: left | right`,
   default left). Reading is the primary act; the rendered view gets the
   primary position.
2. **Auto-open**: opening a .md file opens its preview automatically whenever
   the markdown plugin is enabled. Closing it stays possible; the split ratio
   setting already exists (`markdownSplitRatio`).

Constraints:
- The markdown plugin owns both behaviours (plugin-contributed setting per
  #100's manifest pattern) — the host learns nothing.
- Focus goes to the SOURCE pane on open (writing still works; reading is
  default-visible, not default-focused) — drive this explicitly.
- The find-source coupling: the app keys find-source off the document path
  (the editorArea.title lesson) — verify find and go-to-line still target the
  source pane with the preview on either side.
- Uninstalling the markdown plugin removes the auto-open behaviour with it —
  uninstall symmetry, reinstall arm included.

## Invariants in scope

- `src/modules/markdown/markdown.invariants.md` — the preview records.
- *Plugins contribute their own settings and keybindings* (#100's record).
- The layout records in `ui.invariants.md` that govern splits.

## Bycatch expected

Per AGENTS.md's taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- User goal message 2026-07-29 (~02:1x).
