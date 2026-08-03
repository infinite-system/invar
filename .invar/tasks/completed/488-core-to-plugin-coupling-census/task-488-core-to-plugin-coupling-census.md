# Task 488 — census every place core still couples to plugins

Priority: architecture-hygiene
Engine: claude
Environment: any
Model: fable-5
Effort: medium
State: COMPLETED — c9cafd4f — coupling census: 115 vocabulary + 15 import sites, ranked, wave filed

## In plain words

We moved features (git, markdown, lsp, terminal, ...) behind the plugin
seam, but core files still know plugin names. ShortcutHelp.ts lists
'git' in a category order and hardcodes 'Toggle Git Panel'. Find every
such place, in both forms: direct imports AND vocabulary (command ids,
kind strings, labels, category names). Analysis only, no fixes.

## Wanted

A classified inventory: file, line, coupled plugin, coupling FORM
(import / command id / kind string / label / category), and the seam
that would remove it (contributor metadata, registry lookup, plugin-
declared labels). Rank by blast radius. This feeds the decoupling
wave: #356 (agent pane), chord relocation, search/settings surfaces.

## Known instances (seed, verify and extend)

- ShortcutHelp.ts: category order with 'git', display-name map,
  'git.togglePanel' label.
- Bootstrap.ts: 7 agent imports + createAgent wiring, toggleTerminal
  chord, startsWith('Terminal (Agent)') label matching.
- Bootstrap.ts: FindBar/QuickOpen/SettingsPanel constructed directly.
