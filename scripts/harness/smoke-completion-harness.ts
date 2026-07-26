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
import { ScrollPhysics } from '../../src/modules/ui/ScrollPhysics';
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

function completionItemIndex(label: string): number {
  if (label === 'push_str') return 0;
  if (label === 'pop') return 1;
  const propertyMatch = label.match(/^property(\d{4})$/);
  if (!propertyMatch) return -1;
  return Number(propertyMatch[1]) + 2;
}

async function driveMockProvider(): Promise<void> {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-completion-rust-'));
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-completion-rust-home-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  await Bun.write(
    join(fixtureRoot, 'main.rs'),
    [
      'words.',
      ...Array.from(
        { length: 599 },
        (_unusedValue, lineIndex) => `line_${lineIndex}`,
      ),
    ].join('\n'),
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    repositoryRoot,
    columns: 100,
    rows: 28,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      TUI_COMPLETION_ITEM_COUNT: '5000',
    },
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
      Number(openStatus.completionItemCount) === 5_000,
      'mock provider exposes all 5,000 items through the completion contract',
    );
    HarnessSmoke.Class.requireCondition(
      Number(openStatus.completionGeometry?.visibleItemCount) <=
        Number(openStatus.completionGeometry?.listRows) &&
        Number(openStatus.completionGeometry?.listRows) <
          Number(openStatus.completionItemCount),
      'large completion rendering stays bounded to the popup viewport',
    );
    const completionRequestCountBeforeMovement = Number(
      openStatus.completionRequestCount,
    );
    const completionFilterCountBeforeMovement = Number(
      openStatus.completionFilterCount,
    );
    const completionSourceFilterCountBeforeMovement = Number(
      openStatus.completionSourceFilterCount,
    );
    driver.sendKeys('Down');
    let movementStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      "status condition: status.completionSelectedLabel === 'pop'",
      (status) => status.completionSelectedLabel === 'pop',
    );
    HarnessSmoke.Class.requireCondition(
      completionItemIndex(String(movementStatus.completionSelectedLabel)) === 1,
      'one deliberate list press moves exactly one row',
    );
    let previousCompletionItemIndex = 1;
    let acceleratedMovementObserved = false;
    for (let repeatNumber = 0; repeatNumber < 14; repeatNumber++) {
      const previousSelectedLabel = String(
        movementStatus.completionSelectedLabel,
      );
      driver.sendKeys('Down');
      movementStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
        driver,
        statusPath,
        'status condition: held Down advances the completion selection',
        (status) =>
          String(status.completionSelectedLabel) !== previousSelectedLabel,
      );
      const nextCompletionItemIndex = completionItemIndex(
        String(movementStatus.completionSelectedLabel),
      );
      const movementRows =
        nextCompletionItemIndex - previousCompletionItemIndex;
      HarnessSmoke.Class.requireCondition(
        movementRows >= 1 &&
          movementRows <= ScrollPhysics.Class.KEY_ACCEL_CAP_ROWS,
        `held list movement stays within the ${ScrollPhysics.Class.KEY_ACCEL_CAP_ROWS}-row ceiling`,
      );
      acceleratedMovementObserved ||= movementRows > 1;
      previousCompletionItemIndex = nextCompletionItemIndex;
    }
    HarnessSmoke.Class.requireCondition(
      acceleratedMovementObserved,
      'held Down accelerates through the 5,000-item completion list',
    );
    const geometryBeforeWheel =
      movementStatus.completionGeometry as unknown as {
        listLeft: number;
        listTop: number;
        firstVisible: number;
      };
    driver.sendMouse({
      kind: 'wheel',
      column: geometryBeforeWheel.listLeft + 1,
      row: geometryBeforeWheel.listTop + 1,
      direction: 'down',
    });
    movementStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: completion wheel advances firstVisible',
      (status) =>
        Number(
          (
            status.completionGeometry as {
              firstVisible?: number;
            } | null
          )?.firstVisible,
        ) > geometryBeforeWheel.firstVisible,
    );
    HarnessSmoke.Class.requireCondition(
      Number(movementStatus.completionRequestCount) ===
        completionRequestCountBeforeMovement &&
        Number(movementStatus.completionFilterCount) ===
          completionFilterCountBeforeMovement &&
        Number(movementStatus.completionSourceFilterCount) ===
          completionSourceFilterCountBeforeMovement,
      'list movement and scrolling issue zero requests and zero refilters',
    );
    const completionRequestCountBeforeQuery = Number(
      movementStatus.completionRequestCount,
    );
    const completionFilterCountBeforeQuery = Number(
      movementStatus.completionFilterCount,
    );
    const completionSourceFilterCountBeforeQuery = Number(
      movementStatus.completionSourceFilterCount,
    );
    driver.sendText('push');
    const narrowedStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      "status condition: status.completionSelectedLabel === 'push_str' && status.completionItemCount === 1",
      (status) =>
        status.completionSelectedLabel === 'push_str' &&
        status.completionItemCount === 1,
    );
    HarnessSmoke.Class.requireCondition(
      Number(narrowedStatus.completionRequestCount) ===
        completionRequestCountBeforeQuery &&
        Number(narrowedStatus.completionFilterCount) ===
          completionFilterCountBeforeQuery + 4 &&
        Number(narrowedStatus.completionSourceFilterCount) ===
          completionSourceFilterCountBeforeQuery + 4,
      `each of four query changes filters exactly once without a new language request ` +
        `(requests ${completionRequestCountBeforeQuery}->${Number(
          narrowedStatus.completionRequestCount,
        )}, match preparations ${completionFilterCountBeforeQuery}->${Number(
          narrowedStatus.completionFilterCount,
        )}, source filters ${completionSourceFilterCountBeforeQuery}->${Number(
          narrowedStatus.completionSourceFilterCount,
        )})`,
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
    driver.sendKeys('Control+Home', 'Up', 'Down');
    let editorMovementStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: first editor Down reaches line 1',
      (status) => status.cursor?.line === 1,
    );
    let previousEditorLine = 1;
    let acceleratedEditorMovementObserved = false;
    for (let repeatNumber = 0; repeatNumber < 12; repeatNumber++) {
      driver.sendKeys('Down');
      editorMovementStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
        driver,
        statusPath,
        'status condition: held editor Down advances the caret',
        (status) => Number(status.cursor?.line) > previousEditorLine,
      );
      const editorMovementRows =
        Number(editorMovementStatus.cursor?.line) - previousEditorLine;
      HarnessSmoke.Class.requireCondition(
        editorMovementRows >= 1 &&
          editorMovementRows <= ScrollPhysics.Class.KEY_ACCEL_CAP_ROWS,
        `held editor movement stays within the ${ScrollPhysics.Class.KEY_ACCEL_CAP_ROWS}-row ceiling`,
      );
      acceleratedEditorMovementObserved ||= editorMovementRows > 1;
      previousEditorLine = Number(editorMovementStatus.cursor?.line);
    }
    HarnessSmoke.Class.requireCondition(
      acceleratedEditorMovementObserved,
      'held editor Down accelerates through the same run tracker',
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
