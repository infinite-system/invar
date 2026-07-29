#!/usr/bin/env bun
// Probe for #237: does uninstalling the Markdown plugin close an AUTO-OPENED preview?
//
// Run: bun .invar/tasks/in-progress/237-markdown-preview-left-and-auto-open/probe-237-uninstall-stale-pane.ts
//
// Boots the app on a one-file markdown workspace (the preview auto-opens), disables the Markdown
// plugin through the Extensions pane, then prints markdownPreviewOpen, whether the pane is still
// painted, and the tail of the app's file log. Read the output: 'still painted' plus an isolated
// handler throw in the log names the failure; a clean run shows the pane gone and open=false.
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'probe-237-un-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'probe-237-un-home-'));
const statusPath = join(homeDirectory, 'status.json');
await Bun.write(join(fixtureRoot, 'README.md'), '# Heading\n\nBody text.\n');

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath, LANG: 'C.UTF-8', NERD_FONT: '0' },
});

function status(): Record<string, unknown> {
  return JSON.parse(readFileSync(statusPath, 'utf8')) as Record<
    string,
    unknown
  >;
}

try {
  await driver.awaitSnapshot((s) => s.findText('README.md') !== null, 15_000);
  driver.sendKeys('Enter');
  await driver.awaitSnapshot((s) => s.findText('╭─Preview') !== null, 15_000);
  console.log(`before: open=${String(status().markdownPreviewOpen)}`);
  driver.sendKeys('Control+Shift+x');
  await driver.awaitSnapshot(
    (s) => s.findText('› [x] File Tree') !== null,
    15_000,
  );
  driver.sendKeys('Down', 'Down');
  await driver.awaitSnapshot((s) => s.findText('› [x] Markdown') !== null);
  driver.sendKeys('Space');
  await driver.awaitSnapshot((s) => s.findText('› [ ] Markdown') !== null);
  for (let second = 1; second <= 5; second++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const snapshot = driver.snapshot();
    console.log(
      `t+${second}s open=${String(status().markdownPreviewOpen)} panePainted=${snapshot.findText('╭─Preview') !== null}`,
    );
  }
} finally {
  await driver.dispose();
  const logRoot = join(homeDirectory, '.local', 'state');
  try {
    const walk = (directory: string): string[] =>
      readdirSync(directory).flatMap((entry) => {
        const fullPath = join(directory, entry);
        return statSync(fullPath).isDirectory() ? walk(fullPath) : [fullPath];
      });
    for (const logPath of walk(logRoot)) {
      const lines = readFileSync(logPath, 'utf8').trim().split('\n');
      console.log(`--- ${logPath} (last 12 lines)`);
      console.log(lines.slice(-12).join('\n'));
    }
  } catch (error) {
    console.log(`no log found under ${logRoot}: ${String(error)}`);
  }
}
