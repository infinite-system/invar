#!/usr/bin/env bun
/**
 * This probe drives the wrap contract fixture through the real PTY and prints its final scrollTop.
 * Run it from the repository root:
 *   bun .invar/tasks/active/233-wrap-contract-red-settings-leak/233-drive-wrap-settings-polarity.ts
 *   bun .invar/tasks/active/233-wrap-contract-red-settings-leak/233-drive-wrap-settings-polarity.ts --home /tmp/home --word-wrap true
 *   bun .invar/tasks/active/233-wrap-contract-red-settings-leak/233-drive-wrap-settings-polarity.ts --home /tmp/home --word-wrap false --expect-visual-extent
 *   bun .invar/tasks/active/233-wrap-contract-red-settings-leak/233-drive-wrap-settings-polarity.ts --home /tmp/home --word-wrap true --geometry 256x54
 * With no --home, the app inherits the real user home. With --home, it reads that isolated home.
 * The optional --word-wrap flag creates the complete home and plants that explicit polarity.
 * The optional geometry shows whether the fixture wraps at the terminal size the app receives.
 * A result near the logical-line maximum is the non-wrap cap. A result above 200 proves visual-row
 * wrap extent. --expect-visual-extent exits nonzero when the result is at or below 200, so planting
 * false is the positive control for the wrap contract.
 */
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const homeArgumentIndex = process.argv.indexOf('--home');
const homeDirectory =
  homeArgumentIndex >= 0 ? process.argv[homeArgumentIndex + 1] : undefined;
if (homeArgumentIndex >= 0 && !homeDirectory) {
  throw new Error('--home requires a directory');
}
const wordWrapArgumentIndex = process.argv.indexOf('--word-wrap');
const expectVisualExtent = process.argv.includes('--expect-visual-extent');
const geometryArgumentIndex = process.argv.indexOf('--geometry');
const geometryText =
  geometryArgumentIndex >= 0
    ? process.argv[geometryArgumentIndex + 1]
    : '120x40';
const geometryMatch = /^(\d+)x(\d+)$/.exec(geometryText ?? '');
if (!geometryMatch) {
  throw new Error('--geometry requires COLUMNSxROWS');
}
const columns = Number(geometryMatch[1]);
const rows = Number(geometryMatch[2]);
const wordWrapText =
  wordWrapArgumentIndex >= 0
    ? process.argv[wordWrapArgumentIndex + 1]
    : undefined;
if (
  wordWrapArgumentIndex >= 0 &&
  wordWrapText !== 'true' &&
  wordWrapText !== 'false'
) {
  throw new Error('--word-wrap requires true or false');
}
if (wordWrapText !== undefined && homeDirectory === undefined) {
  throw new Error('--word-wrap requires --home');
}
if (homeDirectory) {
  for (const directoryPath of [
    join(homeDirectory, '.config', 'invar'),
    join(homeDirectory, '.local', 'share', 'invar'),
    join(homeDirectory, '.local', 'state'),
    join(homeDirectory, '.cache'),
  ]) {
    mkdirSync(directoryPath, { recursive: true });
  }
}
if (wordWrapText !== undefined && homeDirectory !== undefined) {
  await Bun.write(
    join(homeDirectory, '.config', 'invar', 'settings.json'),
    JSON.stringify({ wordWrap: wordWrapText === 'true' }, null, 2) + '\n',
  );
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-233-wrap-polarity-'));
const statusPath = join(fixtureRoot, 'status.json');
const fixturePath = join(fixtureRoot, 'w.txt');
await Bun.write(
  fixturePath,
  Array.from(
    { length: 200 },
    (_, lineIndex) =>
      `L${String(lineIndex).padStart(3, '0')} ${'word '.repeat(40)}\n`,
  ).join(''),
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns,
  rows,
  ...(homeDirectory ? { homeDirectory } : {}),
  environment: {
    TUI_STATUS_PATH: statusPath,
    ...(homeDirectory
      ? {
          XDG_CONFIG_HOME: join(homeDirectory, '.config'),
          XDG_DATA_HOME: join(homeDirectory, '.local', 'share'),
          XDG_STATE_HOME: join(homeDirectory, '.local', 'state'),
          XDG_CACHE_HOME: join(homeDirectory, '.cache'),
        }
      : {}),
  },
});

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the wrap polarity fixture is ready',
    (status) => status.ready === true && status.renderQuiescent === true,
    20_000,
  );
  for (let openAttempt = 0; openAttempt < 4; openAttempt += 1) {
    const currentStatus = HarnessSmoke.Class.readStatus(statusPath);
    if (
      typeof currentStatus.activeBuffer === 'string' &&
      currentStatus.activeBuffer.length > 0
    ) {
      break;
    }
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the wrap polarity fixture opens its only file',
      (status) =>
        typeof status.activeBuffer === 'string' &&
        status.activeBuffer.length > 0,
      2_000,
    ).catch(() => undefined);
  }
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the wrap polarity fixture has an active buffer',
    (status) =>
      typeof status.activeBuffer === 'string' && status.activeBuffer.length > 0,
  );
  const openedStatus = HarnessSmoke.Class.readStatus(statusPath);
  const editorCenter = (
    openedStatus.layoutSlots as
      | { editorCenter?: { left?: number; top?: number; width?: number } }
      | undefined
  )?.editorCenter;
  driver.sendMouseClick({
    column:
      Number(editorCenter?.left ?? 37) +
      Math.floor(Number(editorCenter?.width ?? 83) / 2),
    row: Number(editorCenter?.top ?? 0) + 8,
    button: 'left',
  });
  await driver.awaitScreenChange();
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the wrap polarity drive focuses the editor',
    (status) => status.focus === 'editor',
  );
  const frameBeforeEnd = Number(
    HarnessSmoke.Class.readStatus(statusPath).frame,
  );
  driver.sendKeys('Control+End');
  await driver.awaitScreenChange();
  const finalStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the wrap polarity drive publishes the Control End frame',
    (status) => Number(status.frame) > frameBeforeEnd,
  );
  console.log(
    `home=${homeDirectory ?? process.env.HOME ?? '(unset)'} ` +
      `geometry=${columns}x${rows} ` +
      `scrollTop=${String(finalStatus.editorScrollTop)} ` +
      `cursorLineIndex=${String(finalStatus.cursorLineIndex)}`,
  );
  if (expectVisualExtent && Number(finalStatus.editorScrollTop) <= 200) {
    throw new Error(
      `wrap-mode capped at logical lines (scrollTop=${String(finalStatus.editorScrollTop)}, ` +
        `expected > 200 visual rows)`,
    );
  }
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
}
