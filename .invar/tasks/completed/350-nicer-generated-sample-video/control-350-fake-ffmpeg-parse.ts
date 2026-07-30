// What this script finds out: whether the fake ffmpeg inside
// scripts/harness/smoke-media-harness.ts still reads the frame size from the
// lavfi source, and whether it still fails loudly when the source carries no
// size. The fake now reads the argument after "-i", the same way ffmpeg does,
// so this control proves the new parse both works and can go red.
//
// It lifts the python text straight out of the smoke script, so it tests the
// code the smoke really runs, not a copy that can drift.
//
// Run it:
//   bun .invar/tasks/in-progress/350-nicer-generated-sample-video/control-350-fake-ffmpeg-parse.ts
//
// How to read the output: two lines. "good source" must report whole frames
// of 128 bytes each, because the fake writes 8x4 RGBA frames until it is
// stopped (this control stops it after a second, so its exit code is the
// stop, not a failure). "source without a size" must report exit 2, which is
// the loud failure. Any other pair means the fake ffmpeg no longer matches
// the real argument vector.

import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const smokeSource = await Bun.file(
  'scripts/harness/smoke-media-harness.ts',
).text();
const startMarker = '#!/usr/bin/python3';
const start = smokeSource.indexOf(startMarker);
const end = smokeSource.indexOf('`,\n  );', start);
if (start < 0 || end < 0) {
  console.error('could not find the fake ffmpeg text in the smoke script');
  process.exit(2);
}
// The smoke embeds the python inside a template string, so a backslash there
// is written twice. Undo that one escape.
const fakeText = smokeSource.slice(start, end).replaceAll('\\\\', '\\');

const directory = mkdtempSync(join(tmpdir(), 'invar-350-fake-ffmpeg-'));
const fakePath = join(directory, 'ffmpeg');
await Bun.write(fakePath, fakeText);
chmodSync(fakePath, 0o755);

const frameByteLength = 8 * 4 * 4;

function runFake(sourceArgument: string): { exitCode: number; bytes: number } {
  const outputPath = join(directory, `out-${sourceArgument.length}.rgba`);
  // The fake writes frames until it is stopped. One second is enough for many
  // frames, and it keeps the temporary file small.
  const result = Bun.spawnSync(
    [fakePath, '-f', 'lavfi', '-i', sourceArgument, '-y', outputPath],
    { stdout: 'pipe', stderr: 'pipe', timeout: 1_000 },
  );
  const bytes = Bun.file(outputPath).size;
  rmSync(outputPath, { force: true });
  return { exitCode: result.exitCode ?? -1, bytes };
}

const good = runFake('mandelbrot=size=8x4:rate=15:maxiter=150');
console.log(
  `good source: wrote ${good.bytes} bytes, ${good.bytes % frameByteLength === 0 && good.bytes > 0 ? 'whole' : 'BROKEN'} frames of ${frameByteLength} bytes`,
);
const bad = runFake('mandelbrot=rate=15:maxiter=150');
console.log(`source without a size: exit ${bad.exitCode} (2 is the loud one)`);
rmSync(directory, { recursive: true, force: true });
