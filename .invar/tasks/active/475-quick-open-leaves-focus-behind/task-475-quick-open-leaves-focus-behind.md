# Task 475 — Quick Open can leave focus on the previous pane

Priority: flake-evidence
State: ACTIVE
Engine: codex
Environment: any
Model: 5.6-sol
Effort: medium

## Evidence (builder bycatch, #471, 2026-08-03 — reproduced ONCE)

From a focused Git pane: `Control+p`, type `root.txt`, `Enter` opened the
file but `workspaceSet.active.focus` stayed `git`. The following `End` and
typed `x` did not dirty the document. Driven through the real PTY.
Reproduced once in the first Git smoke run; the builder's contract now sends
a real `Tab` gesture and waits for `focus=editor` before editing, so the
smoke no longer exercises the suspect path.

## Reading

Opening a file through Quick Open should focus the editor. If focus can stay
on the launching pane, every keyboard-after-open flow is a coin toss. One
reproduction only: treat as a hypothesis; reproduce by driving BEFORE
diagnosing (drive-pty loop; graph path `workspaceSet.active.focus` is now
live thanks to #471).

## Verification

A driven reproduction recipe first; then the fix; then a permanent smoke
asserting focus lands on the editor after a Quick Open open.
