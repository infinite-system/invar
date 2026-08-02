#!/usr/bin/env bun
// A FLUENT session over the real PTY — one flowing operation, no preamble.
//
// The point of this file is that a drive script contains only the drive. No
// imports, no fixture setup, no driver construction, no disposal:
//
//   app.key('Control+j').waitForStatus('panelVisible', true)
//      .moveMouse(116, 23).click().waitForStatus('panelListVisible', true)
//
// Run it with:
//   bun scripts/harness/DriveSession.ts --open DIR --script drive.ts
//   bun scripts/harness/DriveSession.ts --open DIR --eval "app.key('Control+j')"
//
// Deliberately PRIMITIVE. An earlier attempt grew app-specific verbs
// (openInstances, addInstance) and the user rejected the direction: those
// encode the implementation into the instrument, so every new surface needs a
// new verb and the driver slowly becomes a second copy of the app's concepts.
// Coordinates, text, and published state are the whole vocabulary here.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Static } from 'ivue/extras';
import { Reactive } from 'ivue';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

/** One queued step. The queue is what makes the chain read as a flowing
 *  operation while every step still awaits a real condition. */
interface DriveStep {
  readonly description: string;
  readonly run: () => Promise<void>;
}

class $DriveSession {
  protected readonly steps: DriveStep[] = [];
  protected pointerColumn = 0;
  protected pointerRow = 0;
  protected quiet = false;

  constructor(
    public readonly driver: PtyTestDriver.Model,
    public readonly statusPath: string,
  ) {}

  // ---- input ----

  /** Move the pointer. Hover states are real state, so this is a real move. */
  moveMouse(column: number, row: number): this {
    this.pointerColumn = column;
    this.pointerRow = row;
    return this.step(`move to ${column},${row}`, async () => {
      this.driver.sendMouseWithoutFrameExpectation({
        kind: 'move',
        column,
        row,
        button: 'none',
      });
    });
  }

  /** Click where the pointer is, or at an explicit cell. */
  click(column?: number, row?: number): this {
    const targetColumn = column ?? this.pointerColumn;
    const targetRow = row ?? this.pointerRow;
    if (column !== undefined) this.pointerColumn = column;
    if (row !== undefined) this.pointerRow = row;
    return this.step(`click ${targetColumn},${targetRow}`, async () => {
      this.driver.sendMouse({
        kind: 'press',
        column: targetColumn,
        row: targetRow,
        button: 'left',
      });
      this.driver.sendMouse({
        kind: 'release',
        column: targetColumn,
        row: targetRow,
        button: 'left',
      });
    });
  }

  /** Click the first cell of some visible text — the user points at what they
   *  can read, so the script says what they read. */
  clickText(text: string, columnOffset = 0): this {
    return this.step(`click text ${JSON.stringify(text)}`, async () => {
      const snapshot = await this.driver.awaitGridCondition(
        `${JSON.stringify(text)} is visible to click`,
        (candidate) => candidate.findText(text) !== null,
      );
      const position = snapshot.findText(text);
      if (!position) throw new Error(`${text} vanished before the click`);
      const column = position.column + columnOffset;
      this.pointerColumn = column;
      this.pointerRow = position.row;
      this.driver.sendMouseWithoutFrameExpectation({
        kind: 'move',
        column,
        row: position.row,
        button: 'none',
      });
      this.driver.sendMouse({
        kind: 'press',
        column,
        row: position.row,
        button: 'left',
      });
      this.driver.sendMouse({
        kind: 'release',
        column,
        row: position.row,
        button: 'left',
      });
    });
  }

  key(...keyNames: string[]): this {
    return this.step(`key ${keyNames.join(' ')}`, async () => {
      this.driver.sendKeysWithoutFrameExpectation(...keyNames);
    });
  }

  type(text: string): this {
    return this.step(`type ${JSON.stringify(text)}`, async () => {
      for (const character of text) {
        this.driver.sendKeysWithoutFrameExpectation(character);
      }
    });
  }

  // ---- waits: every one is a CONDITION, never a sleep ----

