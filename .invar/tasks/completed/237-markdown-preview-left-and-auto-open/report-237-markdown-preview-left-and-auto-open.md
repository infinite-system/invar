# READY — #237 (markdown preview sits LEFT of the source and opens itself)

State: READY for review. All work is committed on
`fleet/237-markdown-preview-left-and-auto-open`. The tree is clean.

## What the change does

1. **Auto-open.** When the markdown plugin is enabled and a `.md` tab becomes the
   active presented document, its preview opens with no keystroke. A sync-flush
   `$watch` in `MarkdownWorkspace` writes the path into the existing
   `previewPaths` set. The keyboard stays on the source pane.
2. **Hand-close memory.** A new `dismissedPreviewPaths` set records a close by
   hand. That document stays source-only until its own toggle reopens it. Every
   other markdown document keeps the open default. `togglePreview` writes the
   dismissal BEFORE it removes the path. The sync watcher fires between the two
   writes. It re-opened the pane until the order was fixed. Driving found this.
3. **Placement.** The preview sits LEFT of the source by default. The plugin
   contributes `markdownPreviewSide` (`enum: left | right`, default `left`,
   label "Preview side", section Markdown) per the #100/#222 convention. Only
   the child order and the splitter's `pointerDirection` flip with the side.
   The persisted `markdownSplitRatio` keeps ONE meaning: the source pane's
   share. The mount identity now carries the side, so a settings flip rebuilds
   the split live. A new probe `markdownPreviewSide` is published for drives.
4. **Uninstall symmetry.** Disabling the plugin disposes the contribution,
   stops the watcher, and unmounts the pane. Reinstall re-applies auto-open to
   the active tab. The manifest smoke now proves both directions.

## Files changed

- `src/modules/markdown/MarkdownWorkspace.ts`: auto-open watcher, dismissal
  set, toggle ordering, disposal.
- `src/modules/markdown/MarkdownPlugin.ts`: the contributed side setting, the
  status probe, wiring to the surface.
- `src/modules/markdown/MarkdownPreviewSurface.ts`: `previewSide()`
  normalization, side in `mountIdentity`, side in `observePaintSignals`.
- `src/modules/markdown/MarkdownPreviewContent.ts`: passes the side to the
  split view.
- `src/modules/markdown/MarkdownSplitView.ts`: pane order by side. Splitter
  `pointerDirection` is −1 when the preview is left. Adds the `previewSide`
  getter and the `MarkdownPreviewSide` type.
- `src/modules/markdown/markdown.invariants.md`: new record *The Markdown
  preview opens itself and sits on the configured side*. The split record's
  Generates line now names the auto-open default.
- Tests: `MarkdownWorkspace.test.ts` (reactive-path mock; 14 tests),
  `MarkdownPlugin.test.ts`, `MarkdownPreviewSurface.test.ts`,
  `MarkdownSplitView.test.ts`.
- Smokes: `scripts/harness/smoke-markdown-harness.ts` (rewritten flow, bounded
  preview-pane helpers, dismissal arm, settings-UI side-flip arm),
  `scripts/harness/smoke-plugin-manifest-harness.ts` (markdown auto-open
  uninstall/reinstall arm), `scripts/smoke-markdown.sh` (legacy tmux tier,
  updated to the new default).
- Task folder: three probe scripts (see Bycatch) with STE headers.

Presentation was not touched. `MarkdownStylesheet.ts`, `MarkdownPreview.ts`,
and `MarkdownRenderable.ts` are unchanged. `src/modules/ui/ui.invariants.md`
is untouched, as the brief requires.

## Verification (exact commands, exact exit codes)

- `bunx tsc --noEmit` → exit 0.
- `bun test` → exit 0. 1838 pass, 0 fail, 285 files.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  → exit 0. 1051 annotations resolved, 0 problems.
- `bun scripts/harness/smoke-markdown-harness.ts` → exit 0, ALL-PASS
  (27 PASS lines).
- `bun scripts/harness/smoke-plugin-manifest-harness.ts` → exit 0. All arms
  pass, including the new markdown arm.
- `bash scripts/smoke-markdown.sh` (legacy tmux tier) → exit 0, ALL-PASS.
- `bun scripts/check-harness-wait-observation.ts` → exit 0 (report-only). The
  two new candidates in my files are legitimate re-waits. The state flips
  between the repeated predicates.
- Merge-gate NOT run, per the brief.

Positive controls (convention 6): a plant that empties the auto-open candidate
turns 8 `MarkdownWorkspace` tests red; a plant that flips the default side to
`right` turns the split-view default test red. Both plants are removed and the suite is green again.

The harness also went red for real during development three times: the
dismissal-ordering race, the resize-relayout quirk, and the settings-erasure
defect. The last two are bycatch below.

## Done-test, driven (frame evidence)

- Fresh workspace, open README.md: `bun run drive --open README.md` shows the
  `╭─Preview` pane LEFT of the source box, `markdownPreviewOpen=true`,
  `markdownPreviewSide="left"`, `markdownPaneFocus="source"`, `focus="editor"`.
  The stylesheet-rendered content paints (heading with no `#`).
