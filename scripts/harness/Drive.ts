#!/usr/bin/env bun
// An assertion-free front door to the real PTY harness for exploratory drives.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Synchronized end markers bound complete frames (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Async-published state is always awaited (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Static } from 'ivue/extras';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessMouseEvent } from './HarnessInput';
import { PtyTestDriver } from './PtyTestDriver';

class $Drive {
  protected static get DEFAULT_COLUMNS(): number {
    return 120;
  }

  protected static get DEFAULT_ROWS(): number {
    return 40;
  }

  protected static get DEFAULT_TIMEOUT_MILLISECONDS(): number {
    return 15_000;
  }

  static async main(argumentsList: readonly string[]): Promise<void> {
    const repositoryRoot = process.cwd();
    const options = this.parseOptions(argumentsList);
    if (options.showHelp) {
      console.log(this.helpText);
      return;
    }

    const target = await this.prepareTarget(repositoryRoot, options);
    const homeDirectory = this.createHomeDirectory(repositoryRoot);
    const statusPath = join(homeDirectory, 'status.json');
    const driver = new PtyTestDriver.Class({
      workspaceRoot: target.workspaceRoot,
      repositoryRoot,
      columns: options.columns,
      rows: options.rows,
      homeDirectory,
      environment: { TUI_STATUS_PATH: statusPath },
    });

    try {
      await driver.awaitGridCondition(
        'the application to publish ready and render-quiescent state',
        () => {
          try {
            const status = HarnessSmoke.Class.readStatus(statusPath);
            return (
              status.ready === true &&
              status.renderQuiescent === true &&
              Boolean(status.activeWorkspace)
            );
          } catch {
            return false;
          }
        },
        options.timeoutMilliseconds,
      );
      await driver.awaitQuiescence(options.timeoutMilliseconds);

      if (target.filePath) {
        await this.openFile(
          driver,
          statusPath,
          target.filePath,
          options.timeoutMilliseconds,
        );
      }
      if (target.sourceFilePath) {
        console.log(
          `\nsource file (opened as a disposable snapshot): ` +
            target.sourceFilePath,
        );
      }
      this.printObservation(driver.snapshot(), statusPath, 'settled boot');

      for (const [actionIndex, action] of options.actions.entries()) {
        this.sendAction(driver, action, options.columns, options.rows);
        await driver.awaitQuiescence(options.timeoutMilliseconds);
        this.printObservation(
          driver.snapshot(),
          statusPath,
          `after ${actionIndex + 1}: ${this.actionDescription(action)}`,
        );
      }
    } finally {
      await driver.dispose();
      await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
      if (target.temporaryWorkspaceRoot) {
        await HarnessSmoke.Class.removeTemporaryDirectory(
          target.temporaryWorkspaceRoot,
        );
      }
    }
  }

  protected static parseOptions(
    argumentsList: readonly string[],
  ): DriveOptions {
    let openPath: string | null = null;
    let fixtureSize: number | null = null;
    let columns = this.DEFAULT_COLUMNS;
    let rows = this.DEFAULT_ROWS;
    let timeoutMilliseconds = this.DEFAULT_TIMEOUT_MILLISECONDS;
    let showHelp = false;
    const actions: DriveAction[] = [];

    for (
      let argumentIndex = 0;
      argumentIndex < argumentsList.length;
      argumentIndex++
    ) {
      const argument = argumentsList[argumentIndex];
      if (argument === '--help' || argument === '-h') {
        showHelp = true;
        continue;
      }
      const value = argumentsList[argumentIndex + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      argumentIndex++;

      if (argument === '--open') {
        openPath = value;
      } else if (argument === '--geometry') {
        ({ columns, rows } = this.parseGeometry(value));
      } else if (argument === '--size') {
        fixtureSize = this.parsePositiveInteger(value, '--size');
      } else if (argument === '--key') {
        actions.push({ kind: 'key', keyName: value });
      } else if (argument === '--wheel') {
        actions.push({
          kind: 'wheel',
          direction: this.parseWheelDirection(value),
        });
      } else if (argument === '--click') {
        const [column, row] = this.parseCoordinates(value);
        actions.push({ kind: 'click', column, row });
      } else if (argument === '--timeout') {
        timeoutMilliseconds = this.parsePositiveInteger(value, '--timeout');
      } else {
        throw new Error(`Unknown argument: ${argument}\n\n${this.helpText}`);
      }
    }
    if (openPath && fixtureSize !== null) {
      throw new Error('--open and --size are mutually exclusive');
    }
    return {
      openPath,
      fixtureSize,
      columns,
      rows,
      timeoutMilliseconds,
      actions,
      showHelp,
    };
  }

  protected static parseGeometry(geometry: string): {
    columns: number;
    rows: number;
  } {
    const match = geometry.match(/^(\d+)x(\d+)$/);
    if (!match) {
      throw new Error(
        `Invalid --geometry ${JSON.stringify(geometry)}; expected COLUMNSxROWS`,
      );
    }
    return {
      columns: this.parsePositiveInteger(match[1] ?? '', '--geometry columns'),
      rows: this.parsePositiveInteger(match[2] ?? '', '--geometry rows'),
    };
  }

  protected static parseCoordinates(coordinates: string): [number, number] {
    const match = coordinates.match(/^(\d+),(\d+)$/);
    if (!match) {
      throw new Error(
        `Invalid --click ${JSON.stringify(coordinates)}; expected COLUMN,ROW`,
      );
    }
    return [
      this.parseNonnegativeInteger(match[1] ?? '', '--click column'),
      this.parseNonnegativeInteger(match[2] ?? '', '--click row'),
    ];
  }

  protected static parsePositiveInteger(
    value: string,
    optionName: string,
  ): number {
    const parsedValue = Number(value);
    if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
      throw new Error(`${optionName} must be a positive integer`);
    }
    return parsedValue;
  }

