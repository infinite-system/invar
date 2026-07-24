#!/usr/bin/env bun
// Byte-level real-LSP definition contract: Ctrl+click and F12 both jump from the use site to the
// declaration, with active-buffer and cursor semantics read from the status channel.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: A definition gesture jumps to the declaration (src/modules/lsp/lsp.invariants.md)
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function useSitePosition(snapshot: HarnessSnapshot.Model): { row: number; column: number } | null {
  for (let row = 0; row < snapshot.rows; row++) {
    const rowText = snapshot.rowText(row);
    if (!rowText.includes('const message')) continue;
    const column = rowText.indexOf('greetWidget');
    if (column >= 0) return { row, column };
  }
  return null;
}

function cursorPosition(statusPath: string): string {
  const cursor = HarnessSmoke.Class.readStatus(statusPath).cursor as
    | { line?: number; col?: number }
    | undefined;
  return cursor ? `${cursor.line},${cursor.col}` : 'none';
}

function tabPosition(snapshot: HarnessSnapshot.Model, marker: string): { row: number; column: number } {
  for (let row = 0; row < Math.min(snapshot.rows, 5); row++) {
    const column = snapshot.rowText(row).indexOf(marker);
    if (column >= 0) return { row, column: column + 2 };
  }
  throw new Error(`Buffer tab is not visible: ${marker}`);
}

const repositoryRoot = process.cwd();
const serverBinary = join(repositoryRoot, 'node_modules', '.bin', 'typescript-language-server');
if (
  !Bun.file(serverBinary).size
  || !Bun.file(join(repositoryRoot, 'node_modules', 'typescript', 'package.json')).size
) {
  console.log(
    'SKIP  typescript-language-server/typescript not installed — goto-definition smoke skipped',
  );
  process.exit(0);
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-goto-definition-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-goto-definition-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
symlinkSync(join(repositoryRoot, 'node_modules'), join(fixtureRoot, 'node_modules'));
await Bun.write(
  join(fixtureRoot, 'tsconfig.json'),
  '{ "compilerOptions": { "target": "ES2022", "module": "ESNext", '
    + '"moduleResolution": "bundler", "strict": true }, "include": ["*.ts"] }\n',
);
await Bun.write(
  join(fixtureRoot, 'foo.ts'),
  'export function greetWidget(name: string): string {\n'
    + '  return `hello ${name}`;\n}\n',
);
await Bun.write(
  join(fixtureRoot, 'bar.ts'),
  "import { greetWidget } from './foo';\n\n"
    + "const message = greetWidget('world');\nexport { message };\n",
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
  console.log('== harness goto definition: open the use site ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.ready === true,
    20_000,
  );
  driver.sendKeys('Down', 'Enter');
  let snapshot = await driver.awaitGridCondition(
    'the greetWidget use site in bar.ts is visible',
    (candidate) => candidate.findText('const message') !== null,
  );
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    (status) => String(status.activeBuffer).endsWith('/bar.ts'),
  );
  HarnessSmoke.Class.pass('bar.ts opens through the file tree');

  console.log('== harness goto definition: Ctrl+click jumps ==');
  let usePosition = useSitePosition(snapshot);
  HarnessSmoke.Class.requireCondition(usePosition !== null, 'greetWidget use site is visible');
  if (!usePosition) throw new Error('Use site disappeared');
  driver.sendMouse({
    kind: 'press',
    column: usePosition.column,
    row: usePosition.row,
    button: 'left',
    control: true,
  });
  driver.sendMouse({
    kind: 'release',
    column: usePosition.column,
    row: usePosition.row,
    button: 'left',
    control: true,
  });
  snapshot = await driver.awaitGridCondition(
    'Ctrl+click shows the greetWidget declaration',
    (candidate) => candidate.findText('export function greetWidget') !== null,
    30_000,
  );
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    (status) => {
      const cursor = status.cursor as { line?: number; col?: number } | undefined;
      return String(status.activeBuffer).endsWith('/foo.ts')
        && cursor?.line === 0
        && cursor.col === 16;
    },
    30_000,
  );
  HarnessSmoke.Class.requireCondition(
    cursorPosition(statusPath) === '0,16',
    'Ctrl+click lands on the greetWidget declaration cursor',
  );
  HarnessSmoke.Class.pass('declaration line is visible after Ctrl+click');

  console.log('== harness goto definition: return, plain-click, and F12 ==');
  const barTabPosition = tabPosition(snapshot, 'bar.ts');
  driver.sendMouse({
    kind: 'press',
    column: barTabPosition.column,
    row: barTabPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: barTabPosition.column,
    row: barTabPosition.row,
    button: 'left',
  });
  snapshot = await driver.awaitGridCondition(
    'clicking the bar.ts tab restores the greetWidget use site on the grid',
    (candidate) => candidate.findText('const message') !== null,
  );
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    (status) => String(status.activeBuffer).endsWith('/bar.ts'),
  );
  usePosition = useSitePosition(snapshot);
  if (!usePosition) throw new Error('Use site did not return');
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: usePosition.column,
    row: usePosition.row,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: usePosition.column,
    row: usePosition.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    (status) => {
      const cursor = status.cursor as { line?: number } | undefined;
      return String(status.activeBuffer).endsWith('/bar.ts') && cursor?.line === 2;
    },
  );
  HarnessSmoke.Class.requireCondition(
    String(HarnessSmoke.Class.readStatus(statusPath).activeBuffer).endsWith('/bar.ts')
      && cursorPosition(statusPath).startsWith('2,'),
    'plain click places the cursor without jumping',
  );
  driver.sendKeys('F12');
  await driver.awaitGridCondition(
    'F12 shows the greetWidget declaration',
    (candidate) => candidate.findText('export function greetWidget') !== null,
    20_000,
  );
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    (status) => {
      const cursor = status.cursor as { line?: number; col?: number } | undefined;
      return String(status.activeBuffer).endsWith('/foo.ts')
        && cursor?.line === 0
        && cursor.col === 16;
    },
    20_000,
  );
  HarnessSmoke.Class.requireCondition(
    cursorPosition(statusPath) === '0,16',
    'F12 lands on the same declaration',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-goto-definition-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