- Close and reopen: `--key Control+Shift+v --wait-for-status
  'markdownPreviewOpen=false' --key Control+Shift+v --wait-for-status
  'markdownPreviewOpen=true'` — both transitions land.
- Per-document dismissal: harness arm — close README's preview, open
  zebra-notes.md (auto-opens), return to README (stays closed), reopen by
  button.
- Flip the setting: a harness arm drives the real Settings UI ("Preview side",
  Right key). The pane remounts RIGHT of the source and `markdownPreviewSide`
  publishes `"right"`.
- Disable the plugin: the manifest-smoke arm shows the pane gone from the grid
  (no stale pane) and the settings section withdrawn. Reinstall auto-opens
  again.
- Find with the preview left: a harness arm keeps independent source (`#`) and
  preview (`Rendered`) queries. The preview owns its matches only while
  focused. NOTE: the task file also names "go-to-line". No go-to-line feature
  exists in the app (no command, no binding), so there is nothing to verify.
  This premise gap is reported, not worked around.

## Invariants

- New record: *The Markdown preview opens itself and sits on the configured
  side* (chosen, provisional) in `src/modules/markdown/markdown.invariants.md`,
  with mechanism, rejected alternatives, file:line evidence, and test+harness
  verification. Annotated at `MarkdownWorkspace.ts`, `MarkdownPlugin.ts`,
  `MarkdownSplitView.ts`, both smokes, and the tests.
- The #236 stylesheet record survives untouched; the census test still passes.
- The split record's Generates line updated ("source-only default mode" → the
  auto-opened default), Last refined bumped.
- Checker: 0 problems.

## Bycatch

1. **Pre-existing defect — a terminal SHRINK never re-lays-out the markdown
   split until a mouse event has crossed the app.** Reproduced on UNMODIFIED
   main: open the preview with Ctrl+Shift+V (no click), resize 120x40 → 60x25,
   and the panes keep their wide widths for as long as observed (8 s+). The
   preview runs off-screen. One click on the source pane or the divider before
   the resize makes the same shrink settle. A click on the PREVIEW pane does
   not. `MarkdownSplitView.tick` sees `rootRenderable.width` pinned at the
   wide value (83) through 460 ticks. The old smoke masked this defect because
   it opened the preview by clicking the tab button. Reproduction:
   `probe-237-narrow-resize-settle.ts` and
   `probe-237-narrow-resize-handshake.ts` in this task folder. Reproduced more
   than twice. CONSEQUENCE OF THIS TASK: auto-open removes the masking click,
   so a default user hits this by shrinking their terminal. The harness's
   narrow-pane arm now reaches the narrow preview by divider drag instead of
   terminal resize; terminal-shrink coverage for the split is therefore
   REMOVED until this host defect is fixed — a follow-up task is owed.
2. **Pre-existing defect — a boot-time `settings.save()` erases stored values
   of contributed settings that are not yet registered.** Seeding
   `~/.config/invar/settings.json` with `{"markdownPreviewSide":"right"}`
   boots to `side=left`, and the file is REWRITTEN with `"left"`. The same
   seed resolves to `right` through `Settings.load()` + `registerSetting()` in
   isolation. So the eraser is a save that runs before plugin activation.
   Suspect (labeled): the agent-provider write-back save at
   `src/modules/app/Bootstrap.ts:638`. `persistenceSnapshot()` drops every
   unregistered key from `storedUserRecord`. Consequence: NO contributed
   setting (`markdownSplitRatio`, `markdownPreviewSide`,
   `inlineRewrite.enabled`, …) can survive a reboot in an environment where a
   save fires before activation. Reproduced twice
   (`probe-237-narrow-resize-settle.ts` prints STATUS and USERFILE lines).
3. **Status-key semantics on plugin uninstall**: after disabling the markdown
   plugin, `markdownPreviewOpen` reads `undefined`, not `false`, although
   `MarkdownPreview.close()` publishes `false`. The projection rebuild drops
   plugin keys. Observed twice while extending the manifest smoke (its arm now
   asserts `!== true`). Worth a one-line doc note on `StatusChannel` if this
   is intended.
4. **Drive-settle vs debounce**: `bun run drive --open README.md` prints a
   settled grid that still shows "Parsing Markdown…" (`markdownParsing=true`).
   The settled-frame condition does not wait for the debounced parse.
   Harmless for humans, a trap for grid assertions. Observed on every drive.
5. **Premise gap in the task file**: "verify find and go-to-line still target
   the source pane". The app has no go-to-line command or binding to verify.
   Find is verified.

Categories not observed in this task's driving: comment drift beyond the
items above, distillation candidates, contract-layer gaps.

## Scratch tooling (committed in this task folder)

- `probe-237-narrow-resize-settle.ts`: reproduces bycatch 1 and 2. The header
  says how to run and read it.
- `probe-237-narrow-resize-handshake.ts`: bycatch 1 under the harness's
  synchronized-frame path.
- `probe-237-uninstall-stale-pane.ts`: proves uninstall leaves no stale pane
  and shows the `undefined` status key (bycatch 3).
