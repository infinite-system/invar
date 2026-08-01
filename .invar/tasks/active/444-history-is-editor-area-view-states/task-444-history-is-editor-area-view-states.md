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

## Open design question for the user, answer before implementing

Walking a 40-file changeset would push 40 entries and make back
useless for escaping the review. Options: coalesce consecutive diffs
within one changeset, or make the changeset the entry with the file
as sub-state. The conductor leans to the changeset-as-entry form.
Do not choose silently.

## Depends on

#442 renders the breadcrumb and history row in the editor area. This
task supplies what the arrows walk.
