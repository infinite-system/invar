#!/usr/bin/env bun
// Provider-neutral completion drive: an in-process Rust-flavored provider and real tsgo both travel
// through the same editor input, popup, status projection, and exact-acceptance path.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Completion is provider-neutral (src/modules/lsp/lsp.invariants.md)
// invariant: Completion reuses bounded popup geometry (src/modules/ui/ui.invariants.md)
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const repositoryRoot = process.cwd();

async function openOnlyFile(
  driver: PtyTestDriver.Model,
  statusPath: string,
  suffix: string,
): Promise<void> {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.ready === true',
    (status) => status.ready === true,
    20_000,
  );
  driver.sendKeys('Down', 'Enter');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    `status condition: String(status.activeBuffer).endsWith('${suffix}')`,
    (status) => String(status.activeBuffer).endsWith(suffix),
  );
}

async function driveMockProvider(): Promise<void> {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-completion-rust-'));
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-completion-rust-home-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  await Bun.write(join(fixtureRoot, 'main.rs'), 'words.');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    repositoryRoot,
    columns: 100,
    rows: 28,
    homeDirectory,
    environment: { TUI_STATUS_PATH: statusPath },
    command: [
      process.execPath,
      `--preload=${join(
        repositoryRoot,
        'scripts/harness/completion-mock-provider-preload.ts',
      )}`,
      'src/main.ts',
      fixtureRoot,
    ],
  });
  try {
    console.log(
      '== harness completion: mock Rust provider, large list, exact acceptance ==',
    );
    await openOnlyFile(driver, statusPath, '/main.rs');
    driver.sendKeys('End', 'Control+Space');
    const openStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: status.completionOpen === true && Number(status.completionItemCount) > 1000',
      (status) =>
        status.completionOpen === true &&
        Number(status.completionItemCount) > 1_000,
      20_000,
    );
    HarnessSmoke.Class.requireCondition(
      Number(openStatus.completionItemCount) === 1_502,
      'mock provider exposes all 1,502 items through the completion contract',
    );
    HarnessSmoke.Class.requireCondition(
      Number(openStatus.completionGeometry?.visibleItemCount) <=
        Number(openStatus.completionGeometry?.listRows) &&
        Number(openStatus.completionGeometry?.listRows) <
          Number(openStatus.completionItemCount),
      'large completion rendering stays bounded to the popup viewport',
    );
    driver.sendText('push');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      "status condition: status.completionSelectedLabel === 'push_str' && status.completionItemCount === 1",
      (status) =>
        status.completionSelectedLabel === 'push_str' &&
        status.completionItemCount === 1,
    );
    driver.sendKeys('Tab');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      "status condition: status.completionOpen === false && status.editorLines?.[0] === 'words.push_str'",
      (status) =>
        status.completionOpen === false &&
        Array.isArray(status.editorLines) &&
        status.editorLines[0] === 'words.push_str',
    );
    HarnessSmoke.Class.pass(
      'mock Rust provider uses the shared popup and exact edit path',
    );
    driver.sendKeys('Control+Space');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: status.completionOpen === true',
      (status) => status.completionOpen === true,
    );
    driver.sendKeys('Left');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: status.completionOpen === false && status.cursor?.col === 13',
      (status) => {
        const cursor = status.cursor as { col?: number } | null;
        return status.completionOpen === false && cursor?.col === 13;
      },
    );
    HarnessSmoke.Class.pass(
      'cursor movement dismisses completion and still moves the caret',
    );
    driver.sendKeys('Control+Space');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: status.completionOpen === true',
      (status) => status.completionOpen === true,
    );
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: status.completionOpen === false',
      (status) => status.completionOpen === false,
    );
    HarnessSmoke.Class.pass(
      'Escape dismisses completion without leaving editor focus',
    );
    driver.sendKeys('Control+q');
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function driveTsgo(): Promise<void> {
  const tsgoBinary = join(repositoryRoot, 'node_modules', '.bin', 'tsgo');
  if (!Bun.file(tsgoBinary).size) {
    throw new Error('tsgo is required for the completion harness');
  }
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-completion-tsgo-'));
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-completion-tsgo-home-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  symlinkSync(
    join(repositoryRoot, 'node_modules'),
    join(fixtureRoot, 'node_modules'),
  );
  await Bun.write(
    join(fixtureRoot, 'tsconfig.json'),
    '{"compilerOptions":{"strict":true},"include":["*.ts"]}\n',
  );
  await Bun.write(
    join(fixtureRoot, 'main.ts'),
    'class Example {\n' +
      '  property = 1;\n' +
      '  power = 2;\n' +
      '  method() {\n' +
      '    this',
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    repositoryRoot,
    columns: 100,
    rows: 28,
    homeDirectory,
    environment: { TUI_STATUS_PATH: statusPath },
  });
  try {
    console.log(
      '== harness completion: real tsgo trigger, narrowing, and acceptance ==',
    );
    await openOnlyFile(driver, statusPath, '/main.ts');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      "status condition: status.lspStatus === 'ready' && status.lspProvider === 'typescript'",
      (status) =>
        status.lspStatus === 'ready' && status.lspProvider === 'typescript',
      30_000,
    );
    driver.sendKeys('Control+End');
    driver.sendText('.');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: status.completionOpen === true',
      (status) => status.completionOpen === true,
      30_000,
    );
    driver.sendText('p');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      "status condition: status.completionOpen === true && String(status.completionSelectedLabel).startsWith('p')",
      (status) =>
        status.completionOpen === true &&
        String(status.completionSelectedLabel).startsWith('p'),
      30_000,
    );
    driver.sendKeys('Tab');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      "status condition: status.completionOpen === false && status.editorLines?.[4] === '    this.property'",
      (status) =>
        status.completionOpen === false &&
        Array.isArray(status.editorLines) &&
        status.editorLines[4] === '    this.property',
      30_000,
    );
    HarnessSmoke.Class.pass('real tsgo completion fills the selected property');
    driver.sendKeys('Control+q');
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

await driveMockProvider();
await driveTsgo();
console.log('smoke-completion-harness: ALL-PASS');
