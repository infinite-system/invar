// probe-media-demo-kitty-setting.ts — arm 3: the USER'S persisted graphicsTier=kitty
// setting inside a terminal that does not render kitty images (the harness emulator).
// Run: bun tmp/probe-media-demo-kitty-setting.ts
// Reading: painted-cell count near zero while mediaMode=demo reproduces "nothing shown".
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyTestDriver } from '../scripts/harness/PtyTestDriver';
import { HarnessSmoke } from '../scripts/harness/HarnessSmoke';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'invar-demo-kitty-'));
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);
await Bun.write(join(fixtureRoot, 'sample.ts'), 'export const x = 1;\n');
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-demo-kitty-home-'));
const settingsDirectory = join(homeDirectory, '.config', 'invar');
mkdirSync(settingsDirectory, { recursive: true });
await Bun.write(
  join(settingsDirectory, 'settings.json'),
  JSON.stringify({ graphicsTier: 'kitty', theme: 'dark' }) + '\n',
);
const statusPath = join(homeDirectory, 'status.json');
const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 100,
  rows: 30,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath, PATH: process.env.PATH ?? '' },
});
await HarnessSmoke.Class.awaitStatus(
  driver,
  statusPath,
  'ready',
  (status) => status.ready === true,
  15_000,
);
driver.sendKeys('Control+Shift+p');
await driver.awaitGridCondition(
  'palette',
  (s) => s.findText('Command Palette') !== null,
);
driver.sendText('3d cube');
await driver.awaitGridCondition('query', (s) =>
  s.text().toLowerCase().includes('3d cube'),
);
driver.sendKeys('Enter');
await HarnessSmoke.Class.awaitStatus(
  driver,
  statusPath,
  'demo mode',
  (s) => s.mediaMode === 'demo',
  10_000,
).catch(() => console.log('demo mode NOT reached'));
await Bun.sleep(1500);
const finalStatus = await HarnessSmoke.Class.readStatus(statusPath);
console.log(
  `mediaMode=${finalStatus.mediaMode} frameIndex=${finalStatus.mediaFrameIndex}`,
);
const snapshot = driver.snapshot();
let paintedCells = 0;
for (let row = 15; row < 30; row++)
  for (let column = 0; column < 100; column++) {
    const cell = snapshot.cell(row, column);
    if (cell && cell.characters.trim() !== '') paintedCells += 1;
  }
console.log(`non-blank cells in bottom half = ${paintedCells}`);
for (let row = 16; row < 24; row++) {
  const text = snapshot
    .rowCells(row)
    .map((c) => c?.characters ?? ' ')
    .join('')
    .trimEnd();
  console.log(`row ${row}: ${JSON.stringify(text.slice(0, 90))}`);
}
driver.sendKeys('Control+q');
