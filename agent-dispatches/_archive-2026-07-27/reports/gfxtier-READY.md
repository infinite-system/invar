# READY — graphics tier persisted setting (#99)

Branch: `fix-graphics-tier-setting`

Commit: `a9aa17d0d0eec7b024610db933a87906abf1a2ee`

## Result

Graphics tier is now a host-contributed `graphicsTier` setting with `auto`,
`kitty`, `sixel`, and `halfblock` choices. Its default is `auto`, which resolves
through terminal capability detection. The Settings panel exposes it in
Appearance, changes take effect live, and the selected declaration persists
through a restart using the same HOME.

Live image projection now resolves the tier in this order:

1. `TUI_GRAPHICS_TIER`
2. An explicit persisted `graphicsTier` declaration
3. Automatic capability detection when the declaration is `auto`

The environment variable remains highest precedence so harnesses and CI can
force deterministic rendering independently of user state. It is now a
centralized override rather than the normal source of truth.

Downgrading a displayed Kitty image to `halfblock` emits the Kitty placement
delete command before painting the cell fallback, so the prior image does not
remain as an artifact.

## Environment-variable census and consumers

The census used `bun scripts/ast-query.ts`, per the structural-search rule.

- `TerminalCapabilities.graphicsTierEnvironmentOverride()` is the single
  production read of `TUI_GRAPHICS_TIER`.
- `RootView` is the live application consumer through
  `resolveGraphicsTier(settings.graphicsTier.value, reportedGraphics.value)`.
- `scripts/report-graphics-capabilities.ts` is a diagnostic consumer through
  `detectGraphicsTier`; it also reports the raw environment value.
- `GraphicsTier.test.ts` exercises environment-override precedence.
- `smoke-pixel-preview-harness.ts` sets or clears the variable for forced child
  process cases. These are harness inputs, not alternate production reads.

## Driven evidence

The pre-change drive used the real pixel-preview path and
`/tmp/ivue-cart-dark.png` at 80x24 and 160x50. Kitty rendering worked at both
scales, but Settings contained no Graphics tier row.

The permanent pixel-preview harness now drives both 80x24 and 160x50 with a
fresh `mktemp` HOME per run. At both scales it:

- starts in automatic half-block rendering;
- simulates a Kitty terminal capability reply and observes a live upgrade;
- opens Settings and changes the visible Graphics tier row;
- changes to `halfblock` without restart, observes Kitty deletion and fallback
  cells, and observes the persisted settings file;
- changes through `auto` to `kitty`, restarts with the same HOME, and observes
  both Kitty rendering and the persisted `kitty` selection in Settings.

`bun scripts/harness/smoke-pixel-preview-harness.ts` exited 0 with all small,
large, forced-Kitty, forced-Sixel, and forced-halfblock cases passing.

Positive control: I temporarily removed `graphicsTier` from
`Settings.persistenceSnapshot()`. The persistence drive exited 1 with:

`Timed out waiting for graphicsTier=halfblock at .../.config/invar/settings.json`

The planted defect was removed before the successful run and commit.

## Verification

- `bun install --frozen-lockfile`: exit 0.
- Initial invariant checker (`--all` and `--refs`): exit 0.
- Focused pixel-preview driven contract: exit 0.
- Full checker, run once as `bash scripts/merge-gate.sh`: exit 1. All contract,
  unit, behavioral, pixel-preview, input-flush, and terminal stages passed, but
  the settings applied-effect census initially lacked `graphicsTier`. The
  audio-narration smoke also timed out once under the parallel pool and passed
  its single retry; the gate's flake tally retained that event. The soft
  performance-baseline stage reported one measurement failure/target miss and
  exited 2 within its nonblocking step.
- After adding explicit cross-smoke provenance for `graphicsTier` to both
  applied-effect censuses, `bash scripts/conventions-gate.sh`: exit 0.
- `bun scripts/harness/smoke-settings-applied-harness.ts`: exit 0; all 35 schema
  fields have a driven-effect owner.
- Final invariant checker
  (`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`):
  exit 0, 864 annotations, 45 links, 0 problems.
- Worktree is clean.

The full checker was not rerun; the scoped failures were corrected and verified
with their owning checks.

## Bycatch

- At 80x24, navigating in Settings to a row immediately below a section
  boundary can update `settingsSelectedLabel` while leaving the selected row
  below the painted viewport. This reproduced more than twice while placing the
  new row. Graphics tier was placed visibly in Appearance; the generic reveal
  mismatch remains untouched.
- The full checker's audio-narration harness timed out once in the parallel
  pool, then passed its retry. It did not reproduce on retry.
- The nonblocking performance-baseline step reported one measurement
  failure/target miss. It was not rerun.

COMPACTION: one context compaction occurred during final handoff; work continued
from the generated summary.

conventions @ e898c40d189bac146fe10b4e8d4fe011c1668abe
