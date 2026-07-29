#!/usr/bin/env bun
// Provider-neutral completion drive: an in-process Rust-flavored provider and real tsgo both travel
// through the same editor input, popup, status projection, and exact-acceptance path.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Completion is provider-neutral (src/modules/lsp/lsp.invariants.md)
// invariant: Completion reuses bounded popup geometry (src/modules/ui/ui.invariants.md)
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompletionItemKinds } from '../../src/modules/lsp/CompletionItemKinds';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import { ScrollPhysics } from '../../src/modules/ui/ScrollPhysics';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

const repositoryRoot = process.cwd();

// The glyph tier is FORCED so the expected mark is derivable rather than guessed: a PTY without LANG
// would otherwise detect the ascii rung. The expectations below are still resolved through the theme
// and the kind classifier, never pasted — a vocabulary change must not re-break this drive.
const forcedGlyphMode = 'unicode';

// The kind NUMBERS are protocol facts about what a TypeScript server answers for a member access, not
// appearance. Everything visual comes from the two authorities the app itself uses.
const methodCompletionItemKind = 2;

const functionCompletionItemKind = 3;

const fieldCompletionItemKind = 5;

const variableCompletionItemKind = 6;

const classCompletionItemKind = 7;

const propertyCompletionItemKind = 10;

function expectedMarkForCompletionItemKind(completionItemKind: number): string {
  return ThemeIcons.Class.symbolMarkFor(
    forcedGlyphMode,
    CompletionItemKinds.Class.symbolClassFor(completionItemKind),
  );
}

interface CompletionPopupGeometry {
  listLeft: number;
  listTop: number;
  listColumns: number;
  listRows: number;
  listIconColumns: number;
  firstVisible: number;
}

async function writeForcedGlyphModeSettings(
  homeDirectory: string,
): Promise<void> {
  mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
  await Bun.write(
    join(homeDirectory, '.config', 'invar', 'settings.json'),
    JSON.stringify({ glyphMode: forcedGlyphMode }),
  );
}

function completionPopupGeometry(
  status: Record<string, unknown>,
): CompletionPopupGeometry {
  return status.completionGeometry as unknown as CompletionPopupGeometry;
}

// A row is located by its item TEXT, and the label must begin at the ONE label column the popup
// publishes for every row. That second half is the width proof on the real path: if the terminal had
// rendered the mark in a different number of cells than the app reserved for the icon column, the
// label would not start at this column.
function completionRowMarkForLabel(
  snapshot: HarnessSnapshot.Model,
  geometry: CompletionPopupGeometry,
  label: string,
): string | null {
  const labelColumn =
    geometry.listIconColumns > 0 ? 2 + geometry.listIconColumns : 1;
  for (let visibleRow = 0; visibleRow < geometry.listRows; visibleRow++) {
    const rowText = Array.from(snapshot.rowText(geometry.listTop + visibleRow))
      .slice(geometry.listLeft, geometry.listLeft + geometry.listColumns)
      .join('');
    if (rowText.slice(labelColumn).trimEnd() !== label) continue;
    return rowText.slice(1, 1 + geometry.listIconColumns).trim();
  }
  return null;
}

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
  await writeForcedGlyphModeSettings(homeDirectory);
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
    const largeListGeometry = completionPopupGeometry(openStatus);
    HarnessSmoke.Class.requireCondition(
      largeListGeometry.listIconColumns === 1,
      'a five-thousand-item completion list reserves exactly one cell for the mark column ' +
        `(published listIconColumns ${largeListGeometry.listIconColumns})`,
    );
    await driver.awaitGridCondition(
      'grid condition: the mock provider row for push_str carries the resolved callable mark',
      (snapshot) =>
        completionRowMarkForLabel(snapshot, largeListGeometry, 'push_str') ===
        expectedMarkForCompletionItemKind(methodCompletionItemKind),
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

function typeScriptFixtureLines(fixtureLineCount: number): string[] {
  const declarationLines = [
    "import ZqxDefaultWidget, { ZqnImportedValue } from './dependency';",
    'const ZqvLocalValue = 1;',
    'function ZqfLocalFunction(): number { return ZqvLocalValue; }',
    'class ZqcLocalClass {}',
    'class MemberExample {',
    '  memberValue = 1;',
    '  memberCall(): number { return this.memberValue; }',
    '}',
    'const memberExample = new MemberExample();',
    'void ZqxDefaultWidget;',
    'void ZqnImportedValue;',
  ];
  if (fixtureLineCount < declarationLines.length + 1) {
    throw new Error(
      `TypeScript completion fixture needs at least ` +
        `${declarationLines.length + 1} lines`,
    );
  }
  return [
    ...declarationLines,
    ...Array.from(
      { length: fixtureLineCount - declarationLines.length - 1 },
      () => '// scale',
    ),
    '',
  ];
}

async function clearTypedPrefix(
  driver: PtyTestDriver.Model,
  statusPath: string,
  prefix: string,
): Promise<void> {
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: completion closes before clearing the typed prefix',
    (status) => status.completionOpen === false,
  );
  const revisionBeforeClear = Number(
    HarnessSmoke.Class.readStatus(statusPath).bufferRevision,
  );
  driver.sendKeys(...Array.from(prefix, () => 'Backspace'));
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: clearing the typed prefix returns the caret to column zero',
    (status) =>
      Number(status.bufferRevision) > revisionBeforeClear &&
      status.cursor?.col === 0,
  );
}

