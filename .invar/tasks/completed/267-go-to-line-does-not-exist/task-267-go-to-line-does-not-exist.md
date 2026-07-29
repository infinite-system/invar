# 267 — go-to-line does not exist, and a task file assumed it did

State: COMPLETED — d1784f94 — Go-to-line built: Alt+G, shared painter prompt, clamped line:column, both jump ends recorded, 10+100k contract
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: architecture-hygiene

## Outline

#237's builder reported a premise gap: its task file said "verify find and
go-to-line still target the source pane" — and the app has no go-to-line
command, binding, or palette entry at all. The verification premise was
invented somewhere upstream (conductor error class: asserting a feature
into existence by referencing it).

Two deliverables:

1. BUILD go-to-line, the IDE staple: a command (`editor.goToLine`), a
   default binding (Ctrl+G), a small prompt through the shared single-line
   text-field painter (ONE painter law), accepts `line` or `line:column`,
   clamps to the document, records both jump ends for Back/Forward (the
   #35 jump convention), works at 100k lines.
2. The premise-gap lesson is the conductor's, already noted in the report;
   nothing else to document here.

## Invariants in scope

- The commands/keybindings records; the one-painter record
  (single-line fields); the navigation/jump records #35 cited.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-237-...md`, Bycatch 5.
