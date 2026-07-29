# READY — wrap contract settings leak diagnosis (#233)

State: READY

Commit: `1a3abc5d9e77df437b5dce3f1339d50e5dc63ac7`

Branch: `fleet/233-wrap-contract-red-settings-leak`

Worktree: clean

## Result

The settings-leak hypothesis was false for `behavioral-contracts`. Two instrument defects caused the
red:

1. The tmux server used `window-size latest`. The contract requested `120x40`, but Invar received
   `256x54`. The editor was 219 columns wide. The 205-character fixture did not wrap, so
   `editorMaximumScrollTop=151` was correct for that real geometry.
2. The extent probe called `settle` after input while `renderQuiescent=true` was already published
   from before the input. The new probe waits for a later frame and the document-end cursor
   condition.

The fixed contract pins the tmux pane to `120x40`. It confirms `wordWrap=true`, then reaches
`scrollTop=569`.

Every behavioral run now owns one temporary HOME. It also owns XDG config, data, state, and cache
directories. Bun resolves before HOME changes. `PtyTestDriver` completes the same directory set for
every supplied home.

## Original modes

The real-HOME transcript in `/tmp/bc-main-control.log` says:

```text
FAIL wrap-mode capped at logical lines (scrollTop=151, expected > 200 visual rows)
```

The bare-HOME transcript in `/tmp/bc-isolated-r2.log` says:

```text
TIMEOUT waiting for ready (ready= quiescent=)
bun: command not found
FAIL wrap-mode capped at logical lines (scrollTop=, expected > 200 visual rows)
```

The empty value was not app state. A bare HOME removed `$HOME/.bun/bin/bun` from the expected
location. `tui-harness.sh` also used that missing absolute path to read status fields. No app or
probe publisher started.

## Settings and geometry controls

The focused PTY probe used complete isolated homes:

```text
wordWrap=false, 120x40: scrollTop=169
wordWrap=true,  120x40: scrollTop=569
wordWrap=true,  256x54: scrollTop=155
```

The legacy tmux status gave the exact original fingerprint before the geometry fix:

```text
requested=120x40
actual layout=256x54
editorCenter width=219
wordWrap=true
editorMaximumScrollTop=151
editorScrollTop=151
```

After the fix:

```text
pane=120x40
wordWrap=true
editorMaximumScrollTop=569
editorScrollTop=569
```

Therefore, `wordWrap:false` does produce a logical-line cap. It did not produce the contract's exact
`151`. The tmux geometry did. The behavioral app already used the worktree artifact home, not the
real user home. The new per-run home removes its remaining persistent state.

The editor record `Word wrap is a pure view mapping` is conditional: “If word wrap is on.” It makes
no default-value claim. `Geometry aggregates match their consumers` requires the wrap clamp to use
the exact visual-row extent. The product default in `Settings.DEFAULTS` is `wordWrap:false`.
Defaults-first therefore means ordinary `Drive` runs use false. The wrap contract must seed true
because wrap is its named test axis.

## The real settings writer

The user's file remains unchanged:

```text
path=/home/parallels/.config/invar/settings.json
mtime=2026-07-29 01:29:36.573040341 -0400
sha256=a018649b65c62eb6a84187126e3b9c531a00937ce4d98fa03ad96edba384069b
```

The writer was the real interactive app, not a harness:

```text
PID 2189134: bun run dev
PID 2189135: bun src/main.ts
cwd=/home/parallels/dev/tui-editor
HOME=/home/parallels
started=2026-07-29 01:29:35 -0400
```

The matching app log is exact:

```text
2026-07-29T05:29:36.539Z [info] Boot start
2026-07-29T05:29:36.574Z [info] settings-save
```

This is local time `01:29:36.574`. A built-in task process also started at `01:29:36`. Its pane
registration called `PanelHost.register`. The missing task identifier extended
`panelContentOrder`, which called the `Bootstrap.ts` `persistContentOrder` callback and
`Settings.save()`. The save rewrote the full settings snapshot. The evidence does not show that this
boot changed `wordWrap`; it only proves that the real app rewrote a snapshot that contained false.

The production settings persistence paths are:

