# Brief — #264: a boot-time save erases stored contributed settings (DATA LOSS)

Read first: `.invar/tasks/in-progress/264-settings-eraser-boot-save/task-264-*.md`
(full mechanism, suspects, and fix candidates).

One paragraph: seed an isolated home's `settings.json` with
`{"markdownPreviewSide":"right"}`, boot — the app resolves `left` and
REWRITES the file, erasing the key. A save fires BEFORE plugin activation
registers contributed settings, and `persistenceSnapshot()` drops every
unregistered key. Named suspect: the write-back save at
`src/modules/app/Bootstrap.ts:638`. Every contributed setting is lost on
any boot where that save fires first.

Diagnose, then fix at the generator. Candidate 1 is likely the invariant:
**a settings store never deletes what it does not understand** —
`persistenceSnapshot()` round-trips unknown keys verbatim (also
forward-compatible across versions). Candidate 2 (no save before
activation completes) is fragile against late plugins — reject it with
evidence or take it only in addition.

NEVER touch the user's real `~/.config/invar/settings.json`. All
reproduction in a per-run `mktemp` HOME (`env HOME=$TMP`), per the
isolate-persisted-home rule.

Positive control both polarities: seed → boot → quote the surviving file;
revert the fix → quote the erasure returning. Add the round-trip-unknowns
record with a driven check.

Reproduction starter: `probe-237-narrow-resize-settle.ts` in #237's
completed folder (STATUS and USERFILE lines); #233's completed report has
the snapshot-rewrite evidence.

## Invariants in scope

- `src/modules/settings/*.invariants.md` — NEW round-trip-unknowns record;
  the contributed-settings convention from #222/#100.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## End state (mechanical)

READY report in the task folder with the diagnosis, the chosen generator
fix, both positive-control quotes, and green `bun test` + the settings
smokes; full merge-gate NOT yours to run (the conductor gates at landing).
