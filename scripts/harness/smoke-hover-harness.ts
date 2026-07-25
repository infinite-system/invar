#!/usr/bin/env bun
// Byte-level real-LSP hover contract: a sub-dwell motion stays quiet, a completed dwell paints the
// bordered server type card, the card owns selection/copy, and Escape dismisses it.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: A hover card reflects the language server type at the pointed symbol (src/modules/ui/ui.invariants.md)
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { dragBetweenCells } from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

function declarationSymbolPosition(
  snapshot: HarnessSnapshot.Model,
): { row: number; column: number } | null {
  for (let row = 0; row < snapshot.rows; row++) {
    const rowText = snapshot.rowText(row);
    const declarationColumn = rowText.indexOf('export const answer');
    if (declarationColumn < 0) continue;
    const column = rowText.indexOf('answer', declarationColumn);
    if (column >= 0) return { row, column };
  }
  return null;
}

function hoverCardTextSpan(
  snapshot: HarnessSnapshot.Model,
): { row: number; startColumn: number; endColumn: number } | null {
  for (let row = 0; row < snapshot.rows; row++) {
    const rowText = snapshot.rowText(row);
    if (
      !rowText.includes('answer')
      || !rowText.includes('number')
      || rowText.includes('export')
      || rowText.includes('42')
      || !rowText.includes('│')
    ) {
      continue;
    }
    const startColumn = rowText.indexOf('answer');
    const endColumn = rowText.indexOf('number') + 'number'.length - 1;
    if (startColumn >= 0 && endColumn > startColumn) return { row, startColumn, endColumn };
  }
  return null;
}

const repositoryRoot = process.cwd();
const serverBinary = join(repositoryRoot, 'node_modules', '.bin', 'typescript-language-server');
if (
  !Bun.file(serverBinary).size
  || !Bun.file(join(repositoryRoot, 'node_modules', 'typescript', 'package.json')).size
) {
  console.log('SKIP  typescript-language-server/typescript not installed — hover smoke skipped');
  process.exit(0);
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-hover-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-hover-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
symlinkSync(join(repositoryRoot, 'node_modules'), join(fixtureRoot, 'node_modules'));
await Bun.write(
  join(fixtureRoot, 'tsconfig.json'),
  '{ "compilerOptions": { "target": "ES2022", "module": "ESNext", '
    + '"moduleResolution": "bundler", "strict": true }, "include": ["*.ts"] }\n',
);
await Bun.write(
  join(fixtureRoot, 'answer.ts'),
  'export const answer: number = 42;\nexport const doubled = answer * 2;\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  repositoryRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness hover: open answer.ts and locate the declaration ==');
  const readyStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.ready === true",
    (status) => status.ready === true,
    20_000,
  );
  driver.sendKeys('Down', 'Enter');
  let snapshot = await driver.awaitGridCondition(
    'the answer declaration is visible after opening answer.ts',
    (candidate) => candidate.findText('export const answer') !== null,
  );
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    "status condition: String(status.activeBuffer).endsWith('/answer.ts')",
    (status) => String(status.activeBuffer).endsWith('/answer.ts'),
  );
  const symbolPosition = declarationSymbolPosition(snapshot);
  HarnessSmoke.Class.requireCondition(symbolPosition !== null, 'answer declaration cell is visible');
  if (!symbolPosition) throw new Error('Answer declaration disappeared');

  console.log('== harness hover: sub-dwell motion paints no card ==');
  driver.sendMouse({
    kind: 'move',
    column: symbolPosition.column,
    row: symbolPosition.row,
    button: 'none',
  });
  await driver.awaitQuiescence();
  await driver.assertNoCompleteFrameEmittedFor(200);
  snapshot = await driver.awaitGridCondition(
    'no hover card is visible before the dwell threshold',
    (candidate) => hoverCardTextSpan(candidate) === null,
  );
  HarnessSmoke.Class.requireCondition(
    hoverCardTextSpan(snapshot) === null,
    'no hover card appears before the 0.5 second dwell threshold',
  );

  console.log('== harness hover: completed dwell paints server type ==');
  snapshot = await driver.awaitSnapshot(
    (candidate) => hoverCardTextSpan(candidate) !== null,
    30_000,
  );
  const cardSpan = hoverCardTextSpan(snapshot);
  HarnessSmoke.Class.requireCondition(
    cardSpan !== null,
    'bordered hover card paints the server answer/number type',
  );
  if (!cardSpan) throw new Error('Hover card disappeared');

  console.log('== harness hover: card selection and copy stay engaged ==');
  const copyCountBefore = Number(readyStatus.lastCopyChars ?? 0);
  await dragBetweenCells(
    driver,
    cardSpan.startColumn,
    cardSpan.row,
    cardSpan.endColumn,
    cardSpan.row,
  );
  driver.sendRawInputWithoutFrameExpectation('\x03');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    "status condition: Number(status.lastCopyChars) > copyCountBefore",
    (status) => Number(status.lastCopyChars) > copyCountBefore,
  );
  snapshot = await driver.awaitGridCondition(
    'the hover card remains visible after copying its selection',
    (candidate) => hoverCardTextSpan(candidate) !== null,
  );
  HarnessSmoke.Class.requireCondition(
    hoverCardTextSpan(snapshot) !== null,
    'card owns copy selection and stays open through Ctrl+C',
  );

  console.log('== harness hover: keypress dismisses the card ==');
  driver.sendKeys('Escape');
  await driver.awaitSnapshot((candidate) => hoverCardTextSpan(candidate) === null);
  HarnessSmoke.Class.pass('Escape dismisses the hover card');
  driver.sendKeys('Control+q');
  console.log('smoke-hover-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
