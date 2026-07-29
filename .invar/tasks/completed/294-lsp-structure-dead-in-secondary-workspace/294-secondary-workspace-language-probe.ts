#!/usr/bin/env bun
// This probe opens two independent TypeScript projects in one real Invar PTY session.
// Run it from the repository root with:
// bun .invar/tasks/in-progress/294-lsp-structure-dead-in-secondary-workspace/294-secondary-workspace-language-probe.ts
// It prints the active root, structure rows, diagnostics, hover frame, and language-server cwd.
// A healthy arm names its own root, has structure rows and diagnostics, paints the imported type,
// and runs its language server with cwd equal to that root.

import { mkdirSync, mkdtempSync, readlinkSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { HarnessSnapshot } from '../../../../scripts/harness/HarnessSnapshot';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const repositoryRoot = process.cwd();
const fixtureParent = mkdtempSync(
  join(tmpdir(), 'invar-294-secondary-workspace-'),
);
const firstRoot = join(fixtureParent, 'first-typescript-project');
const secondRoot = join(fixtureParent, 'second-typescript-project');
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-294-home-'));
const statusPath = join(homeDirectory, 'status.json');
const serverName = process.env.INVAR_294_TYPESCRIPT_SERVER ?? 'tsgo';

function hoverCardContainsType(snapshot: HarnessSnapshot.Model): boolean {
  return snapshot
    .textRows()
    .some(
      (rowText) =>
        rowText.includes('const secondaryValue') &&
        rowText.includes('SecondaryShape') &&
        rowText.includes('│') &&
        !rowText.includes('export'),
    );
}

async function writeProject(
  root: string,
  prefix: 'Primary' | 'Secondary',
): Promise<void> {
  mkdirSync(root, { recursive: true });
  symlinkSync(join(repositoryRoot, 'node_modules'), join(root, 'node_modules'));
  await Bun.write(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
      },
      include: ['*.ts'],
    }),
  );
  await Bun.write(
    join(root, 'types.ts'),
    [`export interface ${prefix}Shape {`, '  label: string;', '}', ''].join(
      '\n',
    ),
  );
  await Bun.write(
    join(root, 'main.ts'),
    [
      `import type { ${prefix}Shape } from './types';`,
      `export const ${prefix.toLowerCase()}Value: ${prefix}Shape = { label: 'ok' };`,
      `const ${prefix.toLowerCase()}Diagnostic: string = 1;`,
      `${prefix.toLowerCase()}Value;`,
      '',
    ].join('\n'),
  );
}

async function languageServerProcesses(
  status: Record<string, unknown>,
): Promise<Array<{ pid: number; command: string; cwd: string }>> {
  const subprocessPids = Array.isArray(status.subprocessPids)
    ? status.subprocessPids
    : [];
  const processes: Array<{ pid: number; command: string; cwd: string }> = [];
  for (const value of subprocessPids) {
    const pid = Number(value);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    try {
      const command = (await Bun.file(`/proc/${pid}/cmdline`).text())
        .replaceAll('\0', ' ')
        .trim();
      processes.push({
        pid,
        command,
        cwd: readlinkSync(`/proc/${pid}/cwd`),
      });
    } catch {
      // A short-lived non-language process can exit between status publication and inspection.
    }
  }
  return processes;
}