  /** Wait until published state reaches a value. */
  waitForStatus(
    fieldName: string,
    expectedValue: unknown,
    timeoutMilliseconds = 15_000,
  ): this {
    return this.step(
      `wait ${fieldName}=${JSON.stringify(expectedValue)}`,
      async () => {
        await HarnessSmoke.Class.awaitStatusWithoutFrame(
          this.driver,
          this.statusPath,
          `${fieldName} becomes ${JSON.stringify(expectedValue)}`,
          (status) =>
            JSON.stringify(status[fieldName]) === JSON.stringify(expectedValue),
          timeoutMilliseconds,
        );
      },
    );
  }

  /** Wait until a published LIST no longer holds a value — what "it closed"
   *  actually means for anything that lives in a list. */
  waitForStatusWithout(
    fieldName: string,
    value: string,
    timeoutMilliseconds = 15_000,
  ): this {
    return this.step(
      `wait ${fieldName} drops ${JSON.stringify(value)}`,
      async () => {
        await HarnessSmoke.Class.awaitStatusWithoutFrame(
          this.driver,
          this.statusPath,
          `${fieldName} drops ${JSON.stringify(value)}`,
          (status) => {
            const list = status[fieldName];
            return Array.isArray(list) && !list.includes(value);
          },
          timeoutMilliseconds,
        );
      },
    );
  }

  waitForText(text: string): this {
    return this.step(`wait text ${JSON.stringify(text)}`, async () => {
      await this.driver.awaitGridCondition(
        `${JSON.stringify(text)} is painted`,
        (candidate) => candidate.findText(text) !== null,
      );
    });
  }

  waitForTextGone(text: string): this {
    return this.step(`wait text gone ${JSON.stringify(text)}`, async () => {
      await this.driver.awaitGridCondition(
        `${JSON.stringify(text)} is no longer painted`,
        (candidate) => candidate.findText(text) === null,
      );
    });
  }

  /** Wait until the row under the pointer paints something it did not have
   *  before the move — the hover REVEAL, as a condition. The argument is a
   *  deadline, never a sleep: a hover that never lands is a failure, not a
   *  slow success. */
  waitForHoverState(timeoutMilliseconds = 2_000): this {
    const row = this.pointerRow;
    return this.step(`wait hover reveal on row ${row}`, async () => {
      const before = this.driver.snapshot().rowText(row);
      await this.driver.awaitGridCondition(
        `row ${row} reveals its hover controls`,
        (candidate) => candidate.rowText(row) !== before,
        timeoutMilliseconds,
      );
    });
  }

