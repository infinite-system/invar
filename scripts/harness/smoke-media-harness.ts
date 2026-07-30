#!/usr/bin/env bun
// Drive the animated-media plugin through the real PTY at small and large geometry, with half-block
// and kitty graphics, both host glyph tiers, working and missing ffmpeg, pause, scene selection,
// resize, and a longest-animation memory check. Run it with
// `bun scripts/harness/smoke-media-harness.ts`. ALL-PASS means every completed cell frame stayed
// painted, the two frame buffers remained the whole video working set, the planted retention leak
// failed, and the real fixed-geometry path stayed memory-flat. Run
// `INVAR_MEDIA_SMOKE_ARM=animation INVAR_MEDIA_SMOKE_PLANT_RETENTION_LEAK=1 bun
// scripts/harness/smoke-media-harness.ts` to make the memory assertion fail red.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
// invariant: Animation reuses one fixed framebuffer working set (src/modules/media/media.invariants.md)
// invariant: Video decoding never exceeds the showing and decoding frames (src/modules/media/media.invariants.md)
// invariant: Playback memory is independent of duration (src/modules/media/media.invariants.md)
// invariant: Missing ffmpeg is loud and harmless (src/modules/media/media.invariants.md)
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CellFramebuffer } from '../../src/modules/media/CellFramebuffer';
import { SoftwareScene } from '../../src/modules/media/SoftwareScene';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

interface HeadingControl {
  readonly action: 'add' | 'expand' | 'close';
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

interface HeadingGeometry {
  readonly contentId: string;
  readonly row: number;
  readonly controls: readonly HeadingControl[];
}

interface MediaFrameFingerprint {
  readonly frameNumber: number;
  readonly coloredCellCount: number;
  readonly colorHash: number | bigint;
}

interface MediaMemoryMeasurement {
  readonly frameCount: number;
  readonly managedGrowthBytes: number;
  readonly workingSetBytes: number;
  readonly bufferGeneration: number;
  readonly retainedFrameCount: number;
  readonly retainedFrames: readonly Uint8Array[];
}

function assertContinuousAnimation(
  frames: readonly MediaFrameFingerprint[],
): void {
  if (frames.length < 2) {
    throw new Error(
      `media animation exposed only ${frames.length} completed frame`,
    );
  }
  const blankFrame = frames.find((frame) => frame.coloredCellCount === 0);
  if (blankFrame) {
    throw new Error(
      `media animation exposed blank frame ${blankFrame.frameNumber}`,
    );
  }
  if (new Set(frames.map((frame) => frame.colorHash)).size < 2) {
    throw new Error('media animation did not change between completed frames');
  }
}

function measureMediaMemory(
  frameCount: number,
  retainFrameCopies: boolean,
): MediaMemoryMeasurement {
  const framebuffer = new CellFramebuffer.Class(96, 36);
  const scene = new SoftwareScene.Class();
  const retainedFrames: Uint8Array[] = [];
  for (let warmupFrameIndex = 0; warmupFrameIndex < 20; warmupFrameIndex++) {
    scene.render(framebuffer, warmupFrameIndex / 15, 'automatic');
  }
  Bun.gc(true);
  const startingMemory = process.memoryUsage();
  const startingManagedBytes =
    startingMemory.heapUsed + startingMemory.external;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    scene.render(framebuffer, frameIndex / 15, 'automatic');
    if (retainFrameCopies) {
      retainedFrames.push(framebuffer.rgba.slice());
    }
  }
  Bun.gc(true);
  const endingMemory = process.memoryUsage();
  const endingManagedBytes = endingMemory.heapUsed + endingMemory.external;
  return {
    frameCount,
    managedGrowthBytes: Math.max(0, endingManagedBytes - startingManagedBytes),
    workingSetBytes: framebuffer.workingSetBytes,
    bufferGeneration: framebuffer.bufferGeneration,
    retainedFrameCount: retainedFrames.length,
    retainedFrames,
  };
}

function assertDurationIndependentMemory(
  shortRun: MediaMemoryMeasurement,
  longRun: MediaMemoryMeasurement,
  managedMemoryEnvelopeBytes: number,
): void {
  const excessManagedGrowth =
    longRun.managedGrowthBytes - shortRun.managedGrowthBytes;
  if (
    longRun.workingSetBytes !== shortRun.workingSetBytes ||
    excessManagedGrowth > managedMemoryEnvelopeBytes
  ) {
    throw new Error(
      `media memory grew with duration: short=${shortRun.managedGrowthBytes} managed bytes, ` +
        `long=${longRun.managedGrowthBytes} managed bytes, excess=${excessManagedGrowth}, ` +
        `envelope=${managedMemoryEnvelopeBytes}, workingSet=${shortRun.workingSetBytes}/` +
        `${longRun.workingSetBytes}`,
    );
  }
}

