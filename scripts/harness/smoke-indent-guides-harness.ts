#!/usr/bin/env bun
// Byte-level indent-guide port: guide count, foreground, and caret alignment come from emulator cells.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { pass, requireCondition } from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

interface IndentGuideProof {
  guideCount: number;
  guideForeground: number;
  textForeground: number;
  textColumn: number;
  textRow: number;
}

function indentGuideProof(snapshot: HarnessSnapshot.Model): IndentGuideProof | null {
  const deepPosition = snapshot.findText('deep(');
  if (!deepPosition || deepPosition.column < 12) return null;
  const indentCells = snapshot
    .rowCells(deepPosition.row)
    .slice(deepPosition.column - 12, deepPosition.column);
  const guideCells = indentCells.filter((cell) => cell.characters !== ' ');
  const firstGuide = guideCells[0];
  const textCell = snapshot.cell(deepPosition.row, deepPosition.column);
  if (!firstGuide || !textCell) return null;
  return {
    guideCount: guideCells.length,
    guideForeground: firstGuide.foreground,
    textForeground: textCell.foreground,
    textColumn: deepPosition.column,
    textRow: deepPosition.row,
  };
}

async function openNested(driver: PtyTestDriver.Model): Promise<HarnessSnapshot.Model> {
  await driver.awaitSnapshot((snapshot) => snapshot.findText('nested.ts') !== null, 15_000);
  driver.sendKeys('Enter');
  return driver.awaitSnapshot((snapshot) => snapshot.findText('deep(') !== null);
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-indent-guides-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-indent-guides-harness-home-'));
await Bun.write(
  join(fixtureRoot, 'nested.ts'),
  'function outer() {\n    const a = 1;\n    if (a) {\n        const b = 2;\n'
    + '        while (b) {\n            deep();\n        }\n    }\n}\n',
);

const guidesOnDriver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
});
let guidesOffDriver: PtyTestDriver.Model | null = null;

try {
  console.log('== harness indent guides: default setting paints three dim guides ==');
  let snapshot = await openNested(guidesOnDriver);
  const guidesOnProof = indentGuideProof(snapshot);
  requireCondition(guidesOnProof?.guideCount === 3, 'three guides paint on the indent-12 line');
  requireCondition(
    guidesOnProof.guideForeground !== guidesOnProof.textForeground,
    'guide foreground differs from code text foreground',
  );

  console.log('== harness indent guides: caret remains aligned with deep() ==');
  guidesOnDriver.sendMouse({
    kind: 'press',
    column: guidesOnProof.textColumn,
    row: guidesOnProof.textRow,
    button: 'left',
  });
  guidesOnDriver.sendMouse({
    kind: 'release',
    column: guidesOnProof.textColumn,
    row: guidesOnProof.textRow,
    button: 'left',
  });
  snapshot = await guidesOnDriver.awaitSnapshot(
    (candidate) => candidate.cursorColumn === guidesOnProof.textColumn
      && candidate.cursorRow === guidesOnProof.textRow,
  );
  pass(`native caret lands on deep() at terminal cell ${snapshot.cursorColumn},${snapshot.cursorRow}`);

  console.log('== harness indent guides: disabled setting paints only spaces ==');
  mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
  await Bun.write(
    join(homeDirectory, '.config', 'invar', 'settings.json'),
    '{"showIndentGuides":false}\n',
  );
  guidesOffDriver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
  });
  snapshot = await openNested(guidesOffDriver);
  const deepPosition = snapshot.findText('deep(');
  requireCondition(deepPosition !== null, 'deep() remains visible with guides disabled');
  requireCondition(
    snapshot.rowCells(deepPosition.row)
      .slice(deepPosition.column - 12, deepPosition.column)
      .every((cell) => cell.characters === ' '),
    'no guide glyphs paint when showIndentGuides is false',
  );

  guidesOnDriver.sendKeys('Control+q');
  guidesOffDriver.sendKeys('Control+q');
  console.log('smoke-indent-guides-harness: ALL-PASS');
} finally {
  await guidesOnDriver.dispose();
  await guidesOffDriver?.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
