# Brief — #308: markdown view-only mode, persistent across markdown files

Read first: [task-308-markdown-view-only-mode-persistent.md](task-308-markdown-view-only-mode-persistent.md)
— USER-DIRECTED; verbatim words govern. Build on CURRENT main: #299
landed the shared input primitive, the nitpick bundle may land #307
(toggle on breadcrumb row right) while you build — coordinate via
merge, do not duplicate the toggle.

Arms (all in the record): preview-only mode for markdown files (no editor pane);
toggle returns the editor; the mode is a PERSISTED setting applying to
subsequently opened markdown files and across app restart; non-markdown files
never affected; view-only editing-keys decision recorded.

HARD RULES: settings smoke uses per-run mktemp HOME (never the real
~/.config/invar/settings.json); full gate through the enforcing hook,
no SKIP_GATE commits; both polarities per arm per the record.

## Invariants in scope

markdown/preview records, settings persistence records, editor
lifecycle records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: mode + toggle + persistence driven across close/reopen
AND restart, temp-HOME isolation, GATE_EXIT=0 through the hook. The
conductor gates at landing.
