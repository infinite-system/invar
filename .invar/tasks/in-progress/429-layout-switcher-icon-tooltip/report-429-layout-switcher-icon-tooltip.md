# READY — layout switcher icon and tooltip (#429)

## Result

READY at commit `654632306d7ab2f2955ba1920fad347b630cdcf2`.

The workspace command bar now paints a one-cell layout icon from the theme glyph vocabulary. The
icon keeps one padding cell on each side. Hover shows `Layouts`. The switcher has no registered
action or effective binding, so the tooltip does not show a chord. A click on any painted segment
cell opens the same four-preset menu.

The change stays in [ThemeIcons.ts](../../../../src/modules/theme/ThemeIcons.ts),
[CommandBar.ts](../../../../src/modules/ui/CommandBar.ts), their focused tests, and the PTY harness.
No layout model file changed. The worktree is clean. I did not push or merge.

## Driven evidence

- Before the change, the default 120-column app painted ` layouts ` on row 2. Its shared segment
  covered columns 111 through 119. Clicking it opened the four named presets.
- After the change, the default app painted the Unicode `▧` at row 2, column 118. The shared segment
  covered columns 117 through 119. Hover showed `Layouts`, and clicking opened the same presets.
- The [layout smoke](../../../../scripts/harness/smoke-layout-harness.ts) drove the Nerd Font,
  Unicode, and ASCII settings. Each tier proved one glyph cell, two padding cells, the tooltip, and
  the padded click target.
- The default 10-line fixture and the shared 100,000-line fixture produced the same icon position
  and preset menu.
- The planted defect changed the three-cell label to include an extra `X`. The layout smoke exited
  1 with `FAIL nerd layout switcher occupies one cell with one padding cell on each side`. I removed
  the defect before the final pass.

## Verification

- `bunx tsc --noEmit`: exit 0.
- `bun test src/modules/theme/ThemeIcons.test.ts src/modules/ui/CommandBar.test.ts`: 28 passed,
  0 failed, and 375 assertions.
- `bun scripts/harness/smoke-layout-harness.ts`: `ALL-PASS`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: 1,317 annotations and
  263 lattice links resolved, with 0 problems.
- The navigation-history and overlay-dialog PTY smokes also passed after their layout-switcher
  anchors moved to the shared theme-glyph helper in
  [HarnessSmokeSupport.ts](../../../../scripts/harness/HarnessSmokeSupport.ts).
- Prettier and `git diff --check` passed for all eight changed files.

The first commit attempt started the repository merge gate through its pre-commit hook. I stopped
the hook during its unit-test step because the [task brief](brief-429-2-layout-switcher-icon-tooltip.md)
forbids that gate. I then used the hook's documented `SKIP_GATE=1` bypass. The focused verification
above is the authoritative final pass.

## Invariant review

- **Appearance comes only from theme data — strengthened.** The command bar consumes the semantic
  `layoutSwitcher` slot. It contains no icon literal. The direct annotation now names the record in
  [theme.invariants.md](../../../../src/modules/theme/theme.invariants.md).
- **The glyph ladder degrades icons single-cell and legible — strengthened.** The Nerd Font,
  Unicode, and ASCII marks are `\u{f009}`, `▧`, and `L`. Focused tests compare application width
  with the terminal emulator, and the PTY smoke drives every tier.
- **Panel controls share paint and hit geometry — outside scope.** That record governs
  `PanelTabBar` and the two bottom-panel rows. This task changed the workspace command bar and did
  not change a panel control.
- **Command bar paint and hit geometry are identical — upheld.** This is the exact UI record for
  the changed surface in [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).
  `CommandBar.update` still paints one stored `CommandBarGeometry`, and `controlAtColumn` still
  resolves clicks from that same projection. The smoke clicks the trailing padding cell.
- **Appearance is data with a capability fallback — upheld.** The shared vocabulary remains the
  only tier generator. The command bar selects no capability tier itself.
- **A tooltip never intercepts input — upheld.** The existing shared tooltip shows the label. The
  driven click still opens the popup after the tooltip becomes visible.
- **Advertised bindings are deliverable bindings — upheld.** The switcher has no registered action
  or effective binding, so it advertises no chord. Other bound command-bar controls still ask the
  effective registry for their hints, as required by
  [keybindings.invariants.md](../../../../src/modules/keybindings/keybindings.invariants.md).

No other contract record was implicated. The layout-slot record remains unchanged because this
task did not alter layout configuration or preset behavior.

## Bycatch

- Brief-to-contract scope drift: the brief names **Panel controls share paint and hit geometry**,
  but that record excludes the workspace command bar. The existing command-bar annotation and the
  record scope both identify **Command bar paint and hit geometry are identical** as the governing
  rule. I made no contract edit.
- No runtime bycatch was observed.

Conventions: [project.conventions.md](../../../../project.conventions.md) at
`8734ae187166b503a36c4604ef889c2256600316`.