  protected static parseNonnegativeInteger(
    value: string,
    optionName: string,
  ): number {
    const parsedValue = Number(value);
    if (!Number.isSafeInteger(parsedValue) || parsedValue < 0) {
      throw new Error(`${optionName} must be a nonnegative integer`);
    }
    return parsedValue;
  }

  protected static parseWheelDirection(direction: string): DriveWheelDirection {
    if (
      direction === 'up' ||
      direction === 'down' ||
      direction === 'left' ||
      direction === 'right'
    ) {
      return direction;
    }
    throw new Error(`Invalid --wheel direction: ${direction}`);
  }

  protected static async prepareTarget(
    repositoryRoot: string,
    options: DriveOptions,
  ): Promise<DriveTarget> {
    if (options.fixtureSize !== null) {
      const workspaceRoot = join(
        repositoryRoot,
        'tmp',
        'drive',
        `fixture-${options.fixtureSize}`,
      );
      mkdirSync(workspaceRoot, { recursive: true });
      const filePath = join(workspaceRoot, `scale-${options.fixtureSize}.txt`);
      const fixtureLines = Array.from(
        { length: options.fixtureSize },
        (_unused, lineIndex) =>
          `DRIVE-LINE-${String(lineIndex + 1).padStart(6, '0')} ` +
          `content at scale ${options.fixtureSize}`,
      );
      await Bun.write(filePath, fixtureLines.join('\n'));
      return { workspaceRoot, filePath };
    }

    if (options.openPath) {
      const requestedPath = resolve(options.openPath);
      if (!existsSync(requestedPath)) {
        throw new Error(
          `Cannot wait for the requested path because it does not exist: ` +
            requestedPath,
        );
      }
      const canonicalPath = realpathSync(requestedPath);
      if (statSync(canonicalPath).isDirectory()) {
        return { workspaceRoot: canonicalPath, filePath: null };
      }
      if (statSync(canonicalPath).isFile()) {
        const workspaceRoot = join(
          repositoryRoot,
          'tmp',
          'drive',
          `file-${crypto.randomUUID()}`,
        );
        mkdirSync(workspaceRoot, { recursive: true });
        const filePath = join(workspaceRoot, basename(canonicalPath));
        copyFileSync(canonicalPath, filePath);
        return {
          workspaceRoot,
          filePath,
          sourceFilePath: canonicalPath,
          temporaryWorkspaceRoot: workspaceRoot,
        };
      }
      throw new Error(`--open requires a file or directory: ${canonicalPath}`);
    }

    const workspaceRoot = join(repositoryRoot, 'tmp', 'drive', 'default');
    mkdirSync(workspaceRoot, { recursive: true });
    await Bun.write(
      join(workspaceRoot, 'sample.ts'),
      [
        'export function greeting(name: string): string {',
        '  return `hello, ${name}`;',
        '}',
        '',
        "console.log(greeting('Invar'));",
        '',
      ].join('\n'),
    );
    return { workspaceRoot, filePath: null };
  }

  protected static createHomeDirectory(repositoryRoot: string): string {
    const homeDirectory = join(
      repositoryRoot,
      'tmp',
      'drive',
      `home-${crypto.randomUUID()}`,
    );
    mkdirSync(homeDirectory, { recursive: true });
    return homeDirectory;
  }