async function openFile(
  driver: PtyTestDriver.Model,
  path: string,
): Promise<void> {
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText(path);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `Go to File finds ${path}`,
    (status) =>
      status.quickOpenQuery === path && Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${path} opens`,
    (status) =>
      status.quickOpenOpen === false &&
      String(status.activeBuffer).endsWith(path),
  );
}

async function addSecondWorkspace(driver: PtyTestDriver.Model): Promise<void> {
  const snapshot = driver.snapshot();
  const plusColumn = Array.from(snapshot.rowText(0)).lastIndexOf('+');
  HarnessSmoke.Class.requireCondition(
    plusColumn >= 0,
    'the workspace add button is visible',
  );
  driver.sendMouse({
    kind: 'press',
    column: plusColumn,
    row: 0,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: plusColumn,
    row: 0,
    button: 'left',
  });
  await driver.awaitGridCondition(
    'the project picker opens at the first root parent',
    (candidate) => candidate.findText(`+ ${dirname(firstRoot)}`) !== null,
  );
  driver.sendText(basename(secondRoot));
  await driver.awaitGridCondition(
    'the second root appears in the project picker',
    (candidate) => candidate.findText(secondRoot) !== null,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the second workspace becomes active',
    (status) =>
      status.workspaceCount === 2 && status.activeWorkspaceRoot === secondRoot,
  );
}

async function observeArm(
  driver: PtyTestDriver.Model,
  root: string,
  prefix: 'Primary' | 'Secondary',
): Promise<void> {
  await openFile(driver, 'main.ts');
  const readyStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${prefix} language features settle`,
    (status) =>
      status.activeWorkspaceRoot === root &&
      status.structureStatus === 'ready' &&
      Number(status.structureRows) > 0 &&
      Number(status.diagnosticsCount) > 0 &&
      typeof status.lspProvider === 'string',
    30_000,
  );
  const snapshot = await driver.awaitGridCondition(
    `${prefix} structure and diagnostic paint`,
    (candidate) =>
      candidate.findText(`${prefix.toLowerCase()}Value`) !== null &&
      candidate.findText('Structure') !== null,
  );
  const valuePosition = snapshot.findText(`${prefix.toLowerCase()}Value;`);
  HarnessSmoke.Class.requireCondition(
    valuePosition !== null,
    `${prefix} hover target is visible`,
  );
  if (!valuePosition) throw new Error(`${prefix} hover target disappeared`);
  driver.sendMouse({
    kind: 'move',
    column: valuePosition.column + 2,
    row: valuePosition.row,
    button: 'none',
  });
  await driver.awaitScreenChange();
  const hoverSnapshot = await driver.awaitSnapshot(
    (candidate) =>
      prefix === 'Secondary'
        ? hoverCardContainsType(candidate)
        : candidate
            .textRows()
            .some(
              (rowText) =>
                rowText.includes('const primaryValue') &&
                rowText.includes('PrimaryShape') &&
                rowText.includes('│') &&
                !rowText.includes('export'),
            ),
    30_000,
  );
  const processes = (await languageServerProcesses(readyStatus)).filter(
    (process) =>
      process.command.includes('tsgo') ||
      process.command.includes('typescript-language-server'),
  );
  await Bun.sleep(20);
  console.log(`\n== ${prefix} workspace observation ==`);
  console.log(
    JSON.stringify(
      {
        activeWorkspaceRoot: readyStatus.activeWorkspaceRoot,
        activeBuffer: readyStatus.activeBuffer,
        lspProvider: readyStatus.lspProvider,
        diagnosticsCount: readyStatus.diagnosticsCount,
        structureStatus: readyStatus.structureStatus,
        structureRows: readyStatus.structureRows,
        structureRequests: readyStatus.structureRequests,
        languageServerProcesses: processes,
      },
      null,
      2,
    ),
  );
  console.log(hoverSnapshot.textRows().join('\n'));
  driver.sendKeys('Escape');
  await driver.awaitScreenChange();
}

await writeProject(firstRoot, 'Primary');
await writeProject(secondRoot, 'Secondary');
mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
await Bun.write(
  join(homeDirectory, '.config', 'invar', 'settings.json'),
  JSON.stringify({ typescriptServer: serverName }),
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: firstRoot,
  repositoryRoot,
  columns: 150,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the app is ready',
    (status) => status.ready === true,
    20_000,
  );
  await observeArm(driver, firstRoot, 'Primary');
  await addSecondWorkspace(driver);
  await observeArm(driver, secondRoot, 'Secondary');
  console.log('294-secondary-workspace-language-probe: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureParent);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
