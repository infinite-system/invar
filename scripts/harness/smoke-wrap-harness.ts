#!/usr/bin/env bun
// Byte-level wrap canary: the real app runs on the PTY slave, and the production terminal emulator
// supplies both the wrapped text rows and native cursor coordinates.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyTestDriver } from './PtyTestDriver';
import type { HarnessSnapshot } from './HarnessSnapshot';

function pass(label: string): void {
  console.log(`  PASS  ${label}`);
}

function requireCondition(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`FAIL ${label}`);
  pass(label);
}

function linePositions(snapshot: HarnessSnapshot.Model): {
  longLineRow: number;
  shortLineRow: number;
} | null {
  const longLinePosition = snapshot.findText('alpha bravo charlie');
  const shortLinePosition = snapshot.findText('short tail line');
  if (!longLinePosition || !shortLinePosition) return null;
  return {
    longLineRow: longLinePosition.row,
    shortLineRow: shortLinePosition.row,
  };
}

function gutterRow(snapshot: HarnessSnapshot.Model, lineNumber: number): number {
  return snapshot.findText(`${String(lineNumber).padStart(2, ' ')} ▎`)?.row ?? -1;
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-wrap-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-wrap-harness-home-'));
const words = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike '
  + 'november oscar papa quebec romeo sierra tango uniform victor whiskey yankee zulu';
const longLine = `${words} ${words} ${words}`;
const fillerLines = Array.from(
  { length: 60 },
  (_unused, fillerIndex) => `filler body line ${String(fillerIndex).padStart(3, '0')}`,
);
await Bun.write(
  join(fixtureRoot, 'long.txt'),
  [longLine, 'short tail line', 'q'.repeat(200), 'final line', ...fillerLines].join('\n') + '\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
});

try {
  console.log('== harness wrap: boot and open the long line ==');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('long.txt') !== null, 15_000);
  pass('real app booted through OpenPty');
  driver.sendKeys('Enter');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('alpha bravo charlie') !== null);
  driver.sendKeys('Right');
  const wrapOffSnapshot = await driver.awaitSnapshot((snapshot) => {
    const positions = linePositions(snapshot);
    return positions !== null && positions.shortLineRow === positions.longLineRow + 1;
  });
  pass('wrap-off renders one logical line per screen row');

  console.log('== harness wrap: palette enables wrapping ==');
  driver.sendKeys('F1');
  await driver.awaitSnapshot((snapshot) => snapshot.text().toLowerCase().includes('command palette'));
  driver.sendText('word wrap');
  await driver.awaitSnapshot((snapshot) => snapshot.text().toLowerCase().includes('word wrap'));
  driver.sendKeys('Enter');
  const wrapOnSnapshot = await driver.awaitSnapshot((snapshot) => {
    const positions = linePositions(snapshot);
    return positions !== null && positions.shortLineRow > positions.longLineRow + 1;
  });
  const wrapOnPositions = linePositions(wrapOnSnapshot);
  requireCondition(
    wrapOnPositions !== null
      && wrapOnPositions.shortLineRow - wrapOnPositions.longLineRow >= 3,
    'long line occupies multiple terminal rows',
  );

  console.log('== harness wrap: native caret aligns on a continuation row ==');
  requireCondition(wrapOnPositions !== null, 'wrapped line positions are visible');
  const continuationRow = wrapOnPositions.longLineRow + 1;
  driver.sendMouse({ kind: 'press', column: 60, row: continuationRow, button: 'left' });
  driver.sendMouse({ kind: 'release', column: 60, row: continuationRow, button: 'left' });
  await driver.awaitQuiescence();
  driver.sendText('X');
  const caretSnapshot = await driver.awaitSnapshot((snapshot) => {
    const precedingCell = snapshot.cell(snapshot.cursorRow, snapshot.cursorColumn - 1);
    return precedingCell?.characters === 'X';
  });
  const insertedGlyphPosition = {
    row: caretSnapshot.cursorRow,
    column: caretSnapshot.cursorColumn - 1,
  };
  pass('typed glyph appears in the byte-level grid');
  requireCondition(
    caretSnapshot.cursorColumn === insertedGlyphPosition.column + 1
      && caretSnapshot.cursorRow === insertedGlyphPosition.row,
    `caret matches glyph on wrapped row (${caretSnapshot.cursorColumn},${caretSnapshot.cursorRow})`,
  );

  console.log('== harness wrap: Alt+Z restores unwrapped rows ==');
  driver.sendKeys('Alt+z');
  await driver.awaitSnapshot((snapshot) => {
    const firstLineRow = gutterRow(snapshot, 1);
    return firstLineRow >= 0 && gutterRow(snapshot, 2) === firstLineRow + 1;
  });
  pass('wrap-off round trip restored consecutive logical rows');
  driver.sendKeys('Control+q');
  console.log('smoke-wrap-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
