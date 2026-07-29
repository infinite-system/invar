# 212 — markdown smoke's copy/paste phase times out on source-focus wait at 100k lines

State: ACTIVE
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: flake-evidence

## Outline

Bycatch from #174 (one sighting, not rerun). While validating the revision-convergence
fix at the smoke's ~100,000-line generated Markdown fixture, the task-relevant stages
all passed, but the LATER copy/paste phase timed out waiting for
`the Markdown source pane is focused with a published buffer revision`.

Steps to the sighting: scale the existing section loop, run the full Markdown smoke,
complete preview selection and Ctrl+C, then wait for source focus before paste.

Outside #174's fixed scope (revision wait before table assertions). First question,
per the wait doctrine: is the focus condition reachable at that scale, or does the
focus transfer race the 100k re-publish the same way the table assertions raced the
initial parse? Same smoke, same wait family — check whether the #174 fix's
revision-convergence pattern simply needs applying at the copy/paste seam too.

## Sources

- `/tmp/174-markdown-preview-omits-ragged-table-READY.md` — Bycatch section
  (copied into `.invar/tasks/completed/174-.../` at #174's landing).
