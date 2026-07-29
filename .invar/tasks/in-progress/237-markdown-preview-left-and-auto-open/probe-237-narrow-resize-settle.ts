#!/usr/bin/env bun
// Probe for #237 — reproduces TWO pre-existing host defects (both also present on main):
//
// 1. RESIZE NEVER RE-LAYS-OUT WITHOUT A MOUSE EVENT: after a terminal shrink to 60x25 the
//    markdown split keeps its wide-layout pane widths for as long as you watch. Read the t+Ns
//    lines: the preview pane runs past the terminal edge with no closing corner. One click into
//    the source pane or the divider before the resize makes the same shrink settle.
// 2. A BOOT-TIME settings.save() ERASES SEEDED CONTRIBUTED SETTINGS: this probe seeds
//    ~/.config/invar/settings.json with markdownPreviewSide='right', yet STATUS prints side=left
//    and USERFILE shows the file rewritten with 'left' — a save that runs before the markdown
//    plugin registers persists a snapshot without the not-yet-registered keys, dropping the
//    user's stored value (suspect: the agent-provider write-back save, Bootstrap.ts:638).
//
// Run: bun .invar/tasks/in-progress/237-markdown-preview-left-and-auto-open/probe-237-narrow-resize-settle.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'probe-237-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'probe-237-home-'));
const statusPath = join(homeDirectory, 'status.json');
import { mkdirSync } from 'node:fs';
mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
await Bun.write(
  join(homeDirectory, '.config', 'invar', 'settings.json'),
  JSON.stringify({ markdownPreviewSide: 'right' }),
);
await Bun.write(join(fixtureRoot, 'README.md'), '# Heading\n\nBody text.\n');

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath, LANG: 'C.UTF-8', NERD_FONT: '0' },
});

try {
  await driver.awaitSnapshot((s) => s.findText('README.md') !== null, 15_000);
  driver.sendKeys('Enter');
  await driver.awaitSnapshot((s) => s.findText('╭─Preview') !== null, 15_000);
  const statusRecord = JSON.parse(await Bun.file(statusPath).text()) as Record<
    string,
    unknown
  >;
  const userFile = await Bun.file(
    join(homeDirectory, '.config', 'invar', 'settings.json'),
  ).text();
  console.log(
    `USERFILE side value: ${(JSON.parse(userFile) as Record<string, unknown>).markdownPreviewSide}`,
  );
  console.log(
    `STATUS side=${String(statusRecord.markdownPreviewSide)} open=${String(statusRecord.markdownPreviewOpen)}`,
  );
  const wide = driver.snapshot();
  const wideRow = wide.findText('╭─Preview')!.row;
  console.log(`WIDE  row ${wideRow}: ${wide.rowText(wideRow)}`);
  driver.resize(60, 25);
  for (let second = 1; second <= 8; second++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const snapshot = driver.snapshot();
    const border = snapshot.findText('╭─Preview');
    console.log(
      `t+${second}s cols=${snapshot.columns} previewAt=${border ? `${border.column},${border.row}` : 'none'}: ${border ? snapshot.rowText(border.row) : ''}`,
    );
  }
} finally {
  await driver.dispose();
}