async function driveBareIdentifierCandidate(
  driver: PtyTestDriver.Model,
  statusPath: string,
  prefix: string,
  label: string,
  completionItemKind: number,
): Promise<void> {
  const statusBeforePrefix = HarnessSmoke.Class.readStatus(statusPath);
  const requestCountBeforePrefix = Number(
    statusBeforePrefix.completionRequestCount ?? 0,
  );
  const popupFilterCountBeforePrefix = Number(
    statusBeforePrefix.completionFilterCount ?? 0,
  );
  const sourceFilterCountBeforePrefix = Number(
    statusBeforePrefix.completionSourceFilterCount ?? 0,
  );
  driver.sendText(prefix);
  const openStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    `status condition: bare prefix ${prefix} selects ${label}`,
    (status) =>
      status.completionOpen === true &&
      status.completionSelectedLabel === label,
    30_000,
  );
  const geometry = completionPopupGeometry(openStatus);
  await driver.awaitGridCondition(
    `grid condition: ${label} carries its resolved kind mark`,
    (snapshot) =>
      completionRowMarkForLabel(snapshot, geometry, label) ===
      expectedMarkForCompletionItemKind(completionItemKind),
    30_000,
  );
  HarnessSmoke.Class.requireCondition(
    Number(openStatus.completionRequestCount) === requestCountBeforePrefix + 1,
    `${prefix} issues one provider request for ${prefix.length} keystrokes`,
  );
  HarnessSmoke.Class.requireCondition(
    Number(openStatus.completionFilterCount) ===
      popupFilterCountBeforePrefix + 1 &&
      Number(openStatus.completionSourceFilterCount) ===
        sourceFilterCountBeforePrefix + 1,
    `${prefix} prepares popup matches exactly once`,
  );
  HarnessSmoke.Class.pass(
    `${label} is visible on the emulator grid with the correct kind mark`,
  );
  await clearTypedPrefix(driver, statusPath, prefix);
}

