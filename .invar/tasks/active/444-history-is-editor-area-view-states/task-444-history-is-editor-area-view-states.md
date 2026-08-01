# Task #444 — history is a sequence of editor-area view states

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: ACTIVE

## In plain words

Back and forward should take you where you were. Right now the app
only remembers files you opened. So if you looked at a code change,
then opened a file, back skips the change as if you were never there.
Anything that fills the main area should be a place you can walk back
to, and each part of the app should be able to say "I am a place"
without knowing about the other parts.

## What

History records FILE OPENS. That is one kind of view state, not the
general case. Every editor-area view is a place the user was:

- a file in the text editor
- a git diff (the changeset and the file within it)
- a markdown preview
- other editor-area views as they appear

Views that are NOT places: panels and docks (side surfaces the user
opens beside their work, not places they navigate to).

## The decoupling requirement (user-stated)

Git, editor, and markdown must PLUG INTO history without history
knowing about them and without them knowing about each other. One
registration seam, contributors on both sides. History owns the
sequence. A contributor owns how to describe and how to restore its
own state.

## Settled: every diff is its own entry

USER RULING 2026-08-01: keep it simple. A diff pushes a history entry
exactly like a file open. No coalescing, no changeset-as-container,
no special case for review. Walking 40 files pushes 40 entries, and
that is correct: each one is a place the user was.

The conductor proposed changeset-as-entry and the user rejected it.
Do not reintroduce it. If back-out-of-a-long-review becomes a real
complaint later, that is a NEW observation with its own evidence, not
a reason to add the container now.

## Depends on

#442 renders the breadcrumb and history row in the editor area. This
task supplies what the arrows walk.