function mediaHalfBlockFingerprint(
  snapshot: HarnessSnapshot.Model,
  frameNumber: number,
): MediaFrameFingerprint | null {
  if (!snapshot.findText('3D Demo ·')) return null;
  const colors: number[] = [];
  for (let row = 0; row < snapshot.rows; row++) {
    for (let column = 0; column < snapshot.columns; column++) {
      const cell = snapshot.cell(row, column);
      if (
        cell?.characters === '▀' &&
        cell.isForegroundRgb &&
        cell.isBackgroundRgb
      ) {
        colors.push(cell.foreground, cell.background);
      }
    }
  }
  return {
    frameNumber,
    coloredCellCount: colors.length / 2,
    colorHash: Bun.hash(new Uint32Array(colors)),
  };
}

function mediaVideoHalfBlockCount(snapshot: HarnessSnapshot.Model): number {
  if (!snapshot.findText('Sample Video')) return 0;
  let count = 0;
  for (let row = 0; row < snapshot.rows; row++) {
    for (let column = 0; column < snapshot.columns; column++) {
      const cell = snapshot.cell(row, column);
      if (
        cell?.characters === '▀' &&
        cell.isForegroundRgb &&
        cell.isBackgroundRgb
      ) {
        count += 1;
      }
    }
  }
  return count;
}

function headingCloseGlyph(
  snapshot: HarnessSnapshot.Model,
  status: StatusSnapshot,
  contentId: string,
): string | null {
  const headings = status.panelHeadingGeometry as
    readonly HeadingGeometry[] | undefined;
  const heading = headings?.find(
    (candidate) => candidate.contentId === contentId,
  );
  const closeControl = heading?.controls.find(
    (control) => control.action === 'close',
  );
  if (!heading || !closeControl) return null;
  return snapshot
    .rowCells(heading.row)
    .slice(closeControl.startColumn, closeControl.endColumnExclusive)
    .map((cell) => cell.characters)
    .join('')
    .trim();
}

async function openCommand(
  driver: PtyTestDriver.Model,
  query: string,
): Promise<void> {
  driver.sendKeys('Control+Shift+p');
  await driver.awaitGridCondition(
    'the command palette is visible before the media query is entered',
    (snapshot) => snapshot.findText('Command Palette') !== null,
  );
  driver.sendText(query);
  await driver.awaitGridCondition(
    `the command palette shows the media query ${query}`,
    (snapshot) => snapshot.text().toLowerCase().includes(query.toLowerCase()),
  );
  driver.sendKeys('Enter');
}

async function forceGlyphMode(
  homeDirectory: string,
  glyphMode: 'unicode' | 'ascii',
): Promise<void> {
  const settingsDirectory = join(homeDirectory, '.config', 'invar');
  mkdirSync(settingsDirectory, { recursive: true });
  await Bun.write(
    join(settingsDirectory, 'settings.json'),
    `${JSON.stringify({ glyphMode })}\n`,
  );
}

function linkRequiredCommand(
  targetDirectory: string,
  commandName: string,
): void {
  const commandPath = Bun.which(commandName);
  if (!commandPath) return;
  symlinkSync(commandPath, join(targetDirectory, commandName));
}

