// probe-media-demo-default-tier.ts — reproduce "3D demo shows nothing" in a real PTY.
// Drives the app like a user: palette -> "3d cube" -> Enter, WITHOUT forcing
// TUI_GRAPHICS_TIER (arm 1) and WITH halfblock forced (arm 2, the smoke's setup).
// Run: bun tmp/probe-media-demo-default-tier.ts
// Reading: each arm prints mediaMode/frameIndex from status and a text dump of the
// bottom pane rows. "nothing shown" reproduced = pane rows empty while mediaMode=demo.
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyTestDriver } from '../scripts/harness/PtyTestDriver';
import { HarnessSmoke } from '../scripts/harness/HarnessSmoke';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'invar-demo-probe-'));
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);
await Bun.write(join(fixtureRoot, 'sample.ts'), 'export const x = 1;\n');

async function driveArm(label: string, tier: string | undefined) {
  const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-demo-home-'));
  mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
  const statusPath = join(homeDirectory, 'status.json');
  const environment: Record<string, string> = {
    TUI_STATUS_PATH: statusPath,
    PATH: process.env.PATH ?? '',
  };
  if (tier) environment.TUI_GRAPHICS_TIER = tier;
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 100,
    rows: 30,
    homeDirectory,
    environment,
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${label}: session ready`,
      (status) => status.ready === true,
      15_000,
    );
    driver.sendKeys('Control+Shift+p');
    await driver.awaitGridCondition(
      `${label}: palette visible`,
      (snapshot) => snapshot.findText('Command Palette') !== null,
    );
    driver.sendText('3d cube');
    await driver.awaitGridCondition(`${label}: query shown`, (snapshot) =>
      snapshot.text().toLowerCase().includes('3d cube'),
    );
    const paletteText = driver.snapshot().text();
    const hasEntry = paletteText.toLowerCase().includes('cube and torus demo');
    console.log(`${label}: palette entry present = ${hasEntry}`);
    driver.sendKeys('Enter');
    const status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${label}: demo mode reached`,
      (candidate) => candidate.mediaMode === 'demo',
      10_000,
    ).catch(() => null);
    await Bun.sleep(1500);
    const finalStatus = await HarnessSmoke.Class.readStatus(statusPath);
    console.log(
      `${label}: mediaMode=${finalStatus.mediaMode} frameIndex=${finalStatus.mediaFrameIndex} scene=${finalStatus.mediaActiveScene}`,
    );
    const snapshot = driver.snapshot();
    let paintedCells = 0;
    for (let row = 15; row < 30; row++) {
      for (let column = 0; column < 100; column++) {
        const cell = snapshot.cell(row, column);
        if (cell && cell.characters.trim() !== '') paintedCells += 1;
      }
    }
    console.log(`${label}: non-blank cells in bottom half = ${paintedCells}`);
    for (let row = 16; row < 24; row++) {
      const text = snapshot
        .rowCells(row)
        .map((cell) => cell?.characters ?? ' ')
        .join('')
        .trimEnd();
      if (text)
        console.log(
          `${label}: row ${row}: ${JSON.stringify(text.slice(0, 90))}`,
        );
    }
    driver.sendKeys('Control+q');
    await Bun.sleep(300);
  } finally {
    driver.dispose?.();
  }
}

await driveArm('default-tier', undefined);
await driveArm('halfblock', 'halfblock');
console.log('PROBE DONE');
