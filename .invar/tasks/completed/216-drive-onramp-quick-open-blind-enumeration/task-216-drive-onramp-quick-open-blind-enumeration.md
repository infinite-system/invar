# 216 — drive's on-ramp cannot open its own file, and the empty scan reports complete

State: COMPLETED — 03b61df — Quick Open publishes degraded (never a false complete) with a recovery message; drive fixtures in system temp outside the ignored path; codex-ships-ripgrep caught by PATH surgery; one-sighting probed 3x, no repro, parked
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: verification-integrity

## Outline

Bycatch from #122, reproduced every time on an unmodified tree. Two defects, one
surface.

1. **The on-ramp is broken on this machine.** `bun run drive --open <FILE>` and
   `--size N` copy the target into `<repo>/tmp/drive/...` and open it through
   Quick Open. Quick Open enumerates with `rg --files`; ripgrep is not installed
   here, so it falls back to `git ls-files --cached --others --exclude-standard`,
   which returns EMPTY inside `tmp/` (`.gitignore` line 33 ignores it). Result:
   `quickOpenMatches=0` and a timeout waiting for the ranked file. The Rule Zero
   quickstart fails for every builder on this host.
2. **The deeper defect: an empty scan reports `state: 'complete'`.**
   `enumerateProjectFiles` returns complete with zero files, so the UI says
   "no matching files" when the truth is "this scan could not see anything".
   The cited invariant is *File enumeration failures stay visible*; an empty
   complete scan is exactly an invisible failure.

Fix direction is a design choice: put the drive scratch workspace outside the
ignored path, or make the empty-git fallback report `degraded` instead of
`complete`. Do the second regardless — it is the invariant. Positive control:
with rg absent and an ignored directory, the UI must say degraded, not empty.

Related, one sighting, not chased: `--key <letter>` after `Control+p` closed
Quick Open instead of typing into it (`quickOpenOpen=false`). Reproduce before
treating as real.

## Sources

- [report-122-editor-becomes-final-contributor.md](../122-editor-becomes-final-contributor/report-122-editor-becomes-final-contributor.md) in #122's folder, Bycatch.