  protected static async openFile(
    driver: PtyTestDriver.Model,
    statusPath: string,
    filePath: string,
    timeoutMilliseconds: number,
  ): Promise<void> {
    driver.sendKeys('Control+p');
    await driver.awaitGridCondition(
      'Quick Open to become visible for the requested file',
      () => {
        try {
          return (
            HarnessSmoke.Class.readStatus(statusPath).quickOpenOpen === true
          );
        } catch {
          return false;
        }
      },
      timeoutMilliseconds,
    );
    driver.sendText(basename(filePath));
    await driver.awaitGridCondition(
      `Quick Open to rank the requested file: ${filePath}`,
      (snapshot) => {
        try {
          const status = HarnessSmoke.Class.readStatus(statusPath);
          return (
            status.quickOpenQuery === basename(filePath) &&
            Number(status.quickOpenMatches) >= 1 &&
            snapshot.findText(basename(filePath)) !== null
          );
        } catch {
          return false;
        }
      },
      timeoutMilliseconds,
    );
    driver.sendKeys('Enter');
    await driver.awaitGridCondition(
      `the requested file to open: ${filePath}`,
      () => {
        try {
          return (
            HarnessSmoke.Class.readStatus(statusPath).activeBuffer === filePath
          );
        } catch {
          return false;
        }
      },
      timeoutMilliseconds,
    );
    if (HarnessSmoke.Class.readStatus(statusPath).focus !== 'editor') {
      driver.sendKeys('Tab');
      await driver.awaitGridCondition(
        'the opened file editor to receive focus',
        () => {
          try {
            return HarnessSmoke.Class.readStatus(statusPath).focus === 'editor';
          } catch {
            return false;
          }
        },
        timeoutMilliseconds,
      );
    }
    await driver.awaitQuiescence(timeoutMilliseconds);
  }

  protected static sendAction(
    driver: PtyTestDriver.Model,
    action: DriveAction,
    columns: number,
    rows: number,
  ): void {
    if (action.kind === 'key') {
      driver.sendKeys(action.keyName);
      return;
    }
    if (action.kind === 'wheel') {
      driver.sendMouse({
        kind: 'wheel',
        direction: action.direction,
        column: Math.floor(columns / 2),
        row: Math.floor(rows / 2),
      });
      return;
    }
    driver.sendMouseWithoutFrameExpectation({
      kind: 'press',
      column: action.column,
      row: action.row,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'release',
      column: action.column,
      row: action.row,
      button: 'left',
    });
  }

  protected static actionDescription(action: DriveAction): string {
    if (action.kind === 'key') return `key ${action.keyName}`;
    if (action.kind === 'wheel') return `wheel ${action.direction}`;
    return `click ${action.column},${action.row}`;
  }

  protected static printObservation(
    snapshot: HarnessSnapshot.Model,
    statusPath: string,
    label: string,
  ): void {
    const rowNumberWidth = String(snapshot.rows - 1).length;
    console.log(
      `\n=== ${label}: ${snapshot.columns}x${snapshot.rows}, ` +
        `cursor ${snapshot.cursorColumn},${snapshot.cursorRow} ===`,
    );
    for (let row = 0; row < snapshot.rows; row++) {
      const rowNumber = String(row).padStart(rowNumberWidth, '0');
      console.log(`${rowNumber} │${snapshot.rowText(row)}│`);
    }

    const status = HarnessSmoke.Class.readStatus(statusPath);
    const statusEntries = Object.entries(status).sort(([leftKey], [rightKey]) =>
      leftKey.localeCompare(rightKey),
    );
    console.log(
      `\n--- published status/probe keys (${statusEntries.length}) ---`,
    );
    for (const [key, value] of statusEntries) {
      console.log(`${key}=${JSON.stringify(value)}`);
    }
  }

  protected static get helpText(): string {
    return [
      'Usage: bun run drive [options]',
      '',
      '  --open PATH          open a workspace or file',
      '  --geometry COLUMNSxROWS',
      '  --size LINE_COUNT    generate and open a scale fixture under tmp/',
      '  --key NAME           send one named key; repeat to preserve order',
      '  --wheel DIRECTION    send one wheel notch at the grid center',
      '  --click COLUMN,ROW   click a zero-based grid cell',
      '  --timeout MILLISECONDS',
      '  --help',
    ].join('\n');
  }
}

export namespace Drive {
  export const $Class = Static($Drive);
  export let Class = $Class;
}

interface DriveOptions {
  readonly openPath: string | null;
  readonly fixtureSize: number | null;
  readonly columns: number;
  readonly rows: number;
  readonly timeoutMilliseconds: number;
  readonly actions: readonly DriveAction[];
  readonly showHelp: boolean;
}

type DriveAction =
  | { readonly kind: 'key'; readonly keyName: string }
  | {
      readonly kind: 'wheel';
      readonly direction: DriveWheelDirection;
    }
  | {
      readonly kind: 'click';
      readonly column: number;
      readonly row: number;
    };

interface DriveTarget {
  readonly workspaceRoot: string;
  readonly filePath: string | null;
  readonly sourceFilePath?: string;
  readonly temporaryWorkspaceRoot?: string;
}

type DriveWheelDirection = Extract<
  HarnessMouseEvent,
  { readonly kind: 'wheel' }
>['direction'];

try {
  await Drive.Class.main(process.argv.slice(2));
} catch (error) {
  console.error(`drive: ${String((error as Error).message ?? error)}`);
  process.exitCode = 1;
}