async function createFakeFfmpeg(executablePath: string): Promise<void> {
  await Bun.write(
    executablePath,
    `#!/usr/bin/python3
# This temporary ffmpeg stand-in emits deterministic raw RGBA frames for the media PTY smoke.
# The smoke runs it through FfmpegVideoSource; a blocked stdout write proves pipe backpressure.
import re
import sys

source = next((argument for argument in sys.argv if argument.startswith("testsrc2=")), "")
match = re.search(r"size=(\\d+)x(\\d+)", source)
if match is None:
    raise SystemExit(2)
width = int(match.group(1))
height = int(match.group(2))
frame_index = 0
output = sys.stdout.buffer if sys.argv[-1] == "-" else open(sys.argv[-1], "wb", buffering=0)
try:
    while True:
        frame = bytearray(width * height * 4)
        for row in range(height):
            for column in range(width):
                offset = (row * width + column) * 4
                frame[offset] = (column * 7 + frame_index * 11) % 256
                frame[offset + 1] = (row * 13 + frame_index * 5) % 256
                frame[offset + 2] = ((column + row) * 3 + frame_index * 17) % 256
                frame[offset + 3] = 255
        output.write(frame)
        output.flush()
        frame_index += 1
except BrokenPipeError:
    pass
finally:
    if output is not sys.stdout.buffer:
        output.close()
`,
  );
  chmodSync(executablePath, 0o755);
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-media-harness-'));
const plantRetentionLeak =
  process.env.INVAR_MEDIA_SMOKE_PLANT_RETENTION_LEAK === '1';
const fakeBinaryDirectory = join(fixtureRoot, 'fake-bin');
const missingFfmpegBinaryDirectory = join(fixtureRoot, 'missing-ffmpeg-bin');
mkdirSync(fakeBinaryDirectory);
mkdirSync(missingFfmpegBinaryDirectory);
for (const commandName of ['setsid', 'git', 'rg', 'bash', 'sh']) {
  linkRequiredCommand(missingFfmpegBinaryDirectory, commandName);
}
const fakeFfmpegPath = join(fakeBinaryDirectory, 'ffmpeg');
await createFakeFfmpeg(fakeFfmpegPath);
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);
await Bun.write(
  join(fixtureRoot, 'sample.ts'),
  'export const mediaFixture = "small and large";\n',
);

