# Brief 490-1 — plugin chords, commands, and labels move into their plugins

## In plain words

Core keybinding and command files still name plugin actions and
labels: terminal chords, ShortcutHelp's 'git' category maps and
fallback titles, and the context union type naming plugin contexts.
The contribution context already carries registerKeybindings and
commands — filetree, database, and lsp use them. Move the rest, so
core stops knowing plugin vocabulary.

## Reproduce by DRIVING first

Drive the app (drive-pty skill, warm server in your worktree). See
the surfaces you will relocate: the shortcut help overlay (its
category order and titles), terminal chords working, the command
palette's plugin commands. They must behave identically after.

## Your map

[The #488 census report](../../completed/488-core-to-plugin-coupling-census/report-488-core-to-plugin-coupling-census.md)
rows 2, 6, 11. AGENT sites are NOT yours: #356 relocates them in
flight — touch no agent identifier; if a shared line must move, note
it for the conductor instead of racing.

- KeybindingDefaults/KeybindingPlatform/CommandDefaults: terminal.*
  chords move into TerminalPlugin's registerKeybindings; the context
  union type stops naming plugin contexts (widen or derive it).
- ShortcutHelp: category order, display-name map, and command-title
  fallbacks come from registered command metadata; plugins register
  the missing titles.
- Row 11 cosmetics: 'Files' sidebar title from the dock contribution.
  Language-id icon maps STAY (weak coupling, out of scope).

Re-run the census scripts (same folder) before and after: rows 2/6/11
counts must fall to zero except sanctioned sites; put both numbers in
the report.

## Invariants in scope

- Bindings are intent addressed; Focus owns the keystroke
  ([src/modules/keybindings/keybindings.invariants.md](../../../../src/modules/keybindings/keybindings.invariants.md)).
- The terminal is a runtime plugin ([src/modules/terminal/terminal.invariants.md](../../../../src/modules/terminal/terminal.invariants.md)).
- The composition graph reaches every installed contributor
  ([src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md)).
Answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh. Commit on your branch; READY report
in the task folder. Locking smokes at the END (chords + shortcut help
render identically).

Commit note: the pre-commit hook auto-runs the full gate; use the
documented SKIP_GATE=1 bypass on your branch commits (the conductor
gates the combined tree at landing).
