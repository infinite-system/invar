# READY — grammar-wave-ui

## Result

- Rebased onto `origin/main` before final verification.
- Converted the complete `src/modules/ui` image: 40 production TypeScript files are grammar-clean, with 39 colocated test files and the intentional `PaneContent.interface.ts` contract-interface exemption.
- Changed 32 production files and 24 test files; added the extracted `TextSelectionGeometry` class/test pair and the missing colocated class-pair tests.
- Added `ui` to `CONVERTED_MODULES` in the final commit, so UI grammar violations are now enforced.
- Appended all 14 post-rebase grammar-only commit hashes to `.git-blame-ignore-revs`; every hash passed both `git cat-file -e <hash>^{commit}` and `git merge-base --is-ancestor <hash> HEAD`.
- Tip: `e70b3cdaba02c24d21d97bfea81571803a089109`

## Notable decisions

- `PaneContent.interface.ts` remains interface-first and is the checker-reported structural test-pair exemption.
- Detached renderer and geometry functions became prototype-reachable static methods; module constants became protected static getters, with cached `$` getters for collection/table data.
- Stateful UI controllers expose extension points at the protected floor and read their selected class seams late through protected getters.
- The second class formerly embedded in `TextSelectionModel.ts` moved to `TextSelectionGeometry.ts`, preserving one eponymous class per file and the shared normalization generator.
- Driven smoke execution was held while a sibling fleet process occupied the machine; that process explicitly paused before verification, after which all required smokes ran sequentially in this worktree's solo slot.
- No merge-gate was run, as required by `TASK.md`.

## Final instrument table

| Instrument | Result |
| --- | --- |
| `bun scripts/check-file-grammar.ts src/modules/ui` | PASS — 79 TypeScript files, 0 violations, UI enforced, 1 interface exemption |
| `bun scripts/check-file-grammar.ts` | PASS — 354 TypeScript files; remaining 114 report-only violations are outside UI |
| `bun scripts/ast-query.ts module-functions --path src/modules/ui` | PASS — 0 matches |
| `bun scripts/ast-query.ts private-members --path src/modules/ui` | PASS — 0 matches |
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 1,254 tests, 0 failures, 15,496 assertions across 181 files |
| `bash scripts/smoke-settings-applied.sh` | ALL-PASS |
| `bash scripts/smoke-voice-picker.sh` | ALL-PASS |
| `bash scripts/smoke-quickopen.sh` | ALL-PASS |
| `bash scripts/smoke-search-mouse.sh` | ALL-PASS |
| `bash scripts/smoke-find.sh` | ALL-PASS |
| `bash scripts/smoke-tabs.sh` | ALL-PASS |
| `bash scripts/smoke-shortcut-help.sh` | ALL-PASS |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 608 annotations resolved, 39 lattice links resolved, 0 problems |
| `bash scripts/conventions-gate.sh` | PASS |
| `git diff --check origin/main..HEAD` | PASS |
| Post-rebase blame-hash existence and ancestry proof | PASS — 14/14 |

## Conversion commits

- `e401e91bd03e59eff85937bc548073c77aa8a78d` — shared scroll controllers
- `1646220b0840ea443c73d8079c506803b168a4b0` — editor projection controllers
- `d0fc8777ddc76f4bc9ab7b60666be9daff95e8b2` — frame chrome controllers
- `2d3849c749ba33cf777179558c0a64f6e38747fe` — text and scroll geometry capabilities
- `22c669ad58df8ec8848f8a6d89870333e889125e` — pane render capabilities
- `20357bf31ccd119e83224afa2aad13ad64b6257e` — Quick Open renderer
- `8eb048c62de782e131bbeb391073a5ee07adb24d` — tab bar renderer
- `63dcea413684a8f5fe450eeafb6e110e2ad8a887` — activity bar controller
- `c9fac4f7dbf7f7d9abe000adc9c5b43c61d7320b` — modal overlay models
- `b20557da0300e11eb8998c8b4c74dda5370b8a25` — panel host model
- `1881bfa7e64a135b922e0ba0cb9838785590282f` — hover card controller
- `f2f658071f9d60965f8d3c215d9ff3cb75791e84` — shortcut help model
- `cb0d21fc57bb21df3fef99010d640106e470b6ad` — text selection geometry seam
- `b00b01ff211a894afa6df11acfcfc2d59d0a0089` — RootView builder
- `e70b3cdaba02c24d21d97bfea81571803a089109` — UI enforcement and blame hygiene