- `Bootstrap.ts`: bottom-panel order, primary-dock order, terminal-follow mode, follow-controller
  persistence, and agent-engine write-back.
- `RootView.ts` and `PaneSplitters.ts`: dock and sidebar splitter settlement.
- `DiffView.ts`, `GitWorkspace.ts`, and `MarkdownSplitView.ts`: persisted split ratios.
- `SettingsPanel.ts`: every accepted settings adjustment.
- `Settings.ts`: the registered contributed-setting save port.

The structural census found 17 syntax-level `.save()` calls. Thirteen are production settings paths.
Three are fake-filesystem settings tests. One is `Workspace` saving an editor document.

The final PTY census found 105 driver launches: 102 supply an isolated home. The three inherited
launches are recorded-stream fixtures in `PtyTestDriver.test.ts`. They do not launch Invar and cannot
persist settings. No app harness in the census runs against the real HOME.

## Changes

- `scripts/behavioral-contracts.sh`
  - Creates one complete temporary HOME/XDG environment per run.
  - Resolves Bun before HOME isolation.
  - Confirms the wrap setting applied.
  - Waits for a post-input cursor condition before reading extent.
- `scripts/tui-harness.sh`
  - Passes HOME and all XDG paths to app sessions.
  - Pins each tmux window to manual requested geometry.
  - Rejects a pane-size mismatch before app start.
- `scripts/harness/PtyTestDriver.ts`
  - Completes config, data, state, and cache paths for supplied homes.
- `scripts/harness/PtyTestDriver.test.ts`
  - Locks the complete child environment.
- `scripts/harness/harness.invariants.md`
  - Adds the isolated-home and declared-geometry records.
- Task probes
  - `233-drive-wrap-settings-polarity.ts`
  - `233-census-settings-persistence-and-pty-homes.ts`

## Positive controls

- Planted `wordWrap:false` under isolated `120x40`: exit `1`,
  `scrollTop=169`, expected more than 200.
- Planted a wrong `XDG_CONFIG_HOME`: the focused unit test exited `1` with one failed check.
- Planted a `121x40` tmux pane for a `120x40` request: launch exited `1` and reported the mismatch.
- Removed every plant before commit.

## Verification

All exit codes are exact:

- `scripts/behavioral-contracts.sh`: `0`
  - `PASS wrap-mode fixture applies its run-scoped wordWrap=true setting`
  - `PASS wrap-mode reaches true last visual row (scrollTop=569 > 200 logical lines)`
  - `behavioral-contracts: ALL-PASS`
- Real settings inverse control:
  - before:
    `a018649b65c62eb6a84187126e3b9c531a00937ce4d98fa03ad96edba384069b`
  - after:
    `a018649b65c62eb6a84187126e3b9c531a00937ce4d98fa03ad96edba384069b`
- `bun run drive --size 10 --key Control+End`: `0`, `editorScrollTop=0`
- `bun run drive --size 100000 --key Control+End`: `0`, `editorScrollTop=99985`
- `bun test scripts/harness/PtyTestDriver.test.ts`: `0`, 17 pass, 0 fail
- `bunx tsc --noEmit`: `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: `0`,
  999 annotations, 77 lattice links, 0 problems
- `bash -n scripts/behavioral-contracts.sh scripts/tui-harness.sh`: `0`
- Task structural census: `0`
- `git diff --check`: `0`

The product code stayed at parent `42dffe79b6c340e4a4ef286a16e5254dca71ebbe`. This commit changes only
harness code, harness contracts, and task probes. I did not run `scripts/merge-gate.sh`.

## Bycatch

- Runtime defect: none observed outside this task.
- Invariant violation: none observed outside this task. The pre-input `settle` acceptance was
  in scope and is fixed.
- Comment drift: none observed outside this task. The old “PageDown to the end” claim was in scope
  and is fixed.
- Distillation possibility: `behavioral-contracts.sh` and `PtyTestDriver.childEnvironment` both
  enumerate the same HOME/XDG directory shape. They share one policy across shell and TypeScript,
  but no cross-language generator exists.
- Generator drift: none observed.
- Plain nonsense: none observed.
- Contract-layer gap: none remains in scope. The task added records for app-home isolation and
  declared tmux geometry.
