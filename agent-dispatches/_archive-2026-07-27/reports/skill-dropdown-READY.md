# READY — Skill dropdown YAML descriptions and one-row ellipsis (#127)

Worktree: `/tmp/conductor-skillyaml`

Branch: `fix-skill-dropdown-yaml`

Base: `318fdf1`

Commit: `de892f02ff97911dd489d1dc9e058f0d097cd9d4`

## Result

- `AgentPromptResolver` now reads the `description` scalar from skill
  frontmatter instead of treating its header line as the whole value.
- Supported forms are plain, single-quoted, double-quoted (including escaped
  quotes), folded `>`, and literal `|`, with strip/clip/keep chomping and
  explicit indentation digits in either YAML modifier order.
- Folded values join ordinary continuation lines; literal values retain their
  newlines. Missing and empty descriptions remain empty.
- `AgentSkillPopup` collapses description whitespace at the one-row label
  boundary, keeps `/name` intact, and ellipsizes only the description.
- Popup width comes from `BoundedListPopup.layoutGeometry` and its extracted
  `desiredBoxWidth` authority. Truncation reuses `WrapText.clipToWidth`; no
  `String.length` width proxy was added.
- `WrapText.clipToWidth` now excludes a whole two-cell grapheme that would
  straddle its cutoff, so wide and astral glyphs cannot make a clipped row
  exceed its display-cell budget.
- No YAML dependency was added. No other frontmatter reader exists in the
  repository, so the explicit one-field reader extends the existing
  `AgentPromptResolver` seam rather than creating a second reader.
- No file under `src/modules/editor` was changed.

## Positive control

The permanent PTY smoke was first pointed at a fixture skill with:

```yaml
description: >-
  Reactive substrate guidance with wide glyphs
  continued on the next line
```

Against the pre-fix parser, the run exited `1` at:

`FAIL block scalar indicators never reach rendered popup rows`

This proves the `>-` assertion can fail and that the fixed green is not a
pass-only instrument.

## Coverage

- Resolver unit coverage includes plain, folded, literal, `-`/default/`+`
  chomping, explicit indentation, both quote forms, an escaped double quote,
  an escaped single quote, missing, and empty descriptions.
- Popup unit coverage asserts the `>-` continuation text reaches the label,
  the indicator does not, literal whitespace becomes one row, `/name` stays
  intact, and a wide/astral long description ends in `…` within the popup's
  display-cell budget.
- The real PTY catalog uses both `>-` and `|-` fixtures. After typing `/`, it
  asserts from emulator frame cells that no popup row contains either
  indicator, the known long description ends in `…`, and every visible item
  row remains inside the popup border.
- Exact coverage increases were appended to `project.coverage-deltas.md` in
  counted grammar for all five changed test/smoke files.

## Verification

All required post-commit checks ran against the committed bytes.

| Verification | Exact exit code | Result |
| --- | ---: | --- |
| `bun install --frozen-lockfile` | 0 | dependencies installed |
| `bunx tsc --noEmit` | 0 | clean |
| `bun test` | 0 | 1,627 pass, 0 fail, 27,087 expectations |
| `bash scripts/conventions-gate.sh` | 0 | `conventions-gate: PASS` |
| invariant checker `--all --refs` | 0 | 859 annotations, 45 links, 0 problems |
| `bun scripts/check-coverage-ratchet.ts` | 0 | 307 files, no undeclared decrease |
| skill popup PTY smoke, run 1 | 0 | `ALL-PASS` |
| skill popup PTY smoke, run 2 | 0 | `ALL-PASS` |
| skill popup PTY smoke, run 3 | 0 | `ALL-PASS` |
| pre-fix positive control | 1 | expected red on rendered `>-` |
| `git diff --check` | 0 | clean |

## Handoff state

- `scripts/merge-gate.sh` was not run.
- Nothing was pushed, merged, tagged, deleted, or branched.
- The repository worktree is clean after the commit and post-commit
  verification.
- COMPACTION: none.
- conventions @ `e0476d687c354daac606ba45d688d4ad467b81dc`
