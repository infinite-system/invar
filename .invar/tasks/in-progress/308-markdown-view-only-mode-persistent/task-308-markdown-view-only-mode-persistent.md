# 308 — markdown view-only mode: preview-only, toggle back, persists across .md files

State: IN-PROGRESS
Engine: codex
Effort: medium
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> also have a mode where md files are view only, no editor view (but
> must have toggle to show editor again, that setting should persist for
> other .md files you open in a row)

## Design

- A markdown VIEW-ONLY mode: opening a .md file shows ONLY the rendered
  preview — no editor pane for that document.
- The toggle (now on the breadcrumb row right side per #307 — build on
  or coordinate with that task; if #307 has not landed, put the
  behaviour behind the existing toggle position and let #307 move it)
  switches back to the editor view.
- PERSISTENCE: the chosen mode is a persisted setting — open a .md in
  view-only, close, open another .md: it opens view-only too. Toggle
  back to editor: subsequent .md files open with the editor again.
  Follow the settings persistence records (per-user settings file), and
  the smoke MUST use an isolated per-run HOME (mktemp) — never the real
  ~/.config/invar/settings.json.
- Both polarities: view-only shows no editor and (decide + record)
  editing keys do not mutate the document; editor mode restores full
  editing; persistence drives across a real close/reopen sequence AND
  across an app restart (settings file reread).
- Non-.md files never affected by the mode.

## Acceptance

PTY drive: toggle to view-only → open second .md → view-only; toggle to
editor → open third .md → editor; restart app → mode retained; both
scales for the preview render; settings writes isolated to temp HOME.
