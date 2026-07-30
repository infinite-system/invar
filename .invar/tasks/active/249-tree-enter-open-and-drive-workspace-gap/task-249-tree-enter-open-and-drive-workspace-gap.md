# 249 — two drive-path gaps that cost every builder a wrong turn

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: instrument-integrity

## Outline

Two recurring gaps, each independently reported by four or more builders
(#122, #218, #219, #220, #35), never filed as their own task until now:

1. **Enter on a freshly opened directory workspace does not open the
   selected tree row** — focus starts on the editor, so the first Enter goes
   nowhere visible. Every builder's first drive loses a turn to it. Diagnose
   whether this is a focus-default defect (should a directory open focus the
   tree?) or a documentation gap; fix the one it is. Either way [drive.md](../../../../scripts/harness/drive.md)
   must say what the first keystroke into a fresh directory workspace does.

2. **`bun run drive --size N` cannot open the file it creates** — ripgrep is
   absent in builder environments, Quick Open falls back to `git ls-files`,
   and `.gitignore` hides `tmp/`. Every builder works around it with
   self-made workspaces + `git init`. Candidate fixes: the drive tool
   creates its scratch file inside a git-tracked scratch workspace; or the
   fallback enumerates untracked-but-not-ignored files; or drive documents
   the one honest workaround. #216 (degraded enumeration) already made the
   fallback state itself — build on that, do not re-diagnose it.

Done-test: a fresh builder following [drive.md](../../../../scripts/harness/drive.md) alone reaches an open scratch
file at --size 100000 with zero wrong turns; both fixes carry a driven
positive control.

## Invariants in scope

- [drive.md](../../../../scripts/harness/drive.md) / the drive tool's records; Quick Open's degraded-enumeration
  record from #216; filetree focus records if arm 1 is a defect.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- [report-35-structure-navigator-plugin-pane.md](../../completed/35-structure-navigator-plugin-pane/report-35-structure-navigator-plugin-pane.md), Bycatch items 5 and 6, and
  the matching notes in #218/#219/#220/#122 reports.
