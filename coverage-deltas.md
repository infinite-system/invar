# Coverage deltas

This refactor removes clock-bound absence claims only where the claim was
duplicated, unsound, or superseded by a stronger condition/content assertion.

| File | Delta and replacement |
| --- | --- |
| `scripts/harness/SynchronizedOutputQuiescence.test.ts` | Removed the duration-based no-frame test with the deleted silence API. Idle frame efficiency remains covered once by `scripts/behavioral-contracts.sh`; action stability is covered by `PtyTestDriver` content-invariance tests. |
| `scripts/harness/smoke-agent-engine-switch-harness.ts` | Removed its duplicate idle frame-budget assertion. The single idle-quiescence behavioral contract remains authoritative. |
| `scripts/harness/smoke-agent-harness.ts` | Removed its duplicate idle frame-budget assertion. The single idle-quiescence behavioral contract remains authoritative. |
| `scripts/harness/smoke-agent-pane-ux-harness.ts` | Removed its duplicate idle frame-budget assertion. Composer/transcript action stability is now expressed with required invariant and changed regions; the single idle-quiescence behavioral contract remains authoritative. |
| `scripts/harness/smoke-agent-permissions-harness.ts` | Removed its duplicate idle frame-budget assertion. The single idle-quiescence behavioral contract remains authoritative. |
| `scripts/harness/smoke-agent-search-harness.ts` | Removed its duplicate idle frame-budget assertion. The single idle-quiescence behavioral contract remains authoritative. |
| `scripts/harness/smoke-audio-narration-harness.ts` | Removed its duplicate idle frame-budget assertion and silence wait. Ordinary typing now proves stable transcript content and changed composer content; idle efficiency remains in the behavioral contract. |
| `scripts/harness/smoke-editor-harness.ts` | Removed its duplicate idle frame-budget assertion and an untouched-selection silence interval. The former remains in the behavioral contract; the latter was unsound because a legitimate repaint says nothing about selection state, which is still asserted directly. |
| `scripts/harness/smoke-find-harness.ts` | Removed an optional post-action silence wait and its terminal-dependent replace-all attempt. Ctrl+H opening and Escape closing remain driven here; replace-all mutation remains covered through the real mouse control in `scripts/harness/smoke-search-mouse-harness.ts`. |
| `scripts/harness/smoke-git-watch-harness.ts` | Removed the 600 ms silence claim after attempting to open a confined directory symlink. The action is intentionally a no-op, so no changed-region liveness control exists; the smoke now proves the app remains live by opening Quick Open and retaining the Git change count. |
| `scripts/harness/smoke-hover-harness.ts` | Removed the sub-dwell duration assertion. It measured scheduler load rather than hover behavior; the positive condition that the completed dwell renders the hover remains. |
| `scripts/harness/smoke-markdown-harness.ts` | Removed the selection-release silence wait. Immediate copy now waits for the named copied-selection status, proving both preserved selection and action liveness. |
| `scripts/harness/smoke-terminal-harness.ts` | Removed its duplicate idle frame-budget assertion. The single idle-quiescence behavioral contract remains authoritative. |
| `scripts/harness/smoke-word-delete-harness.ts` | Replaced the post-delete silence wait with a required stable tree region, a required changed editor region, and the existing exact text/cursor assertions. |
