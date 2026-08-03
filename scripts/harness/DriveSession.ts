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
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Static } from 'ivue/extras';
import { Reactive } from 'ivue';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { GraphClient } from './GraphClient';
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

  /** A real terminal CANNOT emit a pointer event outside its own grid, so a
   *  probe that tries is a mistake, never a gesture — and sending it anyway
   *  would be the silent no-op class: the app ignores the impossible cell and
   *  the probe "passes" having tested nothing. Checked at step-run time
   *  against the live geometry, so it survives a resize. */
  protected requireCellInsideScreen(column: number, row: number): void {
    const screen = this.driver.snapshot();
    if (
      column < 0 ||
      row < 0 ||
      column >= screen.columns ||
      row >= screen.rows
    ) {
      throw new Error(
        `pointer target ${column},${row} is outside the ${screen.columns}x` +
          `${screen.rows} screen — a real terminal cannot produce this event`,
      );
    }
  }

  /** Move the pointer. Hover states are real state, so this is a real move. */
  moveMouse(column: number, row: number): this {
    this.pointerColumn = column;
    this.pointerRow = row;
    return this.step(`move to ${column},${row}`, async () => {
      this.requireCellInsideScreen(column, row);
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
      this.requireCellInsideScreen(targetColumn, targetRow);
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
        await GraphClient.Class.awaitValue(
          this.statusPath,
          path,
          expectedValue,
          timeoutMilliseconds,
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

  // ---- the graph bridge (task #469; protocol lives in GraphClient) ----

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
    return GraphClient.Class.query(this.statusPath, path, mode, {
      deadline,
      set,
    });
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

  /** Drop every queued step. The drive server calls this after a snippet
   *  throws: the queue may hold steps built on the failed premise, and
   *  replaying them against the NEXT snippet would attribute the old
   *  snippet's intent to the new one. */
  abandonQueue(): void {
    this.steps.length = 0;
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

  // ---- the drive server (task #472, case 1) ----
  //
  // One warm app, many probes. `--serve` boots the app ONCE and then executes
  // attached snippets against the SAME live session; `--attach` sends a
  // snippet from any other process and prints its output. The win is not the
  // ~250ms boot — it is that navigated STATE survives between probes, so a
  // sighting continues where the last one ended instead of re-driving there.
  //
  // Input stays real PTY bytes through the one persistent driver; the graph
  // channel is file-based and works from any process already. The protocol
  // here is the same write-temp+rename request/response family as GraphClient.
  // One attach at a time: a second writer before the server reads simply
  // replaces the request, and ids are time-monotone so nothing stale wins.

  protected static readonly DEFAULT_SERVER_DIRECTORY =
    '/tmp/invar-drive-server';

  static async serve(options: {
    workspaceRoot?: string;
    columns?: number;
    rows?: number;
    homeDirectory?: string;
    serverDirectory?: string;
    mirror?: boolean;
  }): Promise<void> {
    const serverDirectory =
      options.serverDirectory ?? this.DEFAULT_SERVER_DIRECTORY;
    mkdirSync(serverDirectory, { recursive: true });
    // A mirrored server has a human WATCHING — they almost certainly mean the
    // project they are standing in, not an empty scratch dir. Headless serves
    // keep the isolated temp workspace.
    const workspaceRoot =
      options.workspaceRoot ??
      (options.mirror ? process.cwd() : this.temporaryWorkspaceRoot());
    const homeDirectory =
      options.homeDirectory ?? mkdtempSync(join(tmpdir(), 'drive-home-'));
    mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
    if (options.mirror && !options.homeDirectory) {
      // The watching human compares the mirrored app against the Invar they
      // use daily, which runs on THEIR settings (glyph tier, theme). A scratch
      // home with defaults renders a different app and reads as "malformed".
      // Seed by COPY, never by sharing: the inner app's writes stay in the
      // sandbox and the real config stays untouchable (the #465 damaged-config
      // incident is why this is a hard line).
      const realSettingsPath = join(
        process.env.HOME ?? '',
        '.config',
        'invar',
        'settings.json',
      );
      try {
        writeFileSync(
          join(homeDirectory, '.config', 'invar', 'settings.json'),
          readFileSync(realSettingsPath),
        );
        console.log(`drive-server: seeded settings from ${realSettingsPath}`);
      } catch {
        // No real config to inherit — defaults are correct then.
      }
    }
    const statusPath = join(homeDirectory, 'status.json');
    // Mirroring means a human is WATCHING in a real terminal (often an Invar
    // terminal pane — the app inside the app), so the inner app inherits the
    // hosting terminal's geometry and the mirror fills the pane exactly.
    const hostColumns =
      options.mirror && process.stdout.columns ? process.stdout.columns : null;
    const hostRows =
      options.mirror && process.stdout.rows ? process.stdout.rows : null;
    // A mirrored app is DRAWN by the hosting terminal, so it must style itself
    // for that terminal, not for the harness's synthetic identity. The server
    // process runs inside the hosting terminal (locally or over ssh), so its
    // own env carries the truth — forward the identity variables; they win
    // over the harness's TERM/COLORTERM constants. Query-negotiated
    // capabilities (cell widths, graphics probes) still answer from the
    // harness emulator — the residual mismatch class, tracked in task #473.
    const hostIdentity: Record<string, string> = {};
    if (options.mirror) {
      for (const key of [
        'TERM',
        'COLORTERM',
        'TERM_PROGRAM',
        'TERM_PROGRAM_VERSION',
        'LANG',
        'LC_ALL',
        'NERD_FONT',
      ]) {
        const value = process.env[key];
        if (value !== undefined) hostIdentity[key] = value;
      }
    }
    const driver = new PtyTestDriver.Class({
      workspaceRoot,
      columns: options.columns ?? hostColumns ?? 120,
      rows: options.rows ?? hostRows ?? 40,
      homeDirectory,
      environment: {
        ...hostIdentity,
        TUI_STATUS_PATH: statusPath,
        INVAR_AGENT_BACKEND: 'echo',
      },
    });
    if (options.mirror) {
      // The WATCH feed: every byte the app writes, relayed verbatim. The
      // human sees exactly what the agent's gestures cause, live — dropdowns
      // opening, state changing — because this IS the app's own output, not
      // a reconstruction.
      driver.tapOutput((bytes) => process.stdout.write(bytes));
      // The mirrored enable-sequences make the HOSTING terminal start
      // reporting its own mouse and answering the inner app's capability
      // queries — into OUR stdin. Cooked mode would ECHO all of that as
      // gibberish (the `35;66;…` class), so: raw mode, swallow everything,
      // keep only Ctrl+C (0x03 arrives as a byte in raw mode) as the local
      // "stop watching" gesture. Watch-only is the v1 contract — the human's
      // input deliberately does NOT reach the inner app.
      if (process.stdin.isTTY) {
        process.stdin.setRawMode?.(true);
        process.stdin.resume();
        process.stdin.on('data', (bytes: Buffer) => {
          if (bytes.includes(0x03)) {
            this.writeServerFile(
              join(serverDirectory, 'snippet-request.json'),
              {
                id: Date.now(),
                stop: true,
              },
            );
          }
        });
      }
    }
    const session = new DriveSession.Class(driver, statusPath);
    const requestPath = join(serverDirectory, 'snippet-request.json');
    const responsePath = join(serverDirectory, 'snippet-response.json');
    const manifestPath = join(serverDirectory, 'server.json');
    // A stale request from a PREVIOUS server session must never replay into
    // this one — the last one standing is usually {stop:true}, which would
    // stop a fresh server the instant it boots. Anything already on disk at
    // startup is by definition not addressed to this server.
    const staleRequest = this.readServerFile(requestPath);
    let lastServicedId =
      staleRequest && typeof staleRequest.id === 'number' ? staleRequest.id : 0;
    try {
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the served app publishes its first status',
        (candidate) => candidate.width !== undefined,
      );
      writeFileSync(
        manifestPath,
        JSON.stringify(
          {
            pid: process.pid,
            statusPath,
            workspaceRoot,
            homeDirectory,
            startedAtMs: Date.now(),
          },
          null,
          2,
        ),
      );
      console.log(
        `drive-server: ready on ${serverDirectory} (workspace ${workspaceRoot})`,
      );
      for (;;) {
        const request = this.readServerFile(requestPath);
        if (
          request &&
          typeof request.id === 'number' &&
          request.id > lastServicedId
        ) {
          lastServicedId = request.id;
          if (request.stop === true) {
            this.writeServerFile(responsePath, {
              id: request.id,
              ok: true,
              output: 'drive-server: stopped',
            });
            break;
          }
          const captured: string[] = [];
          const originalLog = console.log;
          console.log = (...parts: unknown[]) => {
            captured.push(parts.map((part) => String(part)).join(' '));
            originalLog(...parts);
          };
          try {
            const snippet = new Function(
              'app',
              'driver',
              `return (async () => { ${String(request.source)}\n })();`,
            ) as (
              app: DriveSession.Model,
              driver: PtyTestDriver.Model,
            ) => Promise<void>;
            await snippet(session, driver);
            await session.flush();
            this.writeServerFile(responsePath, {
              id: request.id,
              ok: true,
              output: captured.join('\n'),
            });
          } catch (thrown) {
            // The server SURVIVES a bad snippet: abandon the queued steps the
            // snippet left behind, answer with the error, keep serving.
            session.abandonQueue();
            this.writeServerFile(responsePath, {
              id: request.id,
              ok: false,
              output: captured.join('\n'),
              error: thrown instanceof Error ? thrown.message : String(thrown),
            });
          } finally {
            console.log = originalLog;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    } finally {
      try {
        rmSync(manifestPath, { force: true });
      } catch {
        /* the manifest is advisory; a stale one is caught by the pid check */
      }
      await driver.dispose();
      if (options.mirror && process.stdin.isTTY) {
        // Hand the hosting terminal back the way we found it: cooked stdin,
        // and the inner app's own shutdown bytes (already mirrored) have
        // disabled the mouse/alt-screen modes its boot enabled.
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
      }
    }
  }

  static async attach(options: {
    source: string;
    serverDirectory?: string;
    stop?: boolean;
    timeoutMilliseconds?: number;
  }): Promise<void> {
    const serverDirectory =
      options.serverDirectory ?? this.DEFAULT_SERVER_DIRECTORY;
    const manifest = this.readServerFile(join(serverDirectory, 'server.json'));
    if (!manifest || typeof manifest.pid !== 'number') {
      throw new Error(
        `no drive server on ${serverDirectory} — start one with:\n` +
          `  bun scripts/harness/DriveSession.ts --serve --open DIR`,
      );
    }
    try {
      process.kill(manifest.pid as number, 0);
    } catch {
      throw new Error(
        `the drive server manifest names pid ${manifest.pid}, which is dead — ` +
          `remove ${serverDirectory} and start a fresh server`,
      );
    }
    const id = Date.now();
    const requestPath = join(serverDirectory, 'snippet-request.json');
    const responsePath = join(serverDirectory, 'snippet-response.json');
    this.writeServerFile(requestPath, {
      id,
      ...(options.stop === true ? { stop: true } : { source: options.source }),
    });
    const deadline = Date.now() + (options.timeoutMilliseconds ?? 60_000);
    while (Date.now() < deadline) {
      const response = this.readServerFile(responsePath);
      if (response && response.id === id) {
        if (typeof response.output === 'string' && response.output !== '') {
          console.log(response.output);
        }
        if (response.ok !== true) {
          console.error(`attach: snippet failed: ${String(response.error)}`);
          process.exitCode = 1;
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error(
      'the drive server never answered — it may be mid-snippet; ' +
        'retry, or check its terminal',
    );
  }

  protected static readServerFile(
    path: string,
  ): Record<string, unknown> | null {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  protected static writeServerFile(
    path: string,
    body: Record<string, unknown>,
  ): void {
    writeFileSync(`${path}.tmp`, JSON.stringify(body, null, 2));
    renameSync(`${path}.tmp`, path);
  }

  static async main(argumentsList: readonly string[]): Promise<void> {
    let workspaceRoot: string | undefined;
    let source: string | undefined;
    let columns = 120;
    let rows = 40;
    let columnsExplicit = false;
    let homeDirectory: string | undefined;
    let serverDirectory: string | undefined;
    let serve = false;
    let mirror = false;
    let attachSource: string | undefined;
    let stop = false;
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
      } else if (argument === '--serve') {
        serve = true;
      } else if (argument === '--mirror') {
        mirror = true;
      } else if (argument === '--attach') {
        attachSource = value;
        index += 1;
      } else if (argument === '--attach-script') {
        attachSource = await Bun.file(resolve(value)).text();
        index += 1;
      } else if (argument === '--stop') {
        stop = true;
      } else if (argument === '--server-dir') {
        serverDirectory = resolve(value);
        index += 1;
      } else if (argument === '--geometry') {
        const [columnText, rowText] = value.split('x');
        columns = Number(columnText) || columns;
        rows = Number(rowText) || rows;
        columnsExplicit = true;
        index += 1;
      } else if (argument === '--help') {
        console.log(this.helpText);
        return;
      }
    }
    if (serve) {
      await this.serve({
        workspaceRoot,
        columns: columnsExplicit ? columns : undefined,
        rows: columnsExplicit ? rows : undefined,
        homeDirectory,
        serverDirectory,
        mirror,
      });
      return;
    }
    if (stop || attachSource !== undefined) {
      await this.attach({
        source: attachSource ?? '',
        serverDirectory,
        stop,
      });
      return;
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
      'Warm-app server (one boot, many probes; state survives between them):',
      '',
      '  --serve              boot once, then execute attached snippets forever',
      '  --mirror             relay the served app to THIS terminal, live —',
      '                       run it inside an Invar terminal pane and WATCH',
      '                       an attached agent drive the app inside the app',
      "  --attach CODE        run a snippet against the RUNNING server's session",
      '  --attach-script FILE the same, from a file',
      '  --stop               shut the server down',
      '  --server-dir DIR     rendezvous dir (default /tmp/invar-drive-server)',
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
