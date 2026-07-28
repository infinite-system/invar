# TASK — Inline AI rewrites: fix the disappearing text + render loop, extract as a plugin (#126)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-inlinefix`
(branch `fix-inline-rewrite-plugin`, forked from main at `3694b23`). Do NOT run
`scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Commit and report to
`/tmp/inline-rewrite-fix-READY.md`. `export PATH=$HOME/.bun/bin:$PATH; bun install
--frozen-lockfile` first.

## The user, verbatim (live testing of the feature that landed today)

> "inline ai rewrites should be its own plugin too, and right now it's not working correctly,
> should be disableable, it runs constant re-renders on the changes shown on the left gutter, the
> text i wrote disappeared and I cannot see it, so not a functional plugin yet, can you fix it?"

## Severity order — fix in this order, reproduce EACH before diagnosing

### 1. TYPED TEXT DISAPPEARS (worst class — the user's own writing became invisible)

Reproduce through the PTY driver: open a git-TRACKED file with uncommitted edits (so diff gutter
marks are live), enable the feature, type continuously through and past the debounce window, keep
typing while a proposal would arrive (use the deterministic mock provider with a delay). Assert
EVERY typed character remains visible in the grid in EVERY frame. The landing's smoke never drove
typing in a git-dirty file with gutter marks active — that fixture-axis gap is where this hid.

Suspects to MEASURE, not trust: the proposal decoration painting OVER the user's line instead of
alongside it; the overlay REPLACING row content rather than augmenting; a stale proposal applied
despite the revision guard (verify the guard actually compares the revision the response was
computed against); the recent-edit-region tracker claiming the user's current line as proposal
territory. Five confident diagnoses died to measurement in this repo this week.

### 2. CONSTANT RE-RENDERS coupled to the left-gutter change marks

The user sees continuous repaints tied to the diff gutter marks while the feature is enabled. The
landing claimed idle-quiescence green — the interaction with LIVE GUTTER MARKS was evidently never
driven. Reproduce: git-dirty file, marks visible, feature on, type then STOP; capture frames; after
settle there must be ZERO further frames (idle-quiescence with this exact fixture). Suspects: the
edit-region tracker dirtying gutter decorations per keystroke; the debounce timer requesting frames
while pending; proposal state churning a reactive aggregate the gutter reads.

### 3. Disable must mean OFF

`inlineRewrite.enabled = false` must yield zero subscriptions, zero tracking, zero timers, zero
renders from this feature — not a UI-level hide. Drive it: disable, type, capture; nothing from
this feature may appear or tick.

### 4. Extract as a plugin (the user asked for it BY the taxonomy)

Per *Plugin boundaries grant one authority*: the trigger, presentation, commands, keybindings, and
settings become an `InlineRewriteContributor` (contributor kind) registered in `DefaultPlugins`;
`RewriteProvider` STAYS a provider (the codex backend unchanged). Enable/disable through the
Extensions pane with full uninstall symmetry exactly like Git/Markdown/FileTree: disable removes
the settings heading, bindings layer, status projection, and every subscription. Follow
GitPlugin/MarkdownPlugin/FileTree as worked examples; the #100 contribution machinery carries
settings+keybindings. The plugin-boundary scan must stay green (host names no plugin).

## Acceptance — exact exit codes

- The three reproductions above, each shown FAILING before the fix (counts/frames) and passing
  after — 3 runs each, one loaded run.
- The extraction driven through Extensions: disable/re-enable cycle restores everything.
- idle-quiescence green with: feature on + git-dirty file + marks + settled; feature off; plugin
  disabled.
- Full checker suite; coverage declarations (counted grammar, APPEND); update the inline-rewrite
  invariants (one in-flight, stale-drop by revision, proposal-never-eats-keystrokes) with the new
  impossibilities: a proposal may not occlude or replace user-typed content outside an explicit
  accept; the feature disabled contributes zero frames.

## Rules

Full descriptive names, 80 columns, ivue conventions. Other builders own src/modules/agent (the
intermittents pair) and Momentum/render-loop (scroll) — your ground is the inline-rewrite files,
editor decorations, and the new plugin; coordinate by staying out of theirs. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`; clean tree.
