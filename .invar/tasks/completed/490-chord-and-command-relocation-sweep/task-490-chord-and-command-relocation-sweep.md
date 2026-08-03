# Task 490 — plugin chords, commands, and labels move into their plugins

Priority: architecture-hygiene
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: COMPLETED — c343b38f — plugin chords and labels relocated; ShortcutHelp reads live layers

## In plain words

Core keybinding and command files still name plugin actions: terminal
chords, agent context bindings, the 'Agent' palette category, and
ShortcutHelp's hardcoded 'git'/'markdown' category maps and fallback
titles. The contribution context already has registerKeybindings and
commands; filetree, database, and lsp use them. Move the rest.

## Scope (census rows 2, 6, 11 — [report](../../completed/488-core-to-plugin-coupling-census/report-488-core-to-plugin-coupling-census.md))

- KeybindingDefaults/KeybindingPlatform/CommandDefaults: terminal.*
  chords + context union type naming plugin contexts (16 sites).
  Agent sites RELOCATE via #356, not here — coordinate, do not race.
- ShortcutHelp: category order, display-name map, command-title
  fallbacks — replaced by plugin-registered command metadata (7 sites).
- Cosmetic labels (row 11): 'Files' sidebar title from the dock
  contribution; language-id icon maps stay (weak coupling, lowest).

## Sequencing

After #356 lands or with explicit non-overlap; the census script
census-488-imports.ts + census-488-vocabulary.ts (completed 488
folder) re-run as the before/after measure.
