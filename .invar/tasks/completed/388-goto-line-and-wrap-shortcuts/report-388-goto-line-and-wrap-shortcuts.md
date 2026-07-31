# READY #388 (go-to-line and word-wrap shortcut discoverability)

State: READY

Branch: `fleet/388-goto-line-and-wrap-shortcuts`

Commit: `46c287888c161638177890ca527df29acb7da6fc`

The work in the [task brief](brief-388-2-goto-line-and-wrap-shortcuts.md) is complete. I did not
run the merge gate or push the branch.

## Result

- The panel tooltip now reads `Editor: Go to Line (Alt+G)`.
- The panel tooltip now reads `View: Toggle Word Wrap (Alt+Z)`.
- Both hints come from the effective binding registry. A later rebind will change the hint.
- The shortcut sheet lists `Go to Line` with `Alt+G` and `Toggle Word Wrap` with `Alt+Z`.
- Alt+Z now resolves to `view.toggleWordWrap`. The key, panel button, and command palette therefore
  use one command ID and one command registry path.

The implementation is in [RootView.ts](../../../../src/modules/ui/RootView.ts),
[KeybindingDefaults.ts](../../../../src/modules/keybindings/KeybindingDefaults.ts), and
[Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts). The contract tests are in
[KeybindingDefaults.test.ts](../../../../src/modules/keybindings/KeybindingDefaults.test.ts) and
[ShortcutHelp.test.ts](../../../../src/modules/ui/ShortcutHelp.test.ts). The real PTY checks are in
[smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts) and
[smoke-shortcut-help-harness.ts](../../../../scripts/harness/smoke-shortcut-help-harness.ts).

## Chord admission

- `Alt+G` is an editor-context, non-reserved chord. `Ctrl+G` and `Ctrl+Shift+G` belong to the Git
  contribution, as recorded by [#267 (go-to-line does not exist)](../../completed/267-go-to-line-does-not-exist/report-267-go-to-line-does-not-exist.md).
  The existing `Ctrl+K then Ctrl+G` alias remains available. The effective primary hint is `Alt+G`.
- `Alt+Z` is an editor-context, non-reserved chord. It has no collision in the canonical table. It
  also matches the established VS Code word-wrap chord.
- Neither editor action entered the reserved global set. This preserves focus ownership for content
  actions.

## Driven evidence

I drove the default app before writing an assertion.

- At 60x20, both the 10-line and 100,000-line shared fixtures delivered `Alt+Z`, published
  `wordWrap=true`, delivered `Alt+G`, and published `goToLineOpen=true`. Both drives exited 0.
- Before the change, a real pointer hover showed `View: Toggle Word Wrap` and `Editor: Go to Line`.
  Neither tooltip showed its chord.
- After the change, the same hover showed `View: Toggle Word Wrap (Alt+Z)` and
  `Editor: Go to Line (Alt+G)`.
- The final panel smoke drove both tooltips and both actions at 120x40 and 88x24.
- The final go-to-line smoke passed at 10 and 100,000 lines. The final wrap smoke completed its
  Alt+Z round trip in the real PTY.

The welcome screen does not list either action, so this task needed no new welcome row. Structural
search found no separate keybinding settings editor. The shortcut sheet is the current in-app list
of effective bindings.

## Positive controls

- I temporarily removed the effective hint from the panel title. The panel smoke exited 1 with
  `Timed out waiting for grid condition: 120-column view.toggleWordWrap tooltip shows View: Toggle Word Wrap (Alt+Z)`.
- I temporarily changed the Alt+Z default to Alt+Y. The shortcut-help smoke exited 1 with
  `FAIL Toggle Word Wrap row shows its effective Alt+Z binding`.
- I removed both planted defects before the final pass.

## Invariant audit

The changed paths brought the app, command, keybinding, UI, harness, and project contracts into
scope.

- The change strengthens `Advertised bindings are deliverable bindings` and
  `The shortcut sheet lists the effective bindings`. Both surfaces now derive their labels from the
  same registry seam.
- The Alt+Z command-ID repair strengthens `Bindings are intent addressed` and
  `Every action dispatches through one registry`.
- The new visible hints strengthen `No action requires a memorized motion`.
- `Panel controls share paint and hit geometry` and `A tooltip never intercepts input` remain
  upheld. The change alters title text only. It does not alter geometry or input ownership.
- The new drives uphold `Harness input and output use the real PTY`,
  `The terminal emulator is the harness screen oracle`, `Harness waits observe conditions not frame ordinals`,
  and `Every wait names itself`.

No invariant needed a downgrade. No shadow invariant or new contract record was needed.

## Verification

- `bunx tsc --noEmit` — exit 0.
- Focused Bun tests — 30 passed, 0 failed, 117 assertions across three files.
- `bun scripts/harness/smoke-panel-chrome-harness.ts` — `ALL-PASS` at both geometries.
- `bun scripts/harness/smoke-shortcut-help-harness.ts` — `ALL-PASS`.
- `bun scripts/harness/smoke-go-to-line-harness.ts` — `ALL-PASS` at 10 and 100,000 lines.
- `bun scripts/harness/smoke-wrap-harness.ts` — `ALL-PASS`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` — exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` — 1,314 annotations and
  263 lattice links resolved, with 0 problems.
- `bun scripts/check-coverage-ratchet.ts` — 392 files inspected, with no undeclared decrease.
- `bash scripts/conventions-gate.sh` — PASS.
- `git show --check HEAD` — exit 0.

The commit hook formatted the staged files. I then reran the type check, the 30 focused tests, and
the two changed PTY smokes. All remained green. The worktree is clean.

## Bycatch

- The welcome screen says `Ctrl+P command palette`, although Ctrl+P opens Quick Open. I reproduced
  it in an empty workspace at 100x30 and again at 60x15. The narrow view truncates the text after
  `Ctrl+P`, but the wide view shows the full wrong label. I did not change it because
  [#354 (welcome screen mislabels Ctrl+P)](../../active/354-welcome-screen-mislabels-ctrl-p/task-354-welcome-screen-mislabels-ctrl-p.md)
  already owns that fix.