  /** Wait until a LIVE GRAPH path reaches a value (task #469). The app answers
   *  these only at a frame-settle boundary — the same point the status
   *  projection publishes at — so this wait never observes a state no
   *  completed frame had. The path walks the app's ports object
   *  (panelHost.spaces[0].kind, workspaceSet.active.editor.…); Refs unwrap in
   *  the app's resolver, so a path never contains `.value`. */
  waitFor(
    path: string,
    expectedValue: unknown,
    timeoutMilliseconds = 15_000,
  ): this {
    return this.step(
      `wait graph ${path}=${JSON.stringify(expectedValue)}`,
      async () => {
        const deadline = Date.now() + timeoutMilliseconds;
        let lastValue: unknown = '<never answered>';
        while (Date.now() < deadline) {
          const response = await this.graphQuery(path, 'settle', deadline);
          lastValue = response.value;
          if (
            JSON.stringify(response.value) === JSON.stringify(expectedValue)
          ) {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        throw new Error(
          `waitFor(${JSON.stringify(path)}) timed out after ` +
            `${timeoutMilliseconds}ms: wanted ${JSON.stringify(expectedValue)}, ` +
            `last settled value was ${JSON.stringify(lastValue)}`,
        );
      },
    );
  }

  /** Wait for any completed repaint. Use when the change is visual and the
   *  script does not care WHAT changed. */
  waitForRepaint(timeoutMilliseconds = 5_000): this {
    return this.step('wait repaint', async () => {
      const before = this.driver.snapshot().text();
      await this.driver.awaitGridCondition(
        'the screen repaints',
        (candidate) => candidate.text() !== before,
        timeoutMilliseconds,
      );
    });
  }

  // ---- reading ----

  /** Resolve a dotted/indexed PATH against the published status.
   *  `panelListGeometry.width`, `panelCellLabels[0]`. Returns a miss marker
   *  rather than undefined, because "absent" and "published as undefined" are
   *  different answers and the caller must be able to tell them apart.
   *  (lodash.get would do this; it is not a dependency here and one small
   *  resolver beats a new runtime dep for a test instrument.) */
  protected static readonly PATH_MISS: unique symbol = Symbol('path-miss');

  protected resolvePath(
    source: Record<string, unknown>,
    path: string,
  ): unknown {
    const segments = path
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .filter((segment) => segment !== '');
    let current: unknown = source;
    for (const segment of segments) {
      if (current === null || typeof current !== 'object') {
        return $DriveSession.PATH_MISS;
      }
      const container = current as Record<string, unknown>;
      if (!(segment in container)) return $DriveSession.PATH_MISS;
      current = container[segment];
    }
    return current;
  }

  /** Print named status fields at this point in the flow. */
  show(...fieldNames: string[]): this {
    return this.step(`show ${fieldNames.join(', ')}`, async () => {
      const status = HarnessSmoke.Class.readStatus(this.statusPath);
      const missing: string[] = [];
      for (const fieldName of fieldNames) {
        // A field the projection does not publish is NOT a value of undefined.
        // Printing it as one makes a typo, an unpublished field, and a genuinely
        // absent value indistinguishable — a reading that can only fail toward
        // "looks fine". Say which it is.
        const resolved = this.resolvePath(
          status as Record<string, unknown>,
          fieldName,
        );
        if (resolved === $DriveSession.PATH_MISS) {
          missing.push(fieldName);
          console.log(
            `  ${fieldName} = <NOT PUBLISHED by the status projection>`,
          );
          continue;
        }
        console.log(`  ${fieldName} = ${JSON.stringify(resolved)}`);
      }
      if (missing.length > 0) {
        const published = Object.keys(status).sort();
        const suggestions = missing.map((fieldName) => {
          const needle = fieldName.replace(/[^a-z]/gi, '').toLowerCase();
          const near = published.filter((candidate) =>
            candidate.toLowerCase().includes(needle.slice(0, 6)),
          );
          return `${fieldName}${near.length > 0 ? ` — did you mean ${near.slice(0, 4).join(', ')}?` : ''}`;
        });
        throw new Error(
          `show() named ${missing.length} field(s) the status projection does ` +
            `not publish. Paths resolve INTO published values ` +
            `(panelListGeometry.width, panelCellLabels[0]) but the top level ` +
            `is the status projection, not the app hierarchy.\n  ` +
            suggestions.join('\n  '),
        );
      }
    });
  }

  /** Print the painted screen, or a row band of it. */
  showScreen(firstRow = 0, lastRow = -1): this {
    return this.step('show screen', async () => {
      const snapshot = this.driver.snapshot();
      const end = lastRow < 0 ? snapshot.rows - 1 : lastRow;
      for (let row = firstRow; row <= end; row += 1) {
        console.log(
          `  ${String(row).padStart(2, ' ')} |${snapshot.rowText(row)}|`,
        );
      }
    });
  }

  note(message: string): this {
    return this.step(`note ${message}`, async () => {
      console.log(`\n== ${message} ==`);
    });
  }

  /** Ask the LIVE app graph for a value by path — the question nobody
   *  pre-published into the status projection. Answered from the app's next
   *  event-loop poll: one consistent single-threaded read, but possibly a
   *  between-frames transient. For CONDITIONS use waitFor, which samples only
   *  at frame-settle. Flushes the chain first, so it observes the state the
   *  chain actually produced. */
  async get(path: string): Promise<unknown> {
    await this.flush();
    const response = await this.graphQuery(path, 'now', Date.now() + 10_000);
    return response.value;
  }

  /** EXPERIMENT primitive: assign a value into the live graph to quickly
   *  confirm a hypothesis ("would width 7 cause the symptom?"). Returns the
   *  value read back after the write. `reactive: false` in the app's answer
   *  becomes a warning here — a plain-field write triggers no repaint, so
   *  the screen not moving is the write's nature, not a defect. NEVER used
   *  for verification: a set bypasses the user's own input path; smokes and
   *  gates keep driving real gestures. */
  async set(path: string, value: unknown): Promise<unknown> {
    await this.flush();
    const response = await this.graphQuery(path, 'now', Date.now() + 10_000, {
      value,
    });
    if (response.reactive === false) {
      console.log(
        `  set ${path}: wrote a PLAIN field — nothing reactive observes it, ` +
          `expect no repaint`,
      );
    }
    return response.value;
  }

  // ---- the graph bridge (task #469) ----

  protected graphRequestId = 0;

  protected async graphQuery(
    path: string,
    mode: 'now' | 'settle',
    deadline: number,
    set?: { value: unknown },
  ): Promise<{
    value: unknown;
    frame: number;
    settled: boolean;
    reactive?: boolean;
  }> {
    // Time-based ids: monotone across app restarts sharing one --home, so a
    // stale request file from a previous run can never shadow a fresh one.
    this.graphRequestId = Math.max(this.graphRequestId + 1, Date.now());
    const id = this.graphRequestId;
    const requestPath = `${this.statusPath}.graph-request.json`;
    const responsePath = `${this.statusPath}.graph-response.json`;
    const temporaryPath = `${requestPath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify({ id, path, mode, set }));
    renameSync(temporaryPath, requestPath);
    while (Date.now() < deadline) {
      const response = this.readGraphResponse(responsePath);
      if (response && response.id === id) {
        if (response.resolved !== true) {
          throw this.graphMiss(path, response);
        }
        return {
          value: response.value,
          frame: Number(response.frame ?? -1),
          settled: response.settled === true,
          ...(typeof response.reactive === 'boolean'
            ? { reactive: response.reactive }
            : {}),
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error(
      `the app never answered graph request ${JSON.stringify(path)} ` +
        `(mode ${mode}). Is TUI_STATUS_PATH set and the app past boot?`,
    );
  }

  protected readGraphResponse(
    responsePath: string,
  ): Record<string, unknown> | null {
    try {
      return JSON.parse(readFileSync(responsePath, 'utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      return null;
    }
  }

  /** A path that does not resolve is NOT a value of undefined — name the node
   *  the walk died at and what WAS addressable there. */
  protected graphMiss(path: string, response: Record<string, unknown>): Error {
    const diedAt = String(response.diedAt ?? '<unknown>');
    const available = Array.isArray(response.available)
      ? (response.available as string[])
      : [];
    const lastSegment = path.split('.').pop() ?? path;
    const needle = lastSegment.replace(/[^a-z]/gi, '').toLowerCase();
    const near = available.filter((candidate) =>
      candidate.toLowerCase().includes(needle.slice(0, 6)),
    );
    return new Error(
      [
        `graph path ${JSON.stringify(path)} did not resolve.`,
        `  walk died at: ${diedAt}`,
        response.error ? `  error: ${String(response.error)}` : '',
        near.length > 0
          ? `  did you mean: ${near.slice(0, 6).join(', ')}?`
          : '',
        available.length > 0
          ? `  addressable there: ${available.slice(0, 40).join(', ')}${available.length > 40 ? ', …' : ''}`
          : '',
      ]
        .filter((line) => line !== '')
        .join('\n'),
    );
  }

  /** Escape hatches for the cases a chain cannot express. Both flush first, so
   *  they observe the state the chain actually produced. */
  async status(): Promise<Record<string, unknown>> {
    await this.flush();
    return HarnessSmoke.Class.readStatus(this.statusPath) as Record<
      string,
      unknown
    >;
  }

  async screen(): Promise<HarnessSnapshot.Model> {
    await this.flush();
    return this.driver.snapshot();
  }

  // ---- the chain runs when it is awaited ----

  protected step(description: string, run: () => Promise<void>): this {
    this.steps.push({ description, run });
    return this;
  }

  async flush(): Promise<void> {
    while (this.steps.length > 0) {
      const nextStep = this.steps.shift();
      if (!nextStep) break;
      if (!this.quiet) console.log(`drive: ${nextStep.description}`);
      await nextStep.run();
    }
  }

  /** Makes the chain awaitable: `await app.key(...).waitForStatus(...)`. */
  then<TResult = void>(
    onFulfilled?: ((value: void) => TResult | PromiseLike<TResult>) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ): Promise<TResult> {
    return this.flush().then(
      onFulfilled as (value: void) => TResult,
      onRejected,
    ) as Promise<TResult>;
  }

  silence(): this {
    this.quiet = true;
    return this;
  }
}

export namespace DriveSession {
  export const $Class = $DriveSession;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

class $DriveScriptRunner {
  /** Open the app on a workspace and hand a live session to one snippet. The
   *  snippet never sees setup or teardown. */
  static async run(options: {
    workspaceRoot?: string;
    source: string;
    columns?: number;
    rows?: number;
    homeDirectory?: string;
  }): Promise<void> {
    const workspaceRoot =
      options.workspaceRoot ?? this.temporaryWorkspaceRoot();
    const homeDirectory =
      options.homeDirectory ?? mkdtempSync(join(tmpdir(), 'drive-home-'));
    mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
    const statusPath = join(homeDirectory, 'status.json');
    const driver = new PtyTestDriver.Class({
      workspaceRoot,
      columns: options.columns ?? 120,
      rows: options.rows ?? 40,
      homeDirectory,
      environment: {
        TUI_STATUS_PATH: statusPath,
        INVAR_AGENT_BACKEND: 'echo',
      },
    });
    const session = new DriveSession.Class(driver, statusPath);
    try {
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the app publishes its first status',
        (candidate) => candidate.width !== undefined,
      );
      const snippet = new Function(
        'app',
        'driver',
        `return (async () => { ${options.source}\n })();`,
      ) as (
        app: DriveSession.Model,
        driver: PtyTestDriver.Model,
      ) => Promise<void>;
      await snippet(session, driver);
      // A chain the snippet never awaited still runs — the script IS the drive.
      await session.flush();
    } finally {
      await driver.dispose();
    }
  }

  protected static temporaryWorkspaceRoot(): string {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'drive-work-'));
    return workspaceRoot;
  }

  static async main(argumentsList: readonly string[]): Promise<void> {
    let workspaceRoot: string | undefined;
    let source: string | undefined;
    let columns = 120;
    let rows = 40;
    let homeDirectory: string | undefined;
    for (let index = 0; index < argumentsList.length; index += 1) {
      const argument = argumentsList[index];
      const value = argumentsList[index + 1] ?? '';
      if (argument === '--open') {
        workspaceRoot = resolve(value);
        index += 1;
      } else if (argument === '--script') {
        source = await Bun.file(resolve(value)).text();
        index += 1;
      } else if (argument === '--eval') {
        source = value;
        index += 1;
      } else if (argument === '--home') {
        homeDirectory = resolve(value);
        index += 1;
      } else if (argument === '--geometry') {
        const [columnText, rowText] = value.split('x');
        columns = Number(columnText) || columns;
        rows = Number(rowText) || rows;
        index += 1;
      } else if (argument === '--help') {
        console.log(this.helpText);
        return;
      }
    }
    if (!source) {
      console.error(this.helpText);
      process.exitCode = 2;
      return;
    }
    await this.run({ workspaceRoot, source, columns, rows, homeDirectory });
  }

  protected static get helpText(): string {
    return [
      'Usage: bun scripts/harness/DriveSession.ts [options]',
      '',
      '  --open DIR           workspace to open (default: a temp workspace)',
      '  --script FILE        a snippet: NO imports, NO setup. `app` is live.',
      '  --eval CODE          the same, inline',
      '  --geometry CxR       terminal size (default 120x40)',
      '  --home DIR           persistent home, so state carries across runs',
      '',
      'The snippet gets `app` (fluent, awaitable) and `driver` (the raw PTY).',
      'Example snippet:',
      '',
      "  app.key('Control+j').waitForStatus('panelVisible', true)",
      "     .clickText('+ Plugin').waitForRepaint()",
      "     .show('panelContentLabels')",
      '',
      'Live graph access (any app state, no publish tax):',
      '',
      "  await app.get('panelHost.panelListWidth')      // ask now",
      "  app.waitFor('panelHost.visible', true)         // condition, frame-settled",
      "  await app.set('panelHost.panelListWidth', 30)  // EXPERIMENT only — never verification",

      '',
    ].join('\n');
  }
}

export namespace DriveScriptRunner {
  export const $Class = Static($DriveScriptRunner);
  export let Class = $Class;
}

if (import.meta.main) {
  await DriveScriptRunner.Class.main(process.argv.slice(2));
}
