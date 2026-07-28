# Image file-grammar wave — READY

## Tip

`9767d96ef7d3ab09daf37e6d38f30cbee83e25f2`

Branch: `grammar-wave-image`

Final base: `origin/main` at `249b5abe6c9c4ce3e943ce42a388b79d7fe8d1c1`

## Files converted

- `src/modules/image/HalfBlockRenderer.ts`
- `src/modules/image/ImageDecoders.ts`
- `src/modules/image/ImagePreview.ts`
- `src/modules/image/ImageRenderers.ts`
- `src/modules/image/ImageResample.ts`
- `src/modules/image/JpegDecoder.ts`
- `src/modules/image/KittyGraphics.ts`
- `src/modules/image/PixelImageMount.ts`
- `src/modules/image/PngDecoder.ts`
- `src/modules/image/SixelEncoder.ts`

Pair-completeness additions:

- `src/modules/image/ImagePreview.test.ts`
- `src/modules/image/ImageResample.test.ts`

Test seam adjustments:

- `src/modules/image/ImageDecoders.test.ts`
- `src/modules/image/KittyGraphics.test.ts`

Enforcement and blame hygiene:

- `scripts/check-file-grammar.ts` now includes `image` in `CONVERTED_MODULES`.
- `.git-blame-ignore-revs` includes all three rebased grammar-only conversion commits.

## Notable decisions

- Static capabilities keep immutable `const Class = Static($Class)` selections; the two plain
  stateful services keep their raw mutable `let Class = $Class` selections.
- Cross-module capabilities are resolved through protected late getters. No constructor reads a
  cross-module reference getter.
- Registry maps and constructed tables moved to receiver-aware `$` cached protected static getters,
  so subclass overrides govern base behavior and no runtime class seam is snapshotted at module load.
- Detached helpers became protected class methods; constants became protected static getters; all
  private members became protected.
- Static helper calls resolve through `this`, preserving subclass dispatch and avoiding the
  this-capture/static-resolution regression class.
- The new tests cover preview decode/render memoization, friendly decode failures, aspect fitting,
  and alpha-weighted resampling.
- No image invariant changed: this wave changes file shape and extensibility, not user behavior.

## Commits

| Commit | Purpose |
| --- | --- |
| `2883966fa81961b7ed71eafb05afaa319c654f5c` | Decoder file grammar |
| `2aede989d630a53079098b1aa080ee949e0fc5ab` | Projection file grammar |
| `5b51cd24acd38342603a68bfbfe5321f4bf47e99` | Preview file grammar |
| `9767d96ef7d3ab09daf37e6d38f30cbee83e25f2` | Enforce image grammar and record ignore revisions |

Each conversion hash passed both `git cat-file -e <hash>^{commit}` and
`git merge-base --is-ancestor <hash> HEAD` after the final origin freshness check.

## Verification

Final exact-tip instruments:

| Instrument | Result |
| --- | --- |
| `bun scripts/check-file-grammar.ts` | PASS; 305 TypeScript files, 7 modules enforced; image has 0 violations |
| `bun scripts/ast-query.ts module-functions --path src/modules/image` | PASS; 0 matches |
| `bun scripts/ast-query.ts private-members --path src/modules/image` | PASS; 0 matches |
| `bunx tsc --noEmit` | PASS; exit 0 |
| `bun test` | PASS; 1110 tests, 0 failures, 15063 expectations |
| invariant checker `--all --refs` | PASS; 587 annotations and 39 lattice links resolved, 0 problems |
| `bash scripts/smoke-image-preview.sh` | ALL-PASS, solo 1/1; exit 0 |

The driven smoke ran only after a machine-quiet check showed no merge-gate process and no other
fleet verification. It drove PNG preview, generated-JPEG preview, text restoration, and the
non-image binary guard through the real app.

Focused development runs were also green:

| File group | Result |
| --- | --- |
| Decoder tests | 15 pass, 0 fail |
| Projection tests | 15 pass, 0 fail |
| Preview/render/mount tests | 15 pass, 0 fail |

No merge gate was run for this branch.