async function driveTsgoAtScale(fixtureLineCount: number): Promise<void> {
  const tsgoBinary = join(repositoryRoot, 'node_modules', '.bin', 'tsgo');
  if (!Bun.file(tsgoBinary).size) {
    throw new Error('tsgo is required for the completion harness');
  }
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-completion-tsgo-'));
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-completion-tsgo-home-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  await writeForcedGlyphModeSettings(homeDirectory);
  symlinkSync(
    join(repositoryRoot, 'node_modules'),
    join(fixtureRoot, 'node_modules'),
  );
  await Bun.write(
    join(fixtureRoot, 'tsconfig.json'),
    '{"compilerOptions":{"strict":true},"include":["*.ts"]}\n',
  );
  await Bun.write(
    join(fixtureRoot, 'dependency.ts'),
    [
      'export default class ZqxDefaultWidget {}',
      'export const ZqnImportedValue = 1;',
    ].join('\n'),
  );
  await Bun.write(
    join(fixtureRoot, 'main.ts'),
    typeScriptFixtureLines(fixtureLineCount).join('\n'),
  );
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
      `== harness completion: real tsgo at ${fixtureLineCount} lines ==`,
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.ready === true',
      (status) => status.ready === true,
      20_000,
    );
    driver.sendKeys('Down', 'Down', 'Enter');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      "status condition: activeBuffer ends with '/main.ts'",
      (status) => String(status.activeBuffer).endsWith('/main.ts'),
    );
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      "status condition: status.lspStatus === 'ready' && status.lspProvider === 'typescript'",
      (status) =>
        status.lspStatus === 'ready' && status.lspProvider === 'typescript',
      30_000,
    );
    driver.sendKeys('Control+End');
    await driveBareIdentifierCandidate(
      driver,
      statusPath,
      'Zqx',
      'ZqxDefaultWidget',
      variableCompletionItemKind,
    );
    await driveBareIdentifierCandidate(
      driver,
      statusPath,
      'Zqn',
      'ZqnImportedValue',
      variableCompletionItemKind,
    );
    await driveBareIdentifierCandidate(
      driver,
      statusPath,
      'Zqv',
      'ZqvLocalValue',
      variableCompletionItemKind,
    );
    await driveBareIdentifierCandidate(
      driver,
      statusPath,
      'Zqf',
      'ZqfLocalFunction',
      functionCompletionItemKind,
    );
    await driveBareIdentifierCandidate(
      driver,
      statusPath,
      'Zqc',
      'ZqcLocalClass',
      classCompletionItemKind,
    );

    const revisionBeforeMemberBase = Number(
      HarnessSmoke.Class.readStatus(statusPath).bufferRevision,
    );
    driver.sendPaste('memberExample');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: pasted member base reaches the expected caret column',
      (status) =>
        Number(status.bufferRevision) > revisionBeforeMemberBase &&
        status.cursor?.col === 'memberExample'.length,
    );
    const requestCountBeforeMemberAccess = Number(
      HarnessSmoke.Class.readStatus(statusPath).completionRequestCount,
    );
    driver.sendText('.');
    const memberAccessStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: status.completionOpen === true',
      (status) => status.completionOpen === true,
      30_000,
    );
    HarnessSmoke.Class.requireCondition(
      Number(memberAccessStatus.completionRequestCount) ===
        requestCountBeforeMemberAccess + 1,
      'member access retains one trigger-character provider request',
    );
    // A member access is the caret where kinds genuinely differ: `this.` answers with a method AND
    // with data members. Both marks are resolved through the kind classifier and the theme, and both
    // are then read out of the emulator grid — a mapping table alone would not prove the popup paints
    // them.
    const memberAccessGeometry = completionPopupGeometry(memberAccessStatus);
    const expectedCallableMark = expectedMarkForCompletionItemKind(
      methodCompletionItemKind,
    );
    const expectedValueMark = expectedMarkForCompletionItemKind(
      fieldCompletionItemKind,
    );
    HarnessSmoke.Class.requireCondition(
      expectedValueMark ===
        expectedMarkForCompletionItemKind(propertyCompletionItemKind),
      'a field and a property resolve to one value-family mark, so this claim holds whichever of ' +
        'the two kinds the server chooses for a class member',
    );
    HarnessSmoke.Class.requireCondition(
      expectedCallableMark !== expectedValueMark,
      'the callable family and the value family do not share a mark, so the grid comparison below ' +
        'can distinguish them',
    );
    const markedSnapshot = await driver.awaitGridCondition(
      'grid condition: the member-access rows carry the callable mark beside method and the value ' +
        'mark beside a data member',
      (snapshot) =>
        completionRowMarkForLabel(
          snapshot,
          memberAccessGeometry,
          'memberCall',
        ) === expectedCallableMark &&
        completionRowMarkForLabel(
          snapshot,
          memberAccessGeometry,
          'memberValue',
        ) === expectedValueMark,
      30_000,
    );
    for (
      let visibleRow = 0;
      visibleRow < memberAccessGeometry.listRows;
      visibleRow++
    ) {
      console.log(
        `  grid row ${memberAccessGeometry.listTop + visibleRow}: ` +
          JSON.stringify(
            Array.from(
              markedSnapshot.rowText(memberAccessGeometry.listTop + visibleRow),
            )
              .slice(
                memberAccessGeometry.listLeft,
                memberAccessGeometry.listLeft +
                  memberAccessGeometry.listColumns,
              )
              .join(''),
          ),
      );
    }
    HarnessSmoke.Class.pass(
      'a real TypeScript member access paints a different mark for a callable than for a value',
    );
    driver.sendKeys('Control+q');
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

await driveMockProvider();

await driveTsgoAtScale(20);

await driveTsgoAtScale(100_000);

console.log('smoke-completion-harness: ALL-PASS');