console.log('== harness media: unit contracts and positive controls ==');
const unitResult = Bun.spawnSync(
  [process.execPath, 'test', 'src/modules/media/'],
  { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' },
);
HarnessSmoke.Class.requireCondition(
  unitResult.exitCode === 0,
  'media module unit contracts, including planted red controls',
);
let blankFrameControlRejected = false;
try {
  assertContinuousAnimation([
    { frameNumber: 1, coloredCellCount: 40, colorHash: 100 },
    { frameNumber: 2, coloredCellCount: 0, colorHash: 0 },
  ]);
} catch {
  blankFrameControlRejected = true;
}
HarnessSmoke.Class.requireCondition(
  blankFrameControlRejected,
  'the planted blank animation frame fails the continuity assertion',
);

async function driveHalfBlockAnimation(): Promise<void> {
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-media-halfblock-home-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  await forceGlyphMode(homeDirectory, 'unicode');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 100,
    rows: 30,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      TUI_GRAPHICS_TIER: 'halfblock',
      PATH: `${fakeBinaryDirectory}:${process.env.PATH ?? ''}`,
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the small half-block session is ready',
      (status) => status.ready === true && status.width === 100,
      15_000,
    );
    const observationBaseline = driver.completedFrameObservationCount;
    await openCommand(driver, '3d cube');
    const initialStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the 3D demo opens at small geometry',
      (status) =>
        status.mediaMode === 'demo' && Number(status.mediaFrameIndex) >= 2,
    );
    const initialWorkingSetBytes = Number(initialStatus.mediaWorkingSetBytes);
    const initialBufferGeneration = Number(initialStatus.mediaBufferGeneration);
    await driver.awaitGridCondition(
      'the small 3D demo paints varied truecolor half blocks',
      (snapshot) => {
        const fingerprint = mediaHalfBlockFingerprint(snapshot, 0);
        return fingerprint !== null && fingerprint.coloredCellCount > 100;
      },
    );
    const initialFingerprints = driver
      .completedFrameObservationsSince(observationBaseline)
      .map((observation, observationIndex) =>
        mediaHalfBlockFingerprint(observation.snapshot, observationIndex),
      )
      .filter(
        (fingerprint): fingerprint is MediaFrameFingerprint =>
          fingerprint !== null,
      );
    assertContinuousAnimation(initialFingerprints);
    HarnessSmoke.Class.pass(
      `${initialFingerprints.length} completed small animation frames stayed painted and changed`,
    );
    const unicodeSnapshot = driver.snapshot();
    HarnessSmoke.Class.requireCondition(
      headingCloseGlyph(unicodeSnapshot, initialStatus, 'media-demo') === '×',
      'the media pane uses Unicode host chrome at the Unicode glyph tier',
    );

    driver.sendKeys('t');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the user scene key selects the torus',
      (status) => status.mediaScene === 'torus',
    );
    await driver.awaitGridCondition(
      'the torus title is painted after the scene key',
      (snapshot) => snapshot.findText('3D Demo · Torus') !== null,
    );
    driver.sendKeys('Space');
    const pausedStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the user pause key stops the demo',
      (status) => status.mediaPaused === true,
    );
    const pausedFrameIndex = Number(pausedStatus.mediaFrameIndex);
    driver.sendKeys('Space');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the user pause key resumes visible progress',
      (status) =>
        status.mediaPaused === false &&
        Number(status.mediaFrameIndex) > pausedFrameIndex,
    );

    const resizeObservationBaseline = driver.completedFrameObservationCount;
    driver.resize(160, 50);
    const largeStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the 3D demo reallocates once for large geometry',
      (status) =>
        status.width === 160 &&
        status.height === 50 &&
        Number(status.mediaWorkingSetBytes) > initialWorkingSetBytes &&
        Number(status.mediaBufferGeneration) > initialBufferGeneration,
    );
    const largeWorkingSetBytes = Number(largeStatus.mediaWorkingSetBytes);
    const largeBufferGeneration = Number(largeStatus.mediaBufferGeneration);
    driver.sendKeys('a');
    const automaticStartFrame = Number(largeStatus.mediaFrameIndex);
    const longestAnimationStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the large automatic animation reaches the torus interval',
      (status) =>
        status.mediaScene === 'torus' &&
        Number(status.mediaFrameIndex) >= automaticStartFrame + 75,
    );
    HarnessSmoke.Class.requireCondition(
      Number(longestAnimationStatus.mediaWorkingSetBytes) ===
        largeWorkingSetBytes &&
        Number(longestAnimationStatus.mediaBufferGeneration) ===
          largeBufferGeneration,
      `the longest large animation kept generation ${largeBufferGeneration} and ${largeWorkingSetBytes} working bytes`,
    );
    const resizeFingerprints = driver
      .completedFrameObservationsSince(resizeObservationBaseline)
      .map((observation, observationIndex) =>
        mediaHalfBlockFingerprint(observation.snapshot, observationIndex),
      )
      .filter(
        (fingerprint): fingerprint is MediaFrameFingerprint =>
          fingerprint !== null,
      );
    assertContinuousAnimation(resizeFingerprints);
    HarnessSmoke.Class.pass(
      `${resizeFingerprints.length} completed resize and large-scale frames stayed painted`,
    );

    const shortMemoryRun = measureMediaMemory(30, false);
    const longMemoryRun = measureMediaMemory(300, plantRetentionLeak);
    assertDurationIndependentMemory(
      shortMemoryRun,
      longMemoryRun,
      4 * 1024 * 1024,
    );
    HarnessSmoke.Class.pass(
      `real 30/300-frame path stayed flat at ${shortMemoryRun.workingSetBytes} working bytes; managed growth ${shortMemoryRun.managedGrowthBytes}/${longMemoryRun.managedGrowthBytes}`,
    );
    const shortLeak = measureMediaMemory(30, true);
    const longLeak = measureMediaMemory(300, true);
    let plantedLeakRejected = false;
    try {
      assertDurationIndependentMemory(shortLeak, longLeak, 4 * 1024 * 1024);
    } catch {
      plantedLeakRejected = true;
    }
    HarnessSmoke.Class.requireCondition(
      plantedLeakRejected,
      `the planted ${longLeak.retainedFrameCount}-frame retention leak fails the memory-flatness assertion`,
    );

    driver.sendKeys('Control+q');
    HarnessSmoke.Class.requireCondition(
      (await driver.exitCode()) === 0,
      'the half-block demo session quits cleanly',
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function driveVideoPresent(): Promise<void> {
  const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-media-video-home-'));
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 100,
    rows: 30,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      TUI_GRAPHICS_TIER: 'halfblock',
      PATH: `${fakeBinaryDirectory}:${process.env.PATH ?? ''}`,
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the fake-ffmpeg video session is ready',
      (status) => status.ready === true && status.mediaFfmpegAvailable === true,
      15_000,
    );
    await openCommand(driver, 'generated sample video');
    const videoStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the generated video decodes through the fake ffmpeg pipe',
      (status) =>
        status.mediaMode === 'video' &&
        status.mediaNotice === null &&
        Number(status.mediaDecodedFrameCount) >= 3,
      15_000,
    );
    HarnessSmoke.Class.requireCondition(
      videoStatus.mediaResidentVideoBufferCount === 2,
      'video playback owns exactly the showing and decoding buffers',
    );
    await driver.awaitGridCondition(
      'the decoded generated video paints visible half blocks',
      (snapshot) => mediaVideoHalfBlockCount(snapshot) > 100,
    );
    driver.sendKeys('Space');
    const pausedVideoStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the user pause key stops generated video playback',
      (status) => status.mediaPaused === true,
    );
    const pausedDecodedFrameCount = Number(
      pausedVideoStatus.mediaDecodedFrameCount,
    );
    driver.sendKeys('Space');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the user pause key resumes ffmpeg pull-paced decode',
      (status) =>
        status.mediaPaused === false &&
        Number(status.mediaDecodedFrameCount) > pausedDecodedFrameCount,
    );
    driver.sendKeys('Control+q');
    HarnessSmoke.Class.requireCondition(
      (await driver.exitCode()) === 0,
      'the pull-paced generated-video session quits cleanly',
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function driveKittyAndAsciiChrome(): Promise<void> {
  const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-media-kitty-home-'));
  const statusPath = join(homeDirectory, 'status.json');
  await forceGlyphMode(homeDirectory, 'ascii');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 100,
    rows: 30,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      TUI_GRAPHICS_TIER: 'kitty',
    },
  });
  driver.outputSequenceCount('\x1b[?2026h\x1b_G');
  driver.outputSequenceCount('\x1b_Ga=T');
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the kitty and ASCII session is ready',
      (status) => status.ready === true,
      15_000,
    );
    await openCommand(driver, '3d cube');
    const demoStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the 3D demo opens at the kitty tier',
      (status) => status.mediaMode === 'demo',
    );
    await driver.awaitOutputCondition(
      'a synchronized kitty image transmit reaches the raw PTY stream',
      () =>
        driver.outputSequenceCount('\x1b[?2026h\x1b_G') > 0 &&
        driver.outputSequenceCount('\x1b_Ga=T') > 0,
    );
    HarnessSmoke.Class.requireCondition(
      driver.outputSequenceCount('\x1b[?2026h\x1b_G') > 0 &&
        driver.outputSequenceCount('\x1b_Ga=T') > 0,
      'the rich graphics tier emits a synchronized kitty image payload',
    );
    const snapshot = driver.snapshot();
    HarnessSmoke.Class.requireCondition(
      headingCloseGlyph(snapshot, demoStatus, 'media-demo') === 'x',
      'the media pane uses ASCII host chrome at the ASCII glyph tier',
    );
    driver.sendKeys('Control+q');
    HarnessSmoke.Class.requireCondition(
      (await driver.exitCode()) === 0,
      'the kitty and ASCII session quits cleanly',
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function driveMissingFfmpeg(): Promise<void> {
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-media-missing-ffmpeg-home-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 100,
    rows: 30,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      TUI_GRAPHICS_TIER: 'halfblock',
      PATH: missingFfmpegBinaryDirectory,
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the isolated PATH session is ready without ffmpeg',
      (status) =>
        status.ready === true && status.mediaFfmpegAvailable === false,
      15_000,
    );
    await openCommand(driver, 'generated sample video');
    const unavailableStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'missing ffmpeg publishes an explicit video notice',
      (status) =>
        status.mediaMode === 'video' &&
        String(status.mediaNotice).includes('not found on PATH'),
    );
    HarnessSmoke.Class.requireCondition(
      unavailableStatus.mediaResidentVideoBufferCount === 0,
      'missing ffmpeg allocates no video frame buffers',
    );
    await driver.awaitGridCondition(
      'the missing-ffmpeg pane paints a loud unavailable message',
      (snapshot) =>
        snapshot.findText('VIDEO UNAVAILABLE') !== null &&
        snapshot.findText('ffmpeg was not found on PATH') !== null,
    );
    HarnessSmoke.Class.pass(
      'missing ffmpeg stays in the live pane with a visible explanation',
    );
    driver.sendKeys('Control+q');
    HarnessSmoke.Class.requireCondition(
      (await driver.exitCode()) === 0,
      'the missing-ffmpeg session quits cleanly',
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

const requestedArm = process.env.INVAR_MEDIA_SMOKE_ARM ?? 'all';

try {
  if (requestedArm === 'all' || requestedArm === 'animation') {
    console.log('== harness media: half-block animation, scale, and memory ==');
    await driveHalfBlockAnimation();
  }
  if (requestedArm === 'all' || requestedArm === 'video') {
    console.log(
      '== harness media: generated sample through pull-paced ffmpeg ==',
    );
    await driveVideoPresent();
  }
  if (requestedArm === 'all' || requestedArm === 'kitty') {
    console.log('== harness media: kitty protocol and ASCII host chrome ==');
    await driveKittyAndAsciiChrome();
  }
  if (requestedArm === 'all' || requestedArm === 'missing') {
    console.log('== harness media: missing ffmpeg degradation ==');
    await driveMissingFfmpeg();
  }
  console.log('== harness media: ALL PASS ==');
} finally {
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
}
