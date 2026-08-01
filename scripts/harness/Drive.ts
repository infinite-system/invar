#!/usr/bin/env bun
// An assertion-free front door to the real PTY harness for exploratory drives.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Synchronized end markers bound complete frames (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Async-published state is always awaited (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
// invariant: Drive clicks resolve from roles and text (scripts/harness/harness.invariants.md)
// invariant: Drive settled observations include declared debounced work (scripts/harness/harness.invariants.md)
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { Static } from 'ivue/extras';
import { KeybindingDefaults } from '../../src/modules/keybindings/KeybindingDefaults';
import type { ChordPattern } from '../../src/modules/keybindings/KeybindingRegistry';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { HarnessInput, type HarnessMouseEvent } from './HarnessInput';
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

  protected static get $settledStatusRules(): readonly DriveSettledStatusRule[] {
    return Object.freeze([
      {
        pendingName: 'markdownParsing=true',
        isPending: (status) =>
          'markdownParsing' in status && status.markdownParsing !== false,
      },
      {
        pendingName: 'markdownRevision differs from bufferRevision',
        isPending: (status) =>
          status.markdownActive === true &&
          (!Number.isFinite(Number(status.markdownRevision)) ||
            Number(status.markdownRevision) !== Number(status.bufferRevision)),
      },
      {
        pendingName: 'structureStatus has not refreshed the active file',
        isPending: (status) =>
          Boolean(status.activeBuffer) &&
          'structureStatus' in status &&
          (status.structureStatus === 'no-document' ||
            status.structureStatus === 'loading') &&
          (status.structureStatus === 'loading' ||
            this.structureProjectionIsVisible(status)),
      },
      {
        pendingName: 'structure pane has not painted the active file',
        isPending: (status, snapshot) =>
          Boolean(status.activeBuffer) &&
          this.structureProjectionIsVisible(status) &&
          status.structureStatus !== 'no-document' &&
          snapshot !== undefined &&
          snapshot.findText('No file is open.') !== null,
      },
    ]);
  }

  protected static structureProjectionIsVisible(
    status: Readonly<Record<string, unknown>>,
  ): boolean {
    return (
      (status.primaryDockVisible === true &&
        status.sidebarView === 'structure') ||
      (status.rightDockVisible === true &&
        status.rightDockActiveContent === 'structure')
    );
  }

  static async main(argumentsList: readonly string[]): Promise<void> {
    const repositoryRoot = resolve(import.meta.dir, '../..');
    const options = this.parseOptions(argumentsList);
    if (options.showHelp) {
      console.log(this.helpText);
      return;
    }

    const target = await this.prepareTarget(options);
    const homeDirectory =
      options.homeDirectoryOverride ?? this.createHomeDirectory();
    if (options.homeDirectoryOverride) {
      mkdirSync(homeDirectory, { recursive: true });
      // A reused home keeps settings and session state, but a stale
      // status.json would satisfy the new boot's waits with the OLD
      // run's published state (seen live on #435, 2026-08-01).
      rmSync(join(homeDirectory, 'status.json'), { force: true });
    }
    const statusPath = join(homeDirectory, 'status.json');
    const driver = new PtyTestDriver.Class({
      workspaceRoot: target.workspaceRoot,
      repositoryRoot,
      columns: options.columns,
      rows: options.rows,
      homeDirectory,
      environment: {
        TUI_STATUS_PATH: statusPath,
        // invariant: Harness teardown bypasses product quit confirmation only when declared (scripts/harness/harness.invariants.md)
        INVAR_HARNESS_DIRECT_QUIT: '0',
        ...options.environmentOverrides,
      },
    });

    try {
      await this.awaitSettledObservation(
        driver,
        statusPath,
        options.timeoutMilliseconds,
      );
      await driver.awaitScreenChange(options.timeoutMilliseconds);

      if (target.filePath) {
        await this.openFile(
          driver,
          statusPath,
          target.filePath,
          options.timeoutMilliseconds,
        );
        await this.awaitSettledObservation(
          driver,
          statusPath,
          options.timeoutMilliseconds,
        );
      }
      if (target.sourceFilePath) {
        console.log(
          `\nsource file (opened as a disposable snapshot): ` +
            target.sourceFilePath,
        );
      }
      this.printObservation(
        driver.snapshot(),
        statusPath,
        'settled boot',
        options.cellDumps,
      );

      for (const [actionIndex, action] of options.actions.entries()) {
        await this.performAction(
          driver,
          statusPath,
          action,
          options.columns,
          options.rows,
          options.timeoutMilliseconds,
        );
        this.printObservation(
          driver.snapshot(),
          statusPath,
          `after ${actionIndex + 1}: ${this.actionDescription(action)}`,
          options.cellDumps,
        );
      }
    } finally {
      await driver.dispose();
      if (!options.homeDirectoryOverride) {
        await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
      }
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
    const cellDumps: CellDumpRequest[] = [];
    let homeDirectoryOverride: string | null = null;
    const environmentOverrides: Record<string, string> = {};

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
      if (argument === '--frame-silent') {
        this.replaceLastActionCompletion(actions, {
          kind: 'frame-silent',
          reason:
            'the command line explicitly declared the action frame-silent',
        });
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
        actions.push({
          kind: 'key',
          keyName: value,
          completion: this.defaultKeyCompletion(value),
        });
      } else if (argument === '--type') {
        actions.push({
          kind: 'type',
          text: value,
          completion: { kind: 'screen-change' },
        });
      } else if (argument === '--wheel') {
        actions.push({
          kind: 'wheel',
          direction: this.parseWheelDirection(value),
          completion: { kind: 'screen-change' },
        });
      } else if (argument === '--click') {
        actions.push({
          kind: 'click',
          target: this.parseClickTarget(value),
          completion: { kind: 'screen-change' },
        });
      } else if (argument === '--hover') {
        actions.push({
          kind: 'hover',
          target: this.parseClickTarget(value),
          completion: { kind: 'screen-change' },
        });
      } else if (argument === '--wait-for-text') {
        this.replaceLastActionCompletion(actions, {
          kind: 'grid-text',
          text: value,
        });
      } else if (argument === '--wait-for-status') {
        this.replaceLastActionCompletion(
          actions,
          this.parseStatusCompletion(value),
        );
      } else if (argument === '--cells') {
        cellDumps.push(this.parseCellDump(value));
      } else if (argument === '--gesture') {
        actions.push(...this.gestureActions(value));
      } else if (argument === '--timeout') {
        timeoutMilliseconds = this.parsePositiveInteger(value, '--timeout');
      } else if (argument === '--home') {
        homeDirectoryOverride = value;
      } else if (argument === '--env') {
        const separatorIndex = value.indexOf('=');
        if (separatorIndex <= 0) {
          throw new Error(
            `Invalid --env ${JSON.stringify(value)}; expected KEY=VALUE`,
          );
        }
        environmentOverrides[value.slice(0, separatorIndex)] = value.slice(
          separatorIndex + 1,
        );
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
      cellDumps,
      homeDirectoryOverride,
      environmentOverrides,
      showHelp,
    };
  }

  /** `--cells ROW,C1-C2` — a per-cell char+color dump printed with every observation. */
  protected static parseCellDump(value: string): CellDumpRequest {
    const match = /^(\d+),(\d+)-(\d+)$/.exec(value);
    if (!match) {
      throw new Error(
        `Invalid --cells ${JSON.stringify(value)}; expected ROW,COLUMN_FROM-COLUMN_TO (zero-based)`,
      );
    }
    const row = Number.parseInt(match[1]!, 10);
    const from = Number.parseInt(match[2]!, 10);
    const to = Number.parseInt(match[3]!, 10);
    if (to < from)
      throw new Error(`Invalid --cells ${value}: COLUMN_TO < COLUMN_FROM`);
    return { row, from, to };
  }

  /** Named user gestures with their condition waits built in — the fluent verbs. */
  protected static gestureActions(name: string): DriveAction[] {
    const gestures: Record<string, DriveAction[]> = {
      openPanel: [
        {
          kind: 'key',
          keyName: 'Control+j',
          completion: {
            kind: 'status',
            fieldName: 'panelVisible',
            expectedValue: true,
          },
        },
      ],
      closePanel: [
        {
          kind: 'key',
          keyName: 'Control+j',
          completion: {
            kind: 'status',
            fieldName: 'panelVisible',
            expectedValue: false,
          },
        },
      ],
    };
    const actionsForGesture = gestures[name];
    if (!actionsForGesture) {
      throw new Error(
        `Unknown --gesture ${JSON.stringify(name)}; known: ${Object.keys(gestures).join(', ')}`,
      );
    }
    return actionsForGesture;
  }

  protected static defaultKeyCompletion(
    keyName: string,
  ): DriveActionCompletion {
    const encodedKey = HarnessInput.Class.key(keyName);
    const canonicalBindings = KeybindingDefaults.Class.canonicalBindings;
    const isCanonicalChordPrefix = canonicalBindings.some((binding) => {
      const firstStep = binding.steps?.[0];
      if (!firstStep || (binding.steps?.length ?? 0) < 2) return false;
      return this.chordPatternMatchesEncodedKey(firstStep, encodedKey);
    });
    const isAlsoCanonicalSingle = canonicalBindings.some((binding) => {
      return (
        binding.chord !== undefined &&
        this.chordPatternMatchesEncodedKey(binding.chord, encodedKey)
      );
    });
    return isCanonicalChordPrefix && !isAlsoCanonicalSingle
      ? {
          kind: 'frame-silent',
          reason: 'the key is a canonical multi-step chord prefix',
        }
      : { kind: 'screen-change' };
  }

  protected static chordPatternMatchesEncodedKey(
    chordPattern: ChordPattern,
    encodedKey: string,
  ): boolean {
    const chordPatternKeyName = this.chordPatternKeyName(chordPattern);
    if (chordPatternKeyName === null) return false;
    try {
      return HarnessInput.Class.key(chordPatternKeyName) === encodedKey;
    } catch {
      return false;
    }
  }

  protected static chordPatternKeyName(
    chordPattern: ChordPattern,
  ): string | null {
    if (chordPattern.super) return null;
    const modifierNames: string[] = [];
    if (chordPattern.ctrl) modifierNames.push('Control');
    if (chordPattern.alt) modifierNames.push('Alt');
    if (chordPattern.shift) modifierNames.push('Shift');
    const baseKeyName =
      chordPattern.key.length === 1
        ? chordPattern.key
        : chordPattern.key === 'return'
          ? 'Enter'
          : chordPattern.key
              .split(/(?=[A-Z])/)
              .map(
                (part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`,
              )
              .join('');
    return [...modifierNames, baseKeyName].join('+');
  }

  protected static replaceLastActionCompletion(
    actions: DriveAction[],
    completion: DriveActionCompletion,
  ): void {
    const action = actions.at(-1);
    if (!action) {
      throw new Error(
        'A completion option must follow --key, --wheel, or --click',
      );
    }
    actions[actions.length - 1] = { ...action, completion } as DriveAction;
  }

  protected static parseStatusCompletion(
    value: string,
  ): Extract<DriveActionCompletion, { readonly kind: 'status' }> {
    const separatorIndex = value.indexOf('=');
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      throw new Error(
        `Invalid --wait-for-status ${JSON.stringify(value)}; ` +
          'expected FIELD=JSON_VALUE',
      );
    }
    const fieldName = value.slice(0, separatorIndex);
    const expectedValueText = value.slice(separatorIndex + 1);
    let expectedValue: unknown;
    try {
      expectedValue = JSON.parse(expectedValueText);
    } catch {
      throw new Error(
        `Invalid JSON value in --wait-for-status ${JSON.stringify(value)}`,
      );
    }
    return { kind: 'status', fieldName, expectedValue };
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

  protected static parseClickTarget(target: string): DriveClickTarget {
    const coordinateMatch = target.match(/^(\d+),(\d+)$/);
    if (coordinateMatch) {
      return {
        kind: 'coordinates',
        column: this.parseNonnegativeInteger(
          coordinateMatch[1] ?? '',
          '--click column',
        ),
        row: this.parseNonnegativeInteger(
          coordinateMatch[2] ?? '',
          '--click row',
        ),
      };
    }
    const separatorIndex = target.indexOf('=');
    const role = target.slice(0, separatorIndex);
    const text = target.slice(separatorIndex + 1);
    if (
      separatorIndex <= 0 ||
      !text ||
      (role !== 'text' && role !== 'fold-control')
    ) {
      throw new Error(
        `Invalid --click ${JSON.stringify(target)}; expected COLUMN,ROW, ` +
          'text=VISIBLE_TEXT, or fold-control=HEADER_TEXT',
      );
    }
    return { kind: role, text };
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
    options: DriveOptions,
  ): Promise<DriveTarget> {
    if (options.fixtureSize !== null) {
      const workspaceRoot = mkdtempSync(
        join(tmpdir(), `invar-drive-fixture-${options.fixtureSize}-`),
      );
      const filePath = join(workspaceRoot, `scale-${options.fixtureSize}.txt`);
      const fixtureLines = Array.from(
        { length: options.fixtureSize },
        (_unused, lineIndex) =>
          `DRIVE-LINE-${String(lineIndex + 1).padStart(6, '0')} ` +
          `content at scale ${options.fixtureSize}`,
      );
      await Bun.write(filePath, fixtureLines.join('\n'));
      return {
        workspaceRoot,
        filePath,
        temporaryWorkspaceRoot: workspaceRoot,
      };
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
        const workspaceRoot = mkdtempSync(join(tmpdir(), 'invar-drive-file-'));
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

    const workspaceRoot = mkdtempSync(join(tmpdir(), 'invar-drive-default-'));
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
    return {
      workspaceRoot,
      filePath: null,
      temporaryWorkspaceRoot: workspaceRoot,
    };
  }

  protected static createHomeDirectory(): string {
    return mkdtempSync(join(tmpdir(), 'invar-drive-home-'));
  }

  protected static async awaitSettledObservation(
    driver: PtyTestDriver.Model,
    statusPath: string,
    timeoutMilliseconds: number,
  ): Promise<void> {
    await driver.awaitGridCondition(
      'the application and the drive quiescence registry to settle',
      (snapshot) => {
        try {
          const status = HarnessSmoke.Class.readStatus(statusPath);
          return (
            status.ready === true &&
            status.renderQuiescent === true &&
            Boolean(status.activeWorkspace) &&
            this.pendingSettledStatusNames(status, snapshot).length === 0
          );
        } catch {
          return false;
        }
      },
      timeoutMilliseconds,
    );
  }

  protected static pendingSettledStatusNames(
    status: Readonly<Record<string, unknown>>,
    snapshot?: HarnessSnapshot.Model,
  ): readonly string[] {
    return this.$settledStatusRules
      .filter((rule) => rule.isPending(status, snapshot))
      .map((rule) => rule.pendingName);
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
    await driver.awaitScreenChange(timeoutMilliseconds);
  }

  protected static async performAction(
    driver: PtyTestDriver.Model,
    statusPath: string,
    action: DriveAction,
    columns: number,
    rows: number,
    timeoutMilliseconds: number,
  ): Promise<void> {
    const resolvedAction =
      action.kind === 'click' || action.kind === 'hover'
        ? {
            ...action,
            resolvedPosition: this.resolveClickTarget(
              driver.snapshot(),
              action.target,
            ),
          }
        : action;
    if (
      (resolvedAction.kind === 'click' || resolvedAction.kind === 'hover') &&
      resolvedAction.target.kind !== 'coordinates'
    ) {
      console.error(
        `drive resolved ${resolvedAction.target.kind} ` +
          `${JSON.stringify(resolvedAction.target.text)} to ` +
          `${resolvedAction.resolvedPosition.column},` +
          `${resolvedAction.resolvedPosition.row}`,
      );
    }
    const editorClampTarget = this.editorClampTarget(
      resolvedAction,
      HarnessSmoke.Class.readStatus(statusPath),
    );
    if (editorClampTarget !== null && resolvedAction.kind === 'wheel') {
      this.sendActionWithoutFrameExpectation(
        driver,
        resolvedAction,
        columns,
        rows,
      );
      await HarnessSmoke.Class.awaitScrollPosition(
        driver,
        statusPath,
        `${this.actionDescription(resolvedAction)} leaves the editor at its ` +
          `${editorClampTarget.targetPosition} clamp`,
        editorClampTarget.fieldName,
        editorClampTarget.targetPosition,
        timeoutMilliseconds,
      );
      return;
    }

    const completion = resolvedAction.completion;
    if (completion.kind === 'frame-silent') {
      const frameCountBeforeAction = driver.completedFrameObservationCount;
      this.sendActionWithoutFrameExpectation(
        driver,
        resolvedAction,
        columns,
        rows,
      );
      const observedFrameCount =
        driver.completedFrameObservationCount - frameCountBeforeAction;
      if (observedFrameCount > 0) {
        console.error(
          `drive note: ${this.actionDescription(resolvedAction)} was ` +
            `declared frame-silent because ${completion.reason}, but ` +
            `${observedFrameCount} completed frame(s) arrived synchronously`,
        );
      }
      return;
    }
    if (completion.kind === 'grid-text') {
      if (driver.snapshot().findText(completion.text) !== null) {
        throw new Error(
          `Cannot wait for visible text already present before ` +
            `${this.actionDescription(resolvedAction)}: ${completion.text}`,
        );
      }
      this.sendAction(driver, resolvedAction, columns, rows);
      await driver.awaitGridCondition(
        `${this.actionDescription(resolvedAction)} paints text ` +
          JSON.stringify(completion.text),
        (snapshot) => snapshot.findText(completion.text) !== null,
        timeoutMilliseconds,
      );
      return;
    }
    if (completion.kind === 'status') {
      const currentStatus = HarnessSmoke.Class.readStatus(statusPath);
      if (
        this.statusValuesEqual(
          currentStatus[completion.fieldName],
          completion.expectedValue,
        )
      ) {
        throw new Error(
          `Cannot wait for status already satisfied before ` +
            `${this.actionDescription(resolvedAction)}: ` +
            `${completion.fieldName}=${JSON.stringify(completion.expectedValue)}`,
        );
      }
      this.sendAction(driver, resolvedAction, columns, rows);
      await HarnessSmoke.Class.awaitStatusWithoutFrame(
        driver,
        statusPath,
        `${this.actionDescription(resolvedAction)} publishes ` +
          `${completion.fieldName}=${JSON.stringify(completion.expectedValue)}`,
        (status) =>
          this.statusValuesEqual(
            status[completion.fieldName],
            completion.expectedValue,
          ),
        timeoutMilliseconds,
      );
      await driver.awaitScreenChange(timeoutMilliseconds);
      return;
    }
    this.sendAction(driver, resolvedAction, columns, rows);
    await driver.awaitScreenChange(timeoutMilliseconds);
  }

  protected static statusValuesEqual(
    actualValue: unknown,
    expectedValue: unknown,
  ): boolean {
    return JSON.stringify(actualValue) === JSON.stringify(expectedValue);
  }

  protected static resolveClickTarget(
    snapshot: HarnessSnapshot.Model,
    target: DriveClickTarget,
  ): DriveClickPosition {
    if (target.kind === 'coordinates') {
      if (target.column >= snapshot.columns || target.row >= snapshot.rows) {
        throw new Error(
          `Click coordinates ${target.column},${target.row} are outside ` +
            `${snapshot.columns}x${snapshot.rows}`,
        );
      }
      return { column: target.column, row: target.row };
    }
    const textPosition = snapshot.findText(target.text);
    if (!textPosition) {
      throw new Error(
        `Click target text is not visible: ${target.text}\n${snapshot.text()}`,
      );
    }
    if (target.kind === 'text') return textPosition;
    const foldControlGlyphs = new Set(
      (['nerd', 'unicode', 'ascii'] as const).flatMap((glyphLevel) => [
        ThemeIcons.Class.glyphFor(glyphLevel, 'foldOpen'),
        ThemeIcons.Class.glyphFor(glyphLevel, 'foldClosed'),
      ]),
    );
    for (let column = textPosition.column - 1; column >= 0; column--) {
      const cell = snapshot.cell(textPosition.row, column);
      if (cell && foldControlGlyphs.has(cell.characters)) {
        return { row: textPosition.row, column };
      }
    }
    throw new Error(
      `No fold-control role precedes visible text: ${target.text}\n` +
        snapshot.rowText(textPosition.row),
    );
  }

  protected static editorClampTarget(
    action: DriveResolvedAction,
    status: ReturnType<typeof HarnessSmoke.Class.readStatus>,
  ): DriveScrollTarget | null {
    if (
      action.kind !== 'wheel' ||
      status.focus !== 'editor' ||
      status.editorSurfaceIdentifier !== ''
    ) {
      return null;
    }
    const horizontal =
      action.direction === 'left' || action.direction === 'right';
    const fieldName = horizontal ? 'editorScrollLeft' : 'editorScrollTop';
    const currentPosition = Number(status[fieldName]);
    const maximumFieldName = horizontal
      ? 'editorMaximumScrollLeft'
      : 'editorMaximumScrollTop';
    const targetPosition =
      action.direction === 'left' || action.direction === 'up'
        ? 0
        : Number(status[maximumFieldName]);
    return Number.isFinite(currentPosition) &&
      Number.isFinite(targetPosition) &&
      currentPosition === targetPosition
      ? { fieldName, targetPosition }
      : null;
  }

  protected static sendAction(
    driver: PtyTestDriver.Model,
    action: DriveResolvedAction,
    columns: number,
    rows: number,
  ): void {
    if (action.kind === 'key') {
      driver.sendKeys(action.keyName);
      return;
    }
    if (action.kind === 'type') {
      driver.sendText(action.text);
      return;
    }
    if (action.kind === 'hover') {
      driver.sendMouse({
        kind: 'move',
        column: action.resolvedPosition.column,
        row: action.resolvedPosition.row,
        button: 'none',
      });
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
    const resolvedPosition = action.resolvedPosition;
    driver.sendMouseWithoutFrameExpectation({
      kind: 'press',
      column: resolvedPosition.column,
      row: resolvedPosition.row,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'release',
      column: resolvedPosition.column,
      row: resolvedPosition.row,
      button: 'left',
    });
  }

  protected static sendActionWithoutFrameExpectation(
    driver: PtyTestDriver.Model,
    action: DriveResolvedAction,
    columns: number,
    rows: number,
  ): void {
    if (action.kind === 'key') {
      driver.sendKeysWithoutFrameExpectation(action.keyName);
      return;
    }
    if (action.kind === 'type') {
      driver.sendText(action.text);
      return;
    }
    if (action.kind === 'hover') {
      driver.sendMouseWithoutFrameExpectation({
        kind: 'move',
        column: action.resolvedPosition.column,
        row: action.resolvedPosition.row,
        button: 'none',
      });
      return;
    }
    if (action.kind === 'wheel') {
      driver.sendMouseWithoutFrameExpectation({
        kind: 'wheel',
        direction: action.direction,
        column: Math.floor(columns / 2),
        row: Math.floor(rows / 2),
      });
      return;
    }
    driver.sendMouseWithoutFrameExpectation({
      kind: 'press',
      column: action.resolvedPosition.column,
      row: action.resolvedPosition.row,
      button: 'left',
    });
    driver.sendMouseWithoutFrameExpectation({
      kind: 'release',
      column: action.resolvedPosition.column,
      row: action.resolvedPosition.row,
      button: 'left',
    });
  }

  protected static actionDescription(action: DriveAction): string {
    if (action.kind === 'key') return `key ${action.keyName}`;
    if (action.kind === 'type') return `type ${JSON.stringify(action.text)}`;
    if (action.kind === 'hover') {
      return action.target.kind === 'coordinates'
        ? `hover ${action.target.column},${action.target.row}`
        : `hover ${action.target.kind}=${JSON.stringify(action.target.text)}`;
    }
    if (action.kind === 'wheel') return `wheel ${action.direction}`;
    if (action.target.kind === 'coordinates') {
      return `click ${action.target.column},${action.target.row}`;
    }
    return `click ${action.target.kind}=${JSON.stringify(action.target.text)}`;
  }

  protected static printObservation(
    snapshot: HarnessSnapshot.Model,
    statusPath: string,
    label: string,
    cellDumps: readonly CellDumpRequest[] = [],
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

    for (const dump of cellDumps) {
      const cells: string[] = [];
      for (let column = dump.from; column <= dump.to; column++) {
        const cell = snapshot.cell(dump.row, column);
        cells.push(
          cell === null
            ? `${column}:∅`
            : `${column}:'${cell.characters}' bg${cell.background} fg${cell.foreground}`,
        );
      }
      console.log(
        `\n--- cells row ${dump.row}, columns ${dump.from}-${dump.to} ---\n${cells.join(' | ')}`,
      );
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
      '  --size LINE_COUNT    generate and open a temporary scale fixture',
      '  --key NAME           send one named key; repeat to preserve order',
      '  --wheel DIRECTION    send one wheel notch at the grid center',
      '  --type TEXT          type literal characters (palette filters, inputs)',
      '  --click TARGET       click COLUMN,ROW, text=TEXT, or fold-control=TEXT',
      '  --hover TARGET       move the pointer there without clicking (hover states)',
      '  --frame-silent      declare the preceding action needs no repaint',
      '  --wait-for-text TEXT make the preceding action wait for new visible text',
      '  --wait-for-status FIELD=JSON',
      '  --gesture NAME       a named user gesture with its wait built in (openPanel, closePanel)',
      '  --home DIR           persistent home directory (kept after the run; state carries across runs)',
      '  --env KEY=VALUE      extra app environment variable; repeatable',
      '  --cells ROW,C1-C2    print chars + bg/fg for a cell range with every observation',
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
  readonly cellDumps: readonly CellDumpRequest[];
  readonly homeDirectoryOverride: string | null;
  readonly environmentOverrides: Readonly<Record<string, string>>;
  readonly showHelp: boolean;
}

interface CellDumpRequest {
  readonly row: number;
  readonly from: number;
  readonly to: number;
}

interface DriveSettledStatusRule {
  readonly pendingName: string;
  readonly isPending: (
    status: Readonly<Record<string, unknown>>,
    snapshot?: HarnessSnapshot.Model,
  ) => boolean;
}

type DriveAction =
  | {
      readonly kind: 'key';
      readonly keyName: string;
      readonly completion: DriveActionCompletion;
    }
  | {
      readonly kind: 'wheel';
      readonly direction: DriveWheelDirection;
      readonly completion: DriveActionCompletion;
    }
  | {
      readonly kind: 'type';
      readonly text: string;
      readonly completion: DriveActionCompletion;
    }
  | {
      readonly kind: 'hover';
      readonly target: DriveClickTarget;
      readonly completion: DriveActionCompletion;
    }
  | {
      readonly kind: 'click';
      readonly target: DriveClickTarget;
      readonly completion: DriveActionCompletion;
    };

type DriveActionCompletion =
  | { readonly kind: 'screen-change' }
  | { readonly kind: 'frame-silent'; readonly reason: string }
  | { readonly kind: 'grid-text'; readonly text: string }
  | {
      readonly kind: 'status';
      readonly fieldName: string;
      readonly expectedValue: unknown;
    };

type DriveClickTarget =
  | {
      readonly kind: 'coordinates';
      readonly column: number;
      readonly row: number;
    }
  | {
      readonly kind: 'text' | 'fold-control';
      readonly text: string;
    };

interface DriveClickPosition {
  readonly column: number;
  readonly row: number;
}

type DriveResolvedAction =
  | Exclude<DriveAction, { readonly kind: 'click' }>
  | (Extract<DriveAction, { readonly kind: 'click' }> & {
      readonly resolvedPosition: DriveClickPosition;
    });

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

interface DriveScrollTarget {
  readonly fieldName: 'editorScrollLeft' | 'editorScrollTop';
  readonly targetPosition: number;
}

if (import.meta.main) {
  try {
    await Drive.Class.main(process.argv.slice(2));
  } catch (error) {
    console.error(`drive: ${String((error as Error).message ?? error)}`);
    process.exitCode = 1;
  }
}
