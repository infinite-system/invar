## In plain words

The history test and the new editor chrome test changed the same screen. I joined them so a file,
a Git comparison, and another file stay in one trail while the project row, breadcrumb row, file
tabs, colors, keys, and padded arrow buttons all still work. The merged app now passes every
required check.

## READY — round 3 union with panel editor tree chrome polish (#442)

The work in [the round 3 brief](brief-444-3-union-442.md) is complete.

- Merge base: `5055cd44898ade30f9d008bb99195f2a358fe7ae`
- History branch parent: `2c6fa013a26a36c558cc7c8713cec42497632885`
- Panel editor tree chrome polish (#442) tip: `25f1106c859249c96f9ddee60d1416901fb28c13`
- Merge commit: `9cf3817332cc2e6d9189184e56f8e8288f5caf5d`

The merge commit has both expected parents. The worktree is clean. I used `SKIP_GATE=1` for the
commit and did not run `scripts/merge-gate.sh`.

## Conflict classification

I classified every overlap against the merge base before I resolved it. Git reported conflicts in
three files. The navigation smoke contained six conflict-marker groups.

| Site | Merge-base classification | Union resolution |
|---|---|---|
| [Navigation smoke header](../../../../scripts/harness/smoke-navigation-history-harness.ts) | History is editor-area view states (#444) added the file-comparison-file trail description. Panel editor tree chrome polish (#442) added the run command and xterm, macOS, fallback, and padded-button contract. | The header states both contracts. |
| Navigation smoke boot and file-open group | History is editor-area view states (#444) created a Git repository, dirtied `alpha.ts`, selected past `.git`, and expected `alpha after`. Panel editor tree chrome polish (#442) added the project-row tone, empty-history, Quick Open click, chrome order, strip tone, and active-tab tone checks. | The dirty Git fixture and tree movement remain. Every chrome check runs before or after opening `alpha.ts`, and the content-tone check reads `alpha after`. |
| Navigation smoke keyboard-entry group | History is editor-area view states (#444) required Back to land on the Git comparison before it restored `alpha.ts`. Panel editor tree chrome polish (#442) supplied the xterm Alt+arrow bytes. | Xterm Alt+Left enters the comparison. macOS `ESC-b` leaves the focused comparison because the comparison owns arrow keys. The drive still proves both byte forms and the complete Back trail. |
| Navigation smoke remaining keyboard group | History is editor-area view states (#444) required Forward through the comparison and back to `beta.ts`. Panel editor tree chrome polish (#442) added the macOS readline and Ctrl+Alt+bracket byte families. | Xterm Alt+Right and macOS `ESC-f` cross the first Forward route. The macOS and fallback families then each replay both directions through every intermediate comparison state. |
| Navigation smoke Back-click group | History is editor-area view states (#444) expected one Back click to restore the Git comparison. Panel editor tree chrome polish (#442) moved the controls to padded `❮  ❯` breadcrumb cells and expected its old two-file endpoint. | The padded geometry remains. Back now asserts the real three-state endpoint: the Git comparison. |
| Navigation smoke pass-label group | Both branches described the same Back click with their own endpoint text. | One accurate pass states that padded `❮` restored the Git comparison. No duplicate or false alpha endpoint remains. |
| [Navigation invariant evidence](../../../../src/modules/navigation/navigation.invariants.md) | History is editor-area view states (#444) replaced the old file-location mechanism with registered opaque contributor states, replay suppression, rejected-state removal, Markdown evidence, and the 40-comparison case. Panel editor tree chrome polish (#442) changed the keyboard evidence to Alt+Left/Right and protocol-safe fallbacks. | The contributor mechanism and all evidence remain. The PTY evidence now names the new byte forms and the three-state trail. Obsolete file-only methods and paths were not restored. |
| [Workspace Back and Forward comments](../../../../src/modules/workspace/Workspace.ts) | History is editor-area view states (#444) removed workspace-owned location restore and delegated replay to the generic history seam. Panel editor tree chrome polish (#442) renamed the shortcut comments to Alt+Left and Alt+Right. | The generic implementation remains. Its comments use the new shortcut names. The deleted file-only restore method was not resurrected. |

[Workspace.navigation.test.ts](../../../../src/modules/workspace/Workspace.navigation.test.ts) overlapped but
merged automatically. The result keeps the history branch's editor contributor fixture and the chrome
branch's Alt+Left/Right wording.

No assertion from either branch was dropped. Conditions whose old two-file endpoint became the new
comparison state were updated to assert the real three-state sequence.

## Integration finding

The first union drive found one stale guard in [TabBar.ts](../../../../src/modules/ui/TabBar.ts).
The guard came from the merge base. Panel editor tree chrome polish (#442) added history segments
behind it, but the guard rejected all breadcrumb clicks while a contributed comparison occupied the
editor area. The later branch in the same handler already restricted only source crumbs and title
actions.

Before the fix, the merged smoke passed padded Back into the comparison and then could not activate
padded Forward. I removed the stale early guard. After the fix, padded Forward returned to `beta.ts`.
History controls now remain live on a contributed editor-area surface, while source-only crumbs and
title actions keep their existing guard.

## Coverage declaration

[project.coverage-deltas.md](../../../../project.coverage-deltas.md) now declares the measured union.
The AST counter reported:

- Merge base navigation smoke: 9 assertions and 17 waits.
- History branch before this merge: 11 assertions and 25 waits.
- Panel editor tree chrome polish (#442) tip: 16 assertions and 27 waits.
- Merged navigation smoke: 17 assertions and 40 waits.
- Panel chrome declaration: 25 to 19 assertions and 46 to 55 waits.

The coverage counter positive control found its expected 2 assertions and 2 waits. The final ratchet
inspected 392 files and reported no undeclared decrease.

## Driven result

[smoke-navigation-history-harness.ts](../../../../scripts/harness/smoke-navigation-history-harness.ts)
reported `ALL-PASS` on the exact merge commit. It proved:

- the project row, empty history cluster, breadcrumb order, file-tab row, and panel and content tones;
- `alpha.ts` to Git comparison to `beta.ts` in one history;
- cursor restoration at `(3,0)`;
- xterm Alt+arrow, macOS readline, and Ctrl+Alt+bracket byte forms;
- Back and Forward through the intermediate comparison; and
- padded `❮` and `❯` clicks from source and comparison surfaces.

[smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts) and
[smoke-tree-scroll-harness.ts](../../../../scripts/harness/smoke-tree-scroll-harness.ts) also
reported `ALL-PASS`.

## Invariants

- [The editor area owns one presented path row](../../../../src/modules/ui/ui.invariants.md) is
  upheld. `GitComparisonContent` supplies the compared path, `EditorContentMount.displayedPath`
  reads the mounted occupant, and the real comparison frame painted `alpha.ts` in the shared row.
- [Navigation chrome precedes file tabs](../../../../design.invariants.md) is upheld. The smoke
  observed the breadcrumb and history row directly above the file-tab row.
- [Chrome strips take the panel tone](../../../../design.invariants.md) is upheld. The workspace,
  branch, project, breadcrumb, and file-tab strips used the panel tone. Only the active file-tab chip
  and editor canvas used the content tone.
- [Programmatic history navigation does not record new history](../../../../src/modules/navigation/navigation.invariants.md)
  is upheld. Back and Forward replayed all three view states in both directions, and the full tests
  retained the 40-comparison depth case.
- [Live static reads follow the receiving class](../../../../project.invariants.md) is upheld. The
  conventions gate passed the changed-file static-read census with zero matches and added no
  allowlist entry.

## Verification

I repeated this verification after the commit hook formatted the staged files, so these results
apply to merge commit `9cf3817332cc2e6d9189184e56f8e8288f5caf5d`.

- `bun test` ran in full: 2,299 tests passed, 0 failed, and 71,886 expectations ran across 349 files.
- `bun scripts/harness/smoke-navigation-history-harness.ts` passed with `ALL-PASS`.
- `bun scripts/harness/smoke-panel-chrome-harness.ts` passed with `ALL-PASS`.
- `bun scripts/harness/smoke-tree-scroll-harness.ts` passed with `ALL-PASS`.
- `bunx tsc --noEmit` passed.
- `bash scripts/conventions-gate.sh` passed.
- `bun scripts/check-coverage-ratchet.ts` passed its positive control and inspected 392 files with
  no undeclared decrease.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` passed every record file.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` resolved 1,334 annotations
  and 266 lattice links with 0 problems.
- `git diff --check` passed before the commit, and the committed merge diff also passed.
- `bun scripts/tasks/lint-task-links.ts` passed for this report.
- The flavored STE linter passed for this report.

## Bycatch

None observed outside the requested union. The stale contributed-surface history-click guard was on
the required trail and is recorded in the integration finding above.
