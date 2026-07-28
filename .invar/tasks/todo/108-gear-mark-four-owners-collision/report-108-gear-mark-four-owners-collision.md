# READY — #108 (distinct shell-script and YAML marks proposal)

Commit: `a6c50ba78a63eb8dc9b0e3f3fdb2d5941f293382`

The committed diff changes only
`src/modules/theme/theme.invariants.md`. It does not change the shipped
vocabulary or application appearance.

## Current `⚙` owners

Measured from source with
`ThemeIcons.Class.markOwnersFor('⚙')`:

| Mark | Owner | Collision in a classified-mark column |
| --- | --- | --- |
| `⚙` | `activity: Settings` | No; activity chrome |
| `⚙` | `the status-bar settings affordance` | No; status chrome, same settings meaning |
| `⚙` | `symbol class: shellScript` | Yes; the file-tree, breadcrumb, and completion mark column |
| `⚙` | `symbol class: configuration` | Yes; the same column as `shellScript` |

The measured owner count is four. `shellScript` and `configuration` are the
two colliding owners: `.sh` and `.yaml` rows paint the same mark in the same
column.

## Candidate pairs

The existing verified Nerd Font marks remain `U+F489` for shell scripts and
`U+E6B2` for configuration. Each candidate is a Unicode-tier pair; every pair
degrades to `$` and `:` at the ASCII tier. None is in the Geometric Shapes
block, present in the source-derived ownership table, reserved by the editor
mark table, or in the activity row `≡ ⑂ ⌕ ⚙ ⧫`.

| Pair | Shell-script mark | YAML/configuration mark | Reading |
| --- | --- | --- | --- |
| A | `$` — `U+0024 DOLLAR SIGN` | `:` — `U+003A COLON` | Unix shell prompt and YAML key/value delimiter; both are also exact ASCII fallbacks. |
| B | `⌘` — `U+2318 PLACE OF INTEREST SIGN` | `☷` — `U+2637 TRIGRAM FOR EARTH` | Command and a strong three-row settings-list shape; trades against Mac/trigram associations. |
| C | `⏵` — `U+23F5 BLACK MEDIUM RIGHT-POINTING TRIANGLE` | `≔` — `U+2254 COLON EQUALS` | Run and key/value assignment; broader and less familiar than shell/YAML specifically. |

## Width-agreement measurement

The instrument used the app authority,
`EditorCoordinates.lineWidth`, and the independent terminal authority,
`@xterm/headless` through `TerminalEmulator`. Exact output:

```text
control 漢 U+6F22 app=2 xterm=2
pair A shell $ U+0024 app=1 xterm=1
pair A config : U+003A app=1 xterm=1
pair B shell ⌘ U+2318 app=1 xterm=1
pair B config ☷ U+2637 app=1 xterm=1
pair C shell ⏵ U+23F5 app=1 xterm=1
pair C config ≔ U+2254 app=1 xterm=1
nerd shell  U+F489 app=1 xterm=1
nerd config  U+E6B2 app=1 xterm=1
```

The `漢` control measured two in both authorities, proving the run could
report a non-one-cell result. Every proposed mark measured one in both.

## Recommendation

Accept Pair A: `$` for shell scripts and `:` for YAML/configuration. It names
the families through syntax users already see in those files, has no
platform-specific reading, uses no font-dependent code point, and preserves
its meaning unchanged at the ASCII tier.

## Mechanical acceptance edit

- `src/modules/theme/ThemeIcons.ts:70,80` — replace the two Unicode `⚙`
  values; `:106,113` — replace the two blank ASCII values with `$` and `:`;
  `:263-271` — remove the stale declared `⚙` sharing. Keep the verified Nerd
  Font entries at `:37,44`.
- `src/modules/theme/ThemeIcons.test.ts:324-370` — update the pinned Unicode
  and ASCII rows; near `:462-472` — pin that shell, configuration, and Settings
  have distinct meanings and marks. The exhaustive width test at `:515-562`
  automatically covers all tiers.
- `src/modules/theme/theme.invariants.md:325-409` — replace the pending
  proposal with the accepted choice and measured rationale.
- `project.coverage-deltas.md:114` — append a row only if the focused
  regression changes assertion counts.

All consumers already read the shared `ThemeIcons` table, so no file-tree,
breadcrumb, or completion behavior file changes.

## Verification

- `bash scripts/conventions-gate.sh` — exit `0`; PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0`; `884 annotation(s) resolved, 67 lattice link(s) resolved,
  0 problem(s)`.
- `git diff-tree --no-commit-id --name-only -r HEAD` lists only
  `src/modules/theme/theme.invariants.md`.
- Worktree clean after commit.
- No code was added or changed, so no code test was invented or run.
- `scripts/merge-gate.sh` was not run.

## Bycatch

None observed.

Do you accept Pair A — `$` for shell scripts and `:` for YAML/configuration at
the Unicode and ASCII tiers, while retaining the verified Nerd Font marks?
