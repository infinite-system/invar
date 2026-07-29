# READY — preview scroll sync setting #289

## Outcome

The Markdown source and preview now follow the pane that receives user input. A follower move keeps
the same leader, so it cannot start a feedback loop. Both directions consume one cached
source-line/rendered-row anchor map. Headings use exact anchors. Positions between anchors use
interpolation.

The Markdown plugin contributes `markdownPreviewScrollSync`. Its default is `true`. Turning it off
leaves both panes independent.

Commit: `05777485d2176b5d2690bacfa391c9a590eea491`

The worktree is clean.

## Driven evidence

The baseline had no continuous follow. Two source Page Down inputs moved the source from `0` to
`4` to `18` while the preview stayed at `0`. Two preview Page Down inputs moved the preview from
`0` to `15` to `30` while the source stayed at `0`.

The final [Markdown PTY contract](../../../../scripts/harness/smoke-markdown-harness.ts) drove the
default setting at small and large scale:

- 500 lines:
  - Depth 1: source `98→106`; preview `102→111`.
  - Depth 2: source `223→231`; preview `230→239`.
  - Depth 3: source `323→331`; preview `333→342`.
  - Reverse preview wheel: preview `342→334`; source `331→324`.
- 100,000 lines:
  - Depth 1: source `19998→20007`; preview `20002→20012`.
  - Depth 2: source `44998→45007`; preview `45005→45015`.
  - Depth 3: source `64998→65007`; preview `65008→65018`.
  - Reverse preview wheel: preview `65018→65009`; source `65007→64999`.

The same contract toggled `markdownPreviewScrollSync` off through Settings. Source wheel input moved
only the source. Preview wheel input moved only the preview. It then toggled the setting on again.
The existing table-of-contents jump kept both targets in the reading position at 500 and 100,000
lines.

## Positive control

I temporarily returned before source-to-preview follow. The real PTY contract went red:

> Timed out waiting for 500-line source wheel moves both panes at Depth 1 500

I removed the planted defect. The final contract then passed.

## Invariant review

I extended [A Markdown file offers a live source preview split](../../../../src/modules/markdown/markdown.invariants.md#a-markdown-file-offers-a-live-source-preview-split)
with input leadership, one shared position map, bidirectional follow, and symmetric disabled
behavior.

I refined [Explicit jumps use one reading position](../../../../src/modules/text/text.invariants.md#explicit-jumps-use-one-reading-position)
to state that explicit jumps and continuous follow consume the same anchor map.

The contributed setting follows [Plugin settings live in contributed schema](../../../../src/modules/settings/settings.invariants.md#plugin-settings-live-in-contributed-schema).
The host settings schema does not name it.

The main implementation is in
[MarkdownSplitView.ts](../../../../src/modules/markdown/MarkdownSplitView.ts),
[MarkdownPreview.ts](../../../../src/modules/markdown/MarkdownPreview.ts), and
[MarkdownPlugin.ts](../../../../src/modules/markdown/MarkdownPlugin.ts). The source viewport
capability is declared in
[SourceTextView.interface.ts](../../../../src/modules/workspace/SourceTextView.interface.ts).

## Verification

- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — PASS,
  1,113 annotations, 218 lattice links, 0 problems.
- `bun run typecheck` — PASS.
- `bun test` — PASS, 1,905 tests, 0 failures, 68,504 expectations across 293 files.
- `bash scripts/smoke-markdown.sh` — ALL-PASS.
- `bun scripts/harness/smoke-markdown-harness.ts` — ALL-PASS.
- `bash scripts/conventions-gate.sh` — PASS.
- The automatic pre-commit merge gate — ALL-PASS.

## Bycatch

- The ignored worktree dispatch brief linked to the explicit-jump contract with no anchor and with
  a path valid only from the task folder. The invariant checker exposed both faults. I corrected
  the ignored local dispatch copy. It is not part of the branch. The final checker found 0
  problems.
- The automatic pre-commit merge gate saw one starvation-class timeout in the panel-split harness.
  Its one quiet retry passed cleanly, so the fault did not reproduce on the second run. I did not
  change that unrelated harness.
