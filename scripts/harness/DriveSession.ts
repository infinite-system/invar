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
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
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
  protected humanPaceTempoMultiplier = 0;

  /** HUMAN PACE: every gesture moves at eye speed — the pointer GLIDES with
   *  a human's acceleration profile, clicks dwell before pressing, typing
   *  lands character by character. For a WATCHED session (the mirror), so an
   *  observing human can follow the agent's hand.
   *
   *  The motion model is Fitts-shaped: a gesture takes roughly constant TIME
   *  regardless of distance (a long throw sweeps fast mid-flight and lands
   *  softly; a short hop is just quick), with ease-in/ease-out. A constant
   *  cells-per-second glide was tried first and read robotic — long crossings
   *  dragged.
   *
   *  The tempo delays here are DELIBERATE ANIMATION, not synchronization:
   *  no step's correctness depends on them, every wait-for-state remains a
   *  real condition. Pacing a gesture is allowed; pacing a VERIFICATION is
   *  the sleep-as-sync defect.
   *
   *  `tempoMultiplier` scales every duration: 1 is the tuned default, 1.5 is
   *  half again slower, 0 returns to machine speed. */
  humanPace(tempoMultiplier = 1): this {
    this.humanPaceTempoMultiplier = Math.max(0, tempoMultiplier);
    return this;
  }

  protected get paced(): boolean {
    return this.humanPaceTempoMultiplier > 0;
  }

  /** Tempo only — never used to wait for app state. */
  protected async tempo(milliseconds: number): Promise<void> {
    if (!this.paced) return;
    await new Promise((resolve) =>
      setTimeout(resolve, milliseconds * this.humanPaceTempoMultiplier),
    );
  }

  /** The glide: eased positions over a near-constant gesture time. Uniform
   *  time slices with smoothstep-eased positions give the acceleration in
   *  the middle and the soft landing at the end. */
  protected async glideTo(column: number, row: number): Promise<void> {
    const fromColumn = this.pointerColumn;
    const fromRow = this.pointerRow;
    const distance = Math.max(
      Math.abs(column - fromColumn),
      Math.abs(row - fromRow),
    );
    if (distance === 0) return;
    // Fitts-shaped: mostly constant, gently longer for long throws.
    const gestureMilliseconds = Math.min(950, 260 + distance * 6);
    const stepCount = Math.max(3, Math.min(22, Math.round(distance / 2)));
    const sliceMilliseconds = gestureMilliseconds / stepCount;
    let lastColumn = fromColumn;
    let lastRow = fromRow;
    for (let step = 1; step <= stepCount; step += 1) {
      const linear = step / stepCount;
      const eased = linear * linear * (3 - 2 * linear); // smoothstep
      const stepColumn = Math.round(fromColumn + (column - fromColumn) * eased);
      const stepRow = Math.round(fromRow + (row - fromRow) * eased);
      if (stepColumn !== lastColumn || stepRow !== lastRow) {
        this.driver.sendMouseWithoutFrameExpectation({
          kind: 'move',
          column: stepColumn,
          row: stepRow,
          button: 'none',
        });
        lastColumn = stepColumn;
        lastRow = stepRow;
      }
      await this.tempo(sliceMilliseconds);
    }
  }

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

  /** Move the pointer. Hover states are real state, so this is a real move.
   *  Under humanPace the pointer GLIDES there instead of teleporting. */
  moveMouse(column: number, row: number): this {
    return this.step(`move to ${column},${row}`, async () => {
      this.requireCellInsideScreen(column, row);
      if (this.paced) {
        await this.glideTo(column, row);
      } else {
        this.driver.sendMouseWithoutFrameExpectation({
          kind: 'move',
          column,
          row,
          button: 'none',
        });
      }
      this.pointerColumn = column;
      this.pointerRow = row;
    });
  }

  /** Click where the pointer is, or at an explicit cell. Under humanPace the
   *  pointer glides to the target, dwells like a settling hand, presses,
   *  releases, and rests — so a watcher can follow cause to effect.
   *  Modifier clicks (Alt+click = LSP jump, Shift+click, Ctrl+click) pass the
   *  modifiers on BOTH press and release — surfaced by the first MCP demo,
   *  where the agent had to drop to raw sendMouse for Alt+click navigation. */
  click(
    column?: number,
    row?: number,
    modifiers: { alt?: boolean; shift?: boolean; control?: boolean } = {},
  ): this {
    const modifierNames = [
      modifiers.control ? 'Control' : '',
      modifiers.alt ? 'Alt' : '',
      modifiers.shift ? 'Shift' : '',
    ]
      .filter((name) => name !== '')
      .join('+');
    return this.step(
      `${modifierNames ? `${modifierNames}+` : ''}click ${column ?? 'pointer'},${row ?? ''}`,
      async () => {
        const targetColumn = column ?? this.pointerColumn;
        const targetRow = row ?? this.pointerRow;
        this.requireCellInsideScreen(targetColumn, targetRow);
        if (this.paced) {
          await this.glideTo(targetColumn, targetRow);
          await this.tempo(220);
        }
        this.pointerColumn = targetColumn;
        this.pointerRow = targetRow;
        this.driver.sendMouse({
          kind: 'press',
          column: targetColumn,
          row: targetRow,
          button: 'left',
          ...modifiers,
        });
        await this.tempo(90);
        this.driver.sendMouse({
          kind: 'release',
          column: targetColumn,
          row: targetRow,
          button: 'left',
          ...modifiers,
        });
        await this.tempo(260);
      },
    );
  }

  /** Click the first cell of some visible text — the user points at what they
   *  can read, so the script says what they read. */
  clickText(
    text: string,
    columnOffset = 0,
    modifiers: { alt?: boolean; shift?: boolean; control?: boolean } = {},
  ): this {
    return this.step(`click text ${JSON.stringify(text)}`, async () => {
      const snapshot = await this.driver.awaitGridCondition(
        `${JSON.stringify(text)} is visible to click`,
        (candidate) => candidate.findText(text) !== null,
      );
      const position = snapshot.findText(text);
      if (!position) throw new Error(`${text} vanished before the click`);
      const column = position.column + columnOffset;
      if (this.paced) {
        await this.glideTo(column, position.row);
        await this.tempo(220);
      } else {
        this.driver.sendMouseWithoutFrameExpectation({
          kind: 'move',
          column,
          row: position.row,
          button: 'none',
        });
      }
      this.pointerColumn = column;
      this.pointerRow = position.row;
      this.driver.sendMouse({
        kind: 'press',
        column,
        row: position.row,
        button: 'left',
        ...modifiers,
      });
      await this.tempo(90);
      this.driver.sendMouse({
        kind: 'release',
        column,
        row: position.row,
        button: 'left',
        ...modifiers,
      });
      await this.tempo(260);
    });
  }

  key(...keyNames: string[]): this {
    return this.step(`key ${keyNames.join(' ')}`, async () => {
      this.driver.sendKeysWithoutFrameExpectation(...keyNames);
      await this.tempo(180);
    });
  }

  type(text: string): this {
    return this.step(`type ${JSON.stringify(text)}`, async () => {
      for (const character of text) {
        this.driver.sendKeysWithoutFrameExpectation(character);
        // Human typing cadence with a light rhythm wobble — pacing only,
        // never synchronization.
        await this.tempo(105 + Math.random() * 45);
      }
    });
  }

  /** Scroll the wheel at the pointer (or glide to a cell first). Paced mode
   *  spaces the ticks so the watcher can follow the content move; the app
   *  paints a green scroll mark at the pointer while ticks arrive. */
  scroll(
    direction: 'up' | 'down',
    ticks = 3,
    column?: number,
    row?: number,
  ): this {
    return this.step(`scroll ${direction} x${ticks}`, async () => {
      const targetColumn = column ?? this.pointerColumn;
      const targetRow = row ?? this.pointerRow;
      this.requireCellInsideScreen(targetColumn, targetRow);
      if (
        this.paced &&
        (targetColumn !== this.pointerColumn || targetRow !== this.pointerRow)
      ) {
        await this.glideTo(targetColumn, targetRow);
        await this.tempo(160);
      }
      this.pointerColumn = targetColumn;
      this.pointerRow = targetRow;
      for (let tick = 0; tick < ticks; tick += 1) {
        this.driver.sendMouseWithoutFrameExpectation({
          kind: 'wheel',
          column: targetColumn,
          row: targetRow,
          direction,
        });
        await this.tempo(150);
      }
      await this.tempo(200);
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
   *  (panelHost.spaces[0].kind, workspaceSet.activeEditor.…); Refs unwrap in
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

  /** Print named status fields at this point in the flow. Pass a label plus
   *  an array when several observations need distinct evidence headings. */
  show(...fieldNames: string[]): this;
  show(label: string, fieldNames: readonly string[]): this;
  show(
    labelOrFieldName: string,
    ...remainingFieldNames: readonly (string | readonly string[])[]
  ): this {
    const labeled = Array.isArray(remainingFieldNames[0]);
    const label = labeled ? labelOrFieldName : null;
    const fieldNames = labeled
      ? (remainingFieldNames[0] as readonly string[])
      : [labelOrFieldName, ...(remainingFieldNames as readonly string[])];
    return this.step(`show ${fieldNames.join(', ')}`, async () => {
      if (label !== null) console.log(`\n== ${label} ==`);
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
    fixtureSize?: number;
    source: string;
    columns?: number;
    rows?: number;
    homeDirectory?: string;
  }): Promise<void> {
    if (
      options.workspaceRoot !== undefined &&
      options.fixtureSize !== undefined
    ) {
      throw new Error(
        'DriveSession workspace and fixture size are mutually exclusive',
      );
    }
    const scaleFixture =
      options.fixtureSize === undefined
        ? null
        : await HarnessSmoke.Class.createDriveScaleFixture(options.fixtureSize);
    const temporaryWorkspaceRoot =
      options.workspaceRoot === undefined && scaleFixture === null
        ? this.temporaryWorkspaceRoot()
        : null;
    const workspaceRoot =
      options.workspaceRoot ??
      scaleFixture?.workspaceRoot ??
      temporaryWorkspaceRoot!;
    const homeDirectoryOwned = options.homeDirectory === undefined;
    const homeDirectory =
      options.homeDirectory ?? mkdtempSync(join(tmpdir(), 'drive-home-'));
    mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
    const statusPath = join(homeDirectory, 'status.json');
    const driver = new PtyTestDriver.Class({
      workspaceRoot,
      // A DRIVE session models a real user, and real users run big terminals
      // (the reference screen this was tuned on is 295x65). The smoke suite
      // keeps its own calibrated 120x40 through PtyTestDriver directly.
      columns: options.columns ?? 220,
      rows: options.rows ?? 60,
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
      if (scaleFixture !== null) {
        await HarnessSmoke.Class.openFileThroughQuickOpen(
          driver,
          statusPath,
          scaleFixture.filePath,
        );
      }
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
      if (homeDirectoryOwned) {
        await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
      }
      if (scaleFixture !== null) {
        await HarnessSmoke.Class.removeTemporaryDirectory(
          scaleFixture.workspaceRoot,
        );
      } else if (temporaryWorkspaceRoot !== null) {
        await HarnessSmoke.Class.removeTemporaryDirectory(
          temporaryWorkspaceRoot,
        );
      }
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

  /** One server PER CHECKOUT by default: the rendezvous dir is keyed to the
   *  git toplevel of the cwd (or the cwd itself outside git), so agents in
   *  different worktrees each get their own server and their attaches find
   *  the right one automatically — a shared singleton would make two agents
   *  fight over one app. --server-dir overrides for deliberate sharing. */
  protected static get defaultServerDirectory(): string {
    let probe = process.cwd();
    for (;;) {
      try {
        if (
          statSync(join(probe, '.git')).isDirectory() ||
          statSync(join(probe, '.git')).isFile()
        )
          break;
      } catch {
        /* keep walking */
      }
      const parent = join(probe, '..');
      if (resolve(parent) === resolve(probe)) {
        probe = process.cwd();
        break;
      }
      probe = resolve(parent);
    }
    const slug = resolve(probe)
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `/tmp/invar-drive-server-${slug}`;
  }

  static async serve(options: {
    workspaceRoot?: string;
    fixtureSize?: number;
    columns?: number;
    rows?: number;
    homeDirectory?: string;
    serverDirectory?: string;
    mirror?: boolean;
  }): Promise<void> {
    if (
      options.workspaceRoot !== undefined &&
      options.fixtureSize !== undefined
    ) {
      throw new Error(
        'DriveSession workspace and fixture size are mutually exclusive',
      );
    }
    const serverDirectory =
      options.serverDirectory ?? this.defaultServerDirectory;
    mkdirSync(serverDirectory, { recursive: true });
    if (options.mirror) {
      // THE MIRROR OWNS STDOUT EXCLUSIVELY. Any server log written there
      // lands at the inner app's live cursor position and clobbers cells —
      // and since the app repaints only damage IT knows about, the clobbered
      // cells stay wrong forever (this blanked the activity bar in the first
      // live session: the boot-time ready line scribbled over it). All server
      // chatter goes to server.log in the rendezvous dir instead.
      const serverLogPath = join(serverDirectory, 'server.log');
      const logToFile = (...parts: unknown[]) => {
        try {
          appendFileSync(
            serverLogPath,
            `${parts.map((part) => String(part)).join(' ')}\n`,
          );
        } catch {
          /* logging must never break serving */
        }
      };
      console.log = logToFile;
      console.error = logToFile;
    }
    // A mirrored server has a human WATCHING — they almost certainly mean the
    // project they are standing in, not an empty scratch dir. Headless serves
    // keep the isolated temp workspace.
    const scaleFixture =
      options.fixtureSize === undefined
        ? null
        : await HarnessSmoke.Class.createDriveScaleFixture(options.fixtureSize);
    const temporaryWorkspaceRoot =
      options.workspaceRoot === undefined &&
      scaleFixture === null &&
      !options.mirror
        ? this.temporaryWorkspaceRoot()
        : null;
    const workspaceRoot =
      options.workspaceRoot ??
      scaleFixture?.workspaceRoot ??
      (options.mirror ? process.cwd() : temporaryWorkspaceRoot!);
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
    const requestPath = join(serverDirectory, 'snippet-request.json');
    const responsePath = join(serverDirectory, 'snippet-response.json');
    const manifestPath = join(serverDirectory, 'server.json');
    let reloadCount = 0;

    /** ONE boot of the inner app — used at startup and by every `--reload`.
     *  A reload means "start fresh": a new scratch home (unless the caller
     *  pinned --home, which means state persistence BY CHOICE), settings
     *  re-seeded by copy, a new app process, manifest rewritten. The server
     *  and its rendezvous files stay put, so attaches never re-target. */
    const bootInnerApp = async (
      manifestReloadCount: number,
    ): Promise<{
      driver: PtyTestDriver.Model;
      session: DriveSession.Model;
      statusPath: string;
      homeDirectory: string;
      homeDirectoryOwned: boolean;
    }> => {
      const homeDirectoryOwned = options.homeDirectory === undefined;
      const homeDirectory =
        options.homeDirectory ?? mkdtempSync(join(tmpdir(), 'drive-home-'));
      mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
      if (options.mirror && !options.homeDirectory) {
        // The watching human compares the mirrored app against the Invar they
        // use daily, which runs on THEIR settings (glyph tier, theme). A
        // scratch home with defaults renders a different app and reads as
        // "malformed". Seed by COPY, never by sharing: the inner app's writes
        // stay in the sandbox and the real config stays untouchable (the #465
        // damaged-config incident is why this is a hard line).
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
      // Each candidate needs its own readiness signal. A pinned --home keeps
      // the prior status file, so reusing status.json would let stale ready
      // state certify a replacement that has not booted yet.
      const statusPath = join(
        homeDirectory,
        `status-${crypto.randomUUID()}.json`,
      );
      let driver: PtyTestDriver.Model | null = null;
      try {
        driver = new PtyTestDriver.Class({
          workspaceRoot,
          columns: options.columns ?? hostColumns ?? 220,
          rows: options.rows ?? hostRows ?? 60,
          homeDirectory,
          // Mirroring: negotiate as the LEAST capable link in the chain. The
          // emulator swallows OSC 66 whole, so the inner app's text-sizing probe
          // fails and it emits plain glyphs the watching terminal can draw
          // (a wrapped glyph on a terminal without the protocol is DELETED whole
          // — the invisible activity-bar-icons defect).
          textSizingSupported: !options.mirror,
          environment: {
            ...hostIdentity,
            TUI_STATUS_PATH: statusPath,
            INVAR_AGENT_BACKEND: 'echo',
            // The watcher needs to SEE the agent's hand: pointer cell, fading
            // wake, click rings. Override with TUI_POINTER_TRAIL=0.
            ...(options.mirror
              ? { TUI_POINTER_TRAIL: process.env.TUI_POINTER_TRAIL ?? '1' }
              : {}),
          },
        });
        if (options.mirror) {
          // The WATCH feed: every byte the app writes, relayed verbatim. The
          // human sees exactly what the agent's gestures cause, live — dropdowns
          // opening, state changing — because this IS the app's own output, not
          // a reconstruction.
          driver.tapOutput((bytes) => process.stdout.write(bytes));
        }
        const session = new DriveSession.Class(driver, statusPath);
        await HarnessSmoke.Class.awaitStatus(
          driver,
          statusPath,
          'the served app publishes its first status',
          (candidate) => candidate.width !== undefined,
        );
        if (scaleFixture !== null) {
          await HarnessSmoke.Class.openFileThroughQuickOpen(
            driver,
            statusPath,
            scaleFixture.filePath,
          );
        }
        writeFileSync(
          manifestPath,
          JSON.stringify(
            {
              pid: process.pid,
              statusPath,
              workspaceRoot,
              homeDirectory,
              startedAtMs: Date.now(),
              reloadCount: manifestReloadCount,
            },
            null,
            2,
          ),
        );
        return {
          driver,
          session,
          statusPath,
          homeDirectory,
          homeDirectoryOwned,
        };
      } catch (thrown) {
        await driver?.dispose().catch(() => undefined);
        if (homeDirectoryOwned) {
          await HarnessSmoke.Class.removeTemporaryDirectory(
            homeDirectory,
          ).catch(() => undefined);
        }
        throw thrown;
      }
    };

    if (options.mirror && process.stdin.isTTY) {
      // The mirrored enable-sequences make the HOSTING terminal start
      // reporting its own mouse and answering the inner app's capability
      // queries — into OUR stdin. Cooked mode would ECHO all of that as
      // gibberish (the `35;66;…` class), so: raw mode, swallow everything,
      // keep only Ctrl+C (0x03 arrives as a byte in raw mode) as the local
      // "stop watching" gesture. Watch-only is the v1 contract — the human's
      // input deliberately does NOT reach the inner app.
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.on('data', (bytes: Buffer) => {
        if (bytes.includes(0x03)) {
          this.writeServerFile(join(serverDirectory, 'snippet-request.json'), {
            id: Date.now(),
            stop: true,
          });
        }
      });
    }
    // A stale request from a PREVIOUS server session must never replay into
    // this one — the last one standing is usually {stop:true}, which would
    // stop a fresh server the instant it boots. Anything already on disk at
    // startup is by definition not addressed to this server.
    const staleRequest = this.readServerFile(requestPath);
    let lastServicedId =
      staleRequest && typeof staleRequest.id === 'number' ? staleRequest.id : 0;
    let active = await bootInnerApp(reloadCount);
    let resizeTargetDriver: PtyTestDriver.Model | null = active.driver;
    const forwardHostingTerminalResize = () => {
      if (!options.mirror || resizeTargetDriver === null) return;
      const columns = process.stdout.columns;
      const rows = process.stdout.rows;
      if (
        columns === undefined ||
        rows === undefined ||
        columns < 1 ||
        rows < 1
      ) {
        return;
      }
      const currentScreen = resizeTargetDriver.snapshot();
      if (currentScreen.columns === columns && currentScreen.rows === rows) {
        return;
      }
      resizeTargetDriver.resize(columns, rows);
    };
    if (options.mirror) process.on('SIGWINCH', forwardHostingTerminalResize);
    try {
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
          if (request.reload === true) {
            // START FRESH: ready the replacement before releasing the current
            // app. A failed boot therefore leaves the current session live.
            try {
              const nextReloadCount = reloadCount + 1;
              const previous = active;
              const replacement = await bootInnerApp(nextReloadCount);
              active = replacement;
              reloadCount = nextReloadCount;
              resizeTargetDriver = replacement.driver;
              await previous.driver.dispose();
              if (previous.homeDirectoryOwned) {
                await HarnessSmoke.Class.removeTemporaryDirectory(
                  previous.homeDirectory,
                );
              }
              this.writeServerFile(responsePath, {
                id: request.id,
                ok: true,
                output: `drive-server: reloaded (fresh app #${reloadCount})`,
              });
            } catch (thrown) {
              this.writeServerFile(responsePath, {
                id: request.id,
                ok: false,
                error:
                  thrown instanceof Error ? thrown.message : String(thrown),
              });
            }
            continue;
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
            // A MIRRORED server has a human watching, so every snippet
            // starts at human pace BY DEFAULT — an agent cannot forget what
            // it never has to remember. A snippet that genuinely wants
            // machine speed opts out explicitly with app.humanPace(0).
            if (options.mirror) active.session.humanPace();
            await snippet(active.session, active.driver);
            await active.session.flush();
            this.writeServerFile(responsePath, {
              id: request.id,
              ok: true,
              output: captured.join('\n'),
            });
          } catch (thrown) {
            // The server SURVIVES a bad snippet: abandon the queued steps the
            // snippet left behind, answer with the error, keep serving.
            active.session.abandonQueue();
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
      resizeTargetDriver = null;
      if (options.mirror) {
        process.off('SIGWINCH', forwardHostingTerminalResize);
      }
      try {
        rmSync(manifestPath, { force: true });
      } catch {
        /* the manifest is advisory; a stale one is caught by the pid check */
      }
      await active.driver.dispose();
      if (active.homeDirectoryOwned) {
        await HarnessSmoke.Class.removeTemporaryDirectory(active.homeDirectory);
      }
      if (scaleFixture !== null) {
        await HarnessSmoke.Class.removeTemporaryDirectory(
          scaleFixture.workspaceRoot,
        );
      } else if (temporaryWorkspaceRoot !== null) {
        await HarnessSmoke.Class.removeTemporaryDirectory(
          temporaryWorkspaceRoot,
        );
      }
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
    reload?: boolean;
    timeoutMilliseconds?: number;
  }): Promise<string> {
    const serverDirectory =
      options.serverDirectory ?? this.defaultServerDirectory;
    const manifest = this.serverManifest(serverDirectory);
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
      ...(options.stop === true
        ? { stop: true }
        : options.reload === true
          ? { reload: true }
          : { source: options.source }),
    });
    const deadline = Date.now() + (options.timeoutMilliseconds ?? 60_000);
    while (Date.now() < deadline) {
      const response = this.readServerFile(responsePath);
      if (response && response.id === id) {
        const output =
          typeof response.output === 'string' ? response.output : '';
        if (response.ok !== true) {
          throw new Error(
            `attach: snippet failed: ${String(response.error)}` +
              `${output === '' ? '' : `\n${output}`}`,
          );
        }
        return output;
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error(
      'the drive server never answered — it may be mid-snippet; ' +
        'retry, or check its terminal',
    );
  }

  /** Read the checkout-keyed server manifest without opening a second
   *  rendezvous protocol. MCP graph tools use its status path directly. */
  static serverManifest(
    serverDirectory?: string,
  ): Record<string, unknown> | null {
    return this.readServerFile(
      join(serverDirectory ?? this.defaultServerDirectory, 'server.json'),
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
    let fixtureSize: number | undefined;
    let source: string | undefined;
    let columns = 220;
    let rows = 60;
    let columnsExplicit = false;
    let homeDirectory: string | undefined;
    let serverDirectory: string | undefined;
    let serve = false;
    let mirror = false;
    let attachSource: string | undefined;
    let stop = false;
    let reload = false;
    for (let index = 0; index < argumentsList.length; index += 1) {
      const argument = argumentsList[index];
      const value = argumentsList[index + 1] ?? '';
      if (argument === '--open') {
        workspaceRoot = resolve(value);
        index += 1;
      } else if (argument === '--size') {
        fixtureSize = Number(value);
        if (!Number.isSafeInteger(fixtureSize) || fixtureSize < 1) {
          throw new Error(`--size must be a positive integer, got ${value}`);
        }
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
      } else if (argument === '--reload') {
        reload = true;
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
    if (workspaceRoot !== undefined && fixtureSize !== undefined) {
      throw new Error('--open and --size are mutually exclusive');
    }
    if (serve) {
      await this.serve({
        workspaceRoot,
        fixtureSize,
        columns: columnsExplicit ? columns : undefined,
        rows: columnsExplicit ? rows : undefined,
        homeDirectory,
        serverDirectory,
        mirror,
      });
      return;
    }
    if (stop || reload || attachSource !== undefined) {
      const output = await this.attach({
        source: attachSource ?? '',
        serverDirectory,
        stop,
        reload,
      });
      if (output !== '') console.log(output);
      return;
    }
    if (!source) {
      console.error(this.helpText);
      process.exitCode = 2;
      return;
    }
    await this.run({
      workspaceRoot,
      fixtureSize,
      source,
      columns,
      rows,
      homeDirectory,
    });
  }

  protected static get helpText(): string {
    return [
      'Usage: bun scripts/harness/DriveSession.ts [options]',
      '',
      '  --open DIR           workspace to open (default: a temp workspace)',
      '  --size LINE_COUNT    generate and open a temporary scale fixture',
      '  --script FILE        a snippet: NO imports, NO setup. `app` is live.',
      '  --eval CODE          the same, inline',
      '  --geometry CxR       terminal size (default 220x60, a real user scale)',
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
      '  --reload             start a FRESH app (new scratch home) on the same server',
      '  --stop               shut the server down',
      '  --server-dir DIR     rendezvous dir (default: keyed to this checkout,',
      '                       so each worktree gets its own server)',
      '',
      'The snippet gets `app` (fluent, awaitable) and `driver` (the raw PTY).',
      'Example snippet:',
      '',
      "  app.key('Control+j').waitForStatus('panelVisible', true)",
      "     .clickText('+ Plugin').waitForRepaint()",
      "     .show('panelContentLabels')",
      "  app.show('after panel open', ['panelVisible', 'frame'])",
      '',
      'Watched sessions: app.humanPace() makes every gesture eye-speed —',
      'the pointer glides, clicks dwell, typing lands per character.',
      '',
      'Live graph access (any app state, no publish tax):',
      '',
      "  await app.get('panelHost.panelListWidth')      // ask now",
      "  app.waitFor('panelHost.visible', true)         // condition, frame-settled",
      "  await app.set('panelHost.panelListWidth', 30)  // EXPERIMENT only — never verification",
      '',
      'Status projection versus graph:',
      '',
      "  app.waitForStatus('renderQuiescent', true)     // published status-only field",
      "  app.show('renderQuiescent')                    // read the atomic status projection",
      "  app.waitFor('panelHost.visible', true)         // live graph, frame-settled condition",
      "  await app.get('panelHost.visible')              // live graph, ask now",
      '',
      'The warm server is the only entry point (the one-shot Drive.ts was',
      'removed 2026-08-03). Stop with `bun scripts/harness/DriveSession.ts --stop`.',

      '',
    ].join('\n');
  }
}

export namespace DriveScriptRunner {
  export const $Class = Static($DriveScriptRunner);
  export let Class = $Class;
}

if (import.meta.main) {
  try {
    await DriveScriptRunner.Class.main(process.argv.slice(2));
  } catch (thrown) {
    console.error(thrown instanceof Error ? thrown.message : String(thrown));
    process.exitCode = 1;
  }
}
