# SMALL-TAIL FILE GRAMMAR wave — READY

Branch: `grammar-wave-smalltail`

Tip: `7c6722a691333744789c1f2484723f0aad197c8f`

Final base relationship: 10 commits ahead of `origin/main`, 0 behind after the final rebase.

## Converted files

- Commands: `CommandDefaults.ts`, `CommandRegistry.ts`, `CommandScoring.ts`; split and colocated all three test pairs.
- Kernel: `Kernel.ts`; colocated `Kernel.test.ts`; adjusted the Bootstrap singleton call through `Kernel.Class.instance`.
- Keybindings: `KeybindingRegistry.ts`; atomically renamed the two data roles to `KeybindingDefaults.ts` and `KeybindingMac.ts`; colocated all three test pairs; updated Bootstrap and shortcut-help call sites.
- Navigation: `NavigationHistory.ts`; colocated `NavigationHistory.test.ts`.
- Storage: `UndoStore.ts`; added `UndoStore.test.ts`.
- Settings: `Settings.ts`, `SettingsPanel.ts` (existing tests already colocated).
- Search: `FindBar.ts`, `FindInBuffer.ts`, `QuickOpen.ts` (existing tests already colocated).
- Theme: `TerminalCapabilities.ts`, `Theme.ts`, `ThemeIcons.ts`, `ThemePalettes.ts`; split/colocated test pairs plus `GraphicsTier.test.ts`; updated theme-palette call sites, including the agent test added on the final upstream rebase.
- Enforcement: all eight modules added together to `CONVERTED_MODULES` in `scripts/check-file-grammar.ts`.
- Blame hygiene: the eight post-rebase grammar-only conversion hashes appended to `.git-blame-ignore-revs`.

## Notable decisions

- Detached tables, sets, palettes, icon ladders, settings descriptors, and binding collections became protected static getters. Expensive values use the `$` cached-getter form with `Object.defineProperty`, preserving identity and avoiding reconstruction.
- Detached helpers became protected/static prototype-reachable methods; all `private` members became `protected`; exported types follow the eponymous class and namespace manifest.
- Cross-module capabilities remain late reads. In particular, dynamic narration voice discovery remains inside the descriptor callback, and no constructor snapshots a namespace `Class` reference.
- Kernel process-wide state moved onto the selected class (`Kernel.Class.instance`) without bypassing the live construction seam.
- Keybinding role collections were atomically renamed to eponymous Static capability files because the enforced grammar does not permit detached module data.
- The final `origin/main` rebase integrated the concurrent agent grammar wave. Its newly added renderer test was updated to the ThemePalettes class seam and autosquashed into the theme conversion commit.
- No behavior contracts were changed; this wave is grammar-only. The user-supplied untracked `TASK.md` remains untouched.

## Commit table

| Module/step | Commit |
| --- | --- |
| commands | `0fc2c2b625127f05de52d84b9bec0cf718f7d3b6` |
| kernel | `0165943a343d0c2688a7a77867e884b237a4fcf0` |
| keybindings | `cf04fbdc5ced359c0f6103d9bcf67c09c316cabe` |
| navigation | `9a08179558382ec4d2ef51b91fef702dbf9a0f6e` |
| storage | `33cf977d4ccba276b7a6dd6c2dad065577376383` |
| settings | `9963d24d9b9d1a87fdb0323f424b4d73eaf154f5` |
| search | `0e5c06dcac4575e31887fc3721b6c3385935a758` |
| theme | `672680e34138d0b540a23485d46ea51531da6dbb` |
| enforcement | `b6fd82fb7d411bfc7435508dea4156b6c0fd1d20` |
| blame hygiene | `7c6722a691333744789c1f2484723f0aad197c8f` |

Every blame hash above was proven twice with `git cat-file -e <hash>^{commit}` and `git merge-base --is-ancestor <hash> HEAD`, including against the final tip.

## Static instruments — final rebased tree

| Instrument | Result | Evidence |
| --- | --- | --- |
| dependency bootstrap | PASS | `/home/parallels/.bun/bin/bun install --silent && git checkout bun.lock`; 0 paths changed |
| file grammar checker | PASS | exit 0; 331 TypeScript files; 475 legacy violations only in unconverted modules; 18 converted modules enforced; target eight image clean |
| TypeScript | PASS | `bunx tsc --noEmit`, exit 0 |
| unit tests | PASS | 1,232 pass, 0 fail; 15,474 expectations across 159 files |
| invariant checker | PASS | all contracts pass; 609 annotations and 39 lattice links resolved; 0 problems |
| diff whitespace | PASS | `git diff --check` clean before commits |

The initial literal `bun install --silent && git checkout bun.lock` was run first as requested but the shell did not have Bun on `PATH`; it returned `bun: command not found`. The mandated bootstrap was immediately rerun successfully with the repository-specified `/home/parallels/.bun/bin/bun` path before code changes.

## Driven instruments — final rebased tree, quiet machine, solo 1/1

The pre-smoke audit confirmed no merge-gate process, no other fleet Codex, no running smoke, and no tmux sessions. Each smoke was invoked exactly once, sequentially.

| Smoke | Runs | Result |
| --- | ---: | --- |
| `smoke-settings-applied.sh` | 1/1 | ALL-PASS; settings schema applied-effect meta-gate PASS |
| `smoke-voice-picker.sh` | 1/1 | ALL-PASS |
| `smoke-quickopen.sh` | 1/1 | ALL-PASS |
| `smoke-search-mouse.sh` | 1/1 | ALL-PASS |
| `smoke-find.sh` | 1/1 | ALL-PASS (terminal-dependent replace-all path reported INFO, as designed) |
| `smoke-tabs.sh` | 1/1 | ALL-PASS |
| `smoke-shortcut-help.sh` | 1/1 | ALL-PASS |

No merge gate was run for this branch. No push or branch/worktree deletion was performed.
