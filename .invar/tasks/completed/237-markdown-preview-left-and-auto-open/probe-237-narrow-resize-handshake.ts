#!/usr/bin/env bun
// Probe for #237: reproduce the narrow-resize relayout with the HARNESS handshake active.
//
// Run: bun .invar/tasks/in-progress/237-markdown-preview-left-and-auto-open/probe-237-narrow-resize-handshake.ts
//
// Boots the app on a markdown workspace (preview auto-opens), resizes to 60x25, and then polls
// through awaitGridCondition — the same synchronized-frame path the smoke uses — printing whether
// the source pane's opening corner ever returns inside 60 columns. Pair with the DEBUG237 line in
// MarkdownSplitView.synchronizePaneGeometry (writes /tmp/probe237-sync.log): the log shows what
// root width every relayout pass saw. A run that ends 'never settled' plus a log pinned at the
// wide-layout width names the defect; a settling run shows the shrunken width arriving.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'probe-237-hs-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'probe-237-hs-home-'));
const statusPath = join(homeDirectory, 'status.json');
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
  driver.resize(60, 25);
  try {
    const settled = await driver.awaitGridCondition(
      'both pane corners return inside 60 columns',
      (candidate) => {
        if (candidate.columns !== 60) return false;
        const preview = candidate.findText('╭─Preview');
        if (!preview) return false;
        // Side-agnostic: settled when the preview pane's own closing corner is on screen.
        return candidate.rowText(preview.row).indexOf('╮', preview.column) >= 0;
      },
      10_000,
    );
    const row = settled.findText('╭─Preview')!.row;
    console.log(`SETTLED: ${settled.rowText(row)}`);
  } catch {
    const snapshot = driver.snapshot();
    const preview = snapshot.findText('╭─Preview');
    console.log(
      `NEVER SETTLED: ${preview ? snapshot.rowText(preview.row) : 'preview off-screen'}`,
    );
  }
} finally {
  await driver.dispose();
}
