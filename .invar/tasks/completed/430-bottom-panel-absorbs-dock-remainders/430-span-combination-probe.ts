#!/usr/bin/env bun
// This probe reports the live bottom-panel geometry for all four dock-span combinations.
// Run: bun .invar/tasks/in-progress/430-bottom-panel-absorbs-dock-remainders/430-span-combination-probe.ts
// Each line shows left and width for the panel and both remainder slots. A zero remainder means
// the bottom panel absorbed every dock group that ends at the panel.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';
import type { StatusSnapshot } from '../../../../src/modules/system/StatusChannel';

type DockVerticalSpan = 'full-height' | 'ends-at-panel';

interface Rectangle {
  left: number;
  width: number;
}

function rectangle(status: StatusSnapshot, name: string): Rectangle {
  const rectangles = status.layoutSlots as Record<string, Rectangle>;
  const result = rectangles[name];
  if (!result) throw new Error(`Missing layout slot ${name}`);
  return result;
}

function formatRectangle(result: Rectangle): string {
  return `L${result.left} W${result.width}`;
}

async function probeCombination(
  fixtureRoot: string,
  leftDockVerticalSpan: DockVerticalSpan,
  rightDockVerticalSpan: DockVerticalSpan,
): Promise<void> {
  const homeDirectory = mkdtempSync(join(tmpdir(), 'probe-430-home-'));
  const settingsDirectory = join(homeDirectory, '.config', 'invar');
  const statusPath = join(homeDirectory, 'status.json');
  mkdirSync(settingsDirectory, { recursive: true });
  await Bun.write(
    join(settingsDirectory, 'settings.json'),
    `${JSON.stringify({
      glyphMode: 'ascii',
      leftDockVerticalSpan,
      rightDockVerticalSpan,
    })}\n`,
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      COLORTERM: 'truecolor',
    },
  });

  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the configured dock spans are ready',
      (candidate) =>
        candidate.ready === true &&
        candidate.leftDockVerticalSpan === leftDockVerticalSpan &&
        candidate.rightDockVerticalSpan === rightDockVerticalSpan,
      20_000,
    );
    driver.sendKeys('Control+j');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the bottom panel is visible',
      (candidate) => candidate.panelVisible === true,
    );
    driver.sendKeys('Control+Alt+b');
    const status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the right dock is visible',
      (candidate) => candidate.rightDockVisible === true,
    );
    console.log(
      `${leftDockVerticalSpan} | ${rightDockVerticalSpan} | ` +
        `panel ${formatRectangle(rectangle(status, 'bottomPanel'))} | ` +
        `primary remainder ${formatRectangle(rectangle(status, 'primaryDockRemainder'))} | ` +
        `right remainder ${formatRectangle(rectangle(status, 'rightDockRemainder'))}`,
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'probe-430-fixture-'));
await Bun.write(join(fixtureRoot, 'file.txt'), 'hello\nworld\n');

try {
  for (const leftDockVerticalSpan of [
    'full-height',
    'ends-at-panel',
  ] as const) {
    for (const rightDockVerticalSpan of [
      'full-height',
      'ends-at-panel',
    ] as const) {
      await probeCombination(
        fixtureRoot,
        leftDockVerticalSpan,
        rightDockVerticalSpan,
      );
    }
  }
} finally {
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
}
