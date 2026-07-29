# 287 — the preview collapses task-header lines into one line

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: USER-DIRECTED (2026-07-29 12:1x)

## Outline

User report: a task file's header block —

    State: ACTIVE
    Created: 2026-07-29
    Engine: codex
    ...

renders as ONE joined line in the markdown preview. CommonMark does join
single-newline lines into a paragraph — but these files are the app's own
first-class content now (walkable views, #276), and a Key: value stack
must READ as a stack. Decide the mechanism honestly and record it:

- soft-break-as-line-break rendering mode (GitHub-comment style) for the
  preview, OR
- recognize consecutive `Key: value` lines as a definition-list-like
  block, OR
- another principled rule.

Whatever the rule, it must be a RECORDED renderer semantic (markdown
record), not a task-file special case; normal prose paragraphs must
still reflow (both polarities: header stack stays stacked, prose joins).

## Invariants in scope

- The markdown renderer/stylesheet records (#236's family); the split
  record untouched.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- User message 2026-07-29 12:1x.
