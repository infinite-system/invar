#!/usr/bin/env bun
// This probe opens /home/parallels/dev/realized as Invar's second workspace without changing it.
// Run it from this task worktree with:
// bun .invar/tasks/in-progress/294-lsp-structure-dead-in-secondary-workspace/294-realized-workspace-language-probe.ts
// It prints the secondary workspace status, the real language-server cwd, and the hover frame.
// Structure rows plus a typed hover mean the reported Realized-project failure is not present.

import { mkdtempSync, readlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const repositoryRoot = process.cwd();
const firstRoot = '/home/parallels/dev/tui-editor';
const secondRoot = '/home/parallels/dev/realized';
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-294-realized-home-'));
const statusPath = join(homeDirectory, 'status.json');

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
      if (
        !command.includes('tsgo') &&
        !command.includes('typescript-language-server')
      ) {
        continue;
      }
      processes.push({
        pid,
        command,
        cwd: readlinkSync(`/proc/${pid}/cwd`),
      });
    } catch {
      // A server that exits during inspection has already failed the later feature waits.
    }
  }
  return processes;
}

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
    'the default workspace is ready',
    (status) =>
      status.ready === true && status.activeWorkspaceRoot === firstRoot,
    20_000,
  );
  const plusColumn = Array.from(driver.snapshot().rowText(0)).lastIndexOf('+');
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
    'the project picker opens at /home/parallels/dev',
    (snapshot) => snapshot.findText(`+ ${dirname(firstRoot)}`) !== null,
  );
  driver.sendText(basename(secondRoot));
  await driver.awaitGridCondition(
    'the Realized root appears in the project picker',
    (snapshot) => snapshot.findText(secondRoot) !== null,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Realized becomes the second active workspace',
    (status) =>
      status.workspaceCount === 2 && status.activeWorkspaceRoot === secondRoot,
    20_000,
  );
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens in Realized',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('shared/test.ts');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds shared/test.ts',
    (status) =>
      status.quickOpenQuery === 'shared/test.ts' &&
      Number(status.quickOpenMatches) > 0,
    20_000,
  );
  driver.sendKeys('Enter');
  const readyStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Realized structure and LSP settle',
    (status) =>
      String(status.activeBuffer).endsWith('/realized/shared/test.ts') &&
      status.structureStatus === 'ready' &&
      Number(status.structureRows) > 0 &&
      typeof status.lspProvider === 'string',
    30_000,
  );
  let snapshot = await driver.awaitGridCondition(
    'the Realized schema declaration and structure rows paint',
    (candidate) =>
      candidate.findText('userRegistrationSchema') !== null &&
      candidate.findText('Structure') !== null,
  );
  const target = snapshot.findText('userRegistrationSchema');
  HarnessSmoke.Class.requireCondition(
    target !== null,
    'the Realized hover target is visible',
  );
  if (!target) throw new Error('The Realized hover target disappeared');
  driver.sendMouse({
    kind: 'move',
    column: target.column + 3,
    row: target.row,
    button: 'none',
  });
  await driver.awaitScreenChange();
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate
        .textRows()
        .some(
          (rowText) =>
            rowText.includes('const userRegistrationSchema:') &&
            !rowText.includes('export'),
        ),
    30_000,
  );
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
        languageServerProcesses: await languageServerProcesses(readyStatus),
      },
      null,
      2,
    ),
  );
  console.log(snapshot.textRows().join('\n'));
  console.log('294-realized-workspace-language-probe: ALL-PASS');
} catch (reason) {
  console.log('\n== Realized failure observation ==');
  console.log(
    JSON.stringify(HarnessSmoke.Class.readStatus(statusPath), null, 2),
  );
  console.log(driver.snapshot().textRows().join('\n'));
  throw reason;
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
