// The VT emulator: a thin wrapper over @xterm/headless (proven under Bun). It parses the raw ANSI
// byte stream into a rows×cols cell buffer and knows NOTHING about the backend — bytes arrive via
// write(), the emulator's own replies (device-attribute/cursor acks) surface via onReply, and every
// parsed write pulse fires onCellsChanged (the render-coalescing signal). A hand-rolled parser would
// have to re-implement scrollback/wrap/alt-screen, so the library is the honest choice.
//
import { Terminal, type IBufferCell } from '@xterm/headless';

// invariant: The emulator is the single source of terminal screen state (src/modules/terminal/terminal.invariants.md)
// invariant: Terminal emulator behavior is specified by byte fixtures (src/modules/terminal/terminal.invariants.md)

class $TerminalEmulator {
  protected readonly terminal: Terminal;
  protected readonly reusableCell: { cell: IBufferCell | undefined } = { cell: undefined };
  protected replyCallback: ((data: string) => void) | null = null;
  protected readonly cellsChangedCallbacks = new Set<() => void>();
  protected metadataChangedCallback: (() => void) | null = null;
  protected readonly lineFeedCallbacks = new Set<(event: TerminalLineFeedEvent) => void>();
  protected readonly shellIntegrationCallbacks = new Set<
    (event: TerminalShellIntegrationEvent) => void
  >();
  protected terminalTitle = '';
  protected terminalCurrentWorkingDirectory = '';
  protected isSgrMouseEncodingEnabledValue = false;
  protected hasShellPromptMarkerValue = false;
  protected isShellPromptActiveValue = false;
  protected lastShellIntegrationEventValue: TerminalShellIntegrationEvent | null = null;

  constructor(columns: number, rows: number) {
    this.terminal = new Terminal({
      cols: Math.max(1, columns),
      rows: Math.max(1, rows),
      allowProposedApi: true,
      scrollback: 1000,
    });
    this.terminal.onData((data) => this.replyCallback?.(data));
    this.terminal.onWriteParsed(() => this.notifyCallbacks(this.cellsChangedCallbacks));
    this.terminal.onLineFeed(() => this.observeLineFeed());
    this.terminal.onTitleChange((title) => this.observeTitle(title));
    this.terminal.parser.registerOscHandler(
      7,
      (currentWorkingDirectory) => this.observeCurrentWorkingDirectory(currentWorkingDirectory),
    );
    this.terminal.parser.registerOscHandler(
      133,
      (marker) => this.observeShellIntegrationMarker(marker),
    );
    this.terminal.parser.registerCsiHandler(
      { prefix: '?', final: 'h' },
      (parameters) => this.observePrivateModeChange(parameters, true),
    );
    this.terminal.parser.registerCsiHandler(
      { prefix: '?', final: 'l' },
      (parameters) => this.observePrivateModeChange(parameters, false),
    );
  }

  /** Feed child bytes into the parser. onCellsChanged fires once per parsed pulse (coalescing). */
  write(bytes: Uint8Array | string): void {
    this.terminal.write(bytes as never);
  }

  /** Resolve once all pending writes have been parsed (xterm parses asynchronously). Used by tests
   *  for a deterministic read; production reads flow through onCellsChanged → the frame effect. */
  flush(): Promise<void> {
    return new Promise((resolve) => this.terminal.write('', () => resolve()));
  }

  /** The emulator's OWN replies (cursor/device-attribute reports) that must return to the child. */
  onReply(callback: (data: string) => void): void {
    this.replyCallback = callback;
  }

  /** A parsed-write pulse landed — the cell buffer changed; the owner requests exactly one frame. */
  onCellsChanged(callback: () => void): () => void {
    this.cellsChangedCallbacks.add(callback);
    return () => this.cellsChangedCallbacks.delete(callback);
  }

  onMetadataChanged(callback: () => void): void {
    this.metadataChangedCallback = callback;
  }

  onLineFeed(callback: (event: TerminalLineFeedEvent) => void): () => void {
    this.lineFeedCallbacks.add(callback);
    return () => this.lineFeedCallbacks.delete(callback);
  }

  onShellIntegrationEvent(
    callback: (event: TerminalShellIntegrationEvent) => void,
  ): () => void {
    this.shellIntegrationCallbacks.add(callback);
    return () => this.shellIntegrationCallbacks.delete(callback);
  }

  resize(columns: number, rows: number): void {
    this.terminal.resize(Math.max(1, columns), Math.max(1, rows));
  }

  get columns(): number {
    return this.terminal.cols;
  }

  get rows(): number {
    return this.terminal.rows;
  }

  get cursorColumn(): number {
    return this.terminal.buffer.active.cursorX;
  }

  get cursorRow(): number {
    return this.terminal.buffer.active.cursorY;
  }

  get title(): string {
    return this.terminalTitle;
  }

  get currentWorkingDirectory(): string {
    return this.terminalCurrentWorkingDirectory;
  }

  get hasShellIntegrationMarkers(): boolean {
    return this.hasShellPromptMarkerValue;
  }

  get lastShellIntegrationEvent(): TerminalShellIntegrationEvent | null {
    return this.lastShellIntegrationEventValue;
  }

  get isPromptIdle(): boolean {
    const inputLine = this.currentPromptInputLine();
    if (this.hasShellPromptMarkerValue) {
      return this.isShellPromptActiveValue && inputLine === '';
    }
    return inputLine === '';
  }

  currentPromptInputLine(): string | null {
    const active = this.terminal.buffer.active;
    const lineText = this.logicalLineText(active.baseY + active.cursorY).text;
    const promptIndex = lineText.lastIndexOf('$ ');
    if (promptIndex < 0) return null;
    return lineText.slice(promptIndex + 2).replace(/\s+$/, '');
  }

  visibleLineText(row: number): string {
    const active = this.terminal.buffer.active;
    return active.getLine(active.baseY + row)?.translateToString(true) ?? '';
  }

  recentTextLines(maximumLineCount?: number): readonly string[] {
    return this.scrollbackText(
      maximumLineCount === undefined ? {} : { lineCount: maximumLineCount },
    ).lines;
  }

  scrollbackText(request: TerminalScrollbackRequest = {}): TerminalScrollbackSnapshot {
    const active = this.terminal.buffer.active;
    const terminalEmulatorClass = this.constructor as typeof $TerminalEmulator;
    const totalLines = active.length;
    let firstLineIndex: number;
    let endLineIndex: number;
    if (request.range) {
      firstLineIndex = Math.max(
        0,
        Math.min(totalLines, Math.floor(request.range.startLine) - 1),
      );
      endLineIndex = Math.max(
        firstLineIndex,
        Math.min(totalLines, Math.floor(request.range.endLine)),
      );
    } else {
      const requestedLineCount = request.lineCount
        ?? terminalEmulatorClass.defaultScrollbackLineCount;
      const safeLineCount = Number.isFinite(requestedLineCount)
        ? Math.max(0, Math.floor(requestedLineCount))
        : terminalEmulatorClass.defaultScrollbackLineCount;
      firstLineIndex = Math.max(0, totalLines - safeLineCount);
      endLineIndex = totalLines;
    }
    const lines: string[] = [];
    for (
      let lineIndex = firstLineIndex;
      lineIndex < endLineIndex;
      lineIndex += 1
    ) {
      lines.push(active.getLine(lineIndex)?.translateToString(true) ?? '');
    }
    return {
      lines,
      totalLines,
      startLine: lines.length > 0 ? firstLineIndex + 1 : 0,
      endLine: lines.length > 0 ? endLineIndex : 0,
    };
  }

  markPromptSubmitted(): void {
    this.isShellPromptActiveValue = false;
  }

  get isBracketedPasteEnabled(): boolean {
    return this.terminal.modes.bracketedPasteMode;
  }

  get mouseTrackingMode(): 'none' | 'x10' | 'vt200' | 'drag' | 'any' {
    return this.terminal.modes.mouseTrackingMode;
  }

  get isSgrMouseEncodingEnabled(): boolean {
    return this.isSgrMouseEncodingEnabledValue;
  }

  get isOriginModeEnabled(): boolean {
    return this.terminal.modes.originMode;
  }

  get isSynchronizedOutputEnabled(): boolean {
    return this.terminal.modes.synchronizedOutputMode;
  }

  get isAlternateScreenActive(): boolean {
    return this.terminal.buffer.active.type === 'alternate';
  }

  /** Pull one visible cell (viewport row/column) into a flat struct. Reuses a single xterm cell
   *  object across the pull to stay allocation-free per cell — the flyweight viewport-pull.
   *
   *  `row` is VIEWPORT-relative (0 = top visible line). xterm's getLine() indexes the WHOLE buffer
   *  including scrollback, so we add `baseY` (the absolute line of the viewport top when scrolled to
   *  the bottom — the live state, since no scrollback-scroll UI exists yet). This is the same origin
   *  `cursorY` is measured against, so cells and cursor stay aligned. Without the offset, once any
   *  content scrolls into scrollback (baseY > 0 — e.g. after a full-screen alt-screen app like an
   *  editor or Claude Code exits) the pull would read the TOP OF SCROLLBACK: stale artifacts on
   *  screen while live output + the cursor sit below the rendered window (typing appears to vanish). */
  cell(row: number, column: number): TerminalCell | null {
    const active = this.terminal.buffer.active;
    const line = active.getLine(active.baseY + row);
    if (!line) return null;
    const cell = line.getCell(column, this.reusableCell.cell);
    if (!cell) return null;
    this.reusableCell.cell = cell;
    return {
      characters: cell.getChars() || ' ',
      foreground: cell.getFgColor(),
      background: cell.getBgColor(),
      isForegroundDefault: cell.isFgDefault(),
      isForegroundRgb: Boolean(cell.isFgRGB()),
      isForegroundPalette: Boolean(cell.isFgPalette()),
      isBackgroundDefault: cell.isBgDefault(),
      isBackgroundRgb: Boolean(cell.isBgRGB()),
      isBackgroundPalette: Boolean(cell.isBgPalette()),
      isBold: Boolean(cell.isBold()),
      isDim: Boolean(cell.isDim()),
      isItalic: Boolean(cell.isItalic()),
      isUnderline: Boolean(cell.isUnderline()),
      isBlink: Boolean(cell.isBlink()),
      isInverse: Boolean(cell.isInverse()),
      isInvisible: Boolean(cell.isInvisible()),
      isStrikethrough: Boolean(cell.isStrikethrough()),
      isOverline: Boolean(cell.isOverline()),
      width: cell.getWidth(),
    };
  }

  protected observePrivateModeChange(
    parameters: Array<number | number[]>,
    isEnabled: boolean,
  ): false {
    if (parameters.some((parameter) => parameter === 1006)) {
      this.isSgrMouseEncodingEnabledValue = isEnabled;
    }
    return false;
  }

  protected static get defaultScrollbackLineCount(): number {
    return 40;
  }

  protected observeTitle(title: string): void {
    this.terminalTitle = title;
    this.metadataChangedCallback?.();
  }

  protected observeCurrentWorkingDirectory(currentWorkingDirectory: string): false {
    this.terminalCurrentWorkingDirectory = currentWorkingDirectory;
    this.metadataChangedCallback?.();
    return false;
  }

  protected observeShellIntegrationMarker(marker: string): false {
    const markerParts = marker.split(';');
    const markerCode = markerParts[0];
    const kind = this.shellIntegrationKind(markerCode);
    if (!kind) return false;
    const semanticMarker = markerCode as TerminalShellIntegrationEvent['marker'];
    this.hasShellPromptMarkerValue = true;
    if (markerCode === 'A') this.isShellPromptActiveValue = true;
    if (markerCode === 'C' || markerCode === 'D') this.isShellPromptActiveValue = false;
    const event: TerminalShellIntegrationEvent = {
      kind,
      marker: semanticMarker,
      exitCode: markerCode === 'D' ? this.parseExitCode(markerParts[1]) : null,
      command: markerCode === 'C' ? this.recentPromptInputLine() : null,
      currentWorkingDirectory: this.terminalCurrentWorkingDirectory,
      currentLine: this.activeLineText(),
      cursorColumn: this.terminal.buffer.active.cursorX,
    };
    this.lastShellIntegrationEventValue = event;
    this.notifyCallbacks(this.shellIntegrationCallbacks, event);
    this.metadataChangedCallback?.();
    return false;
  }

  protected shellIntegrationKind(
    markerCode: string | undefined,
  ): TerminalShellIntegrationEventKind | null {
    if (markerCode === 'A') return 'prompt-start';
    if (markerCode === 'B') return 'command-start';
    if (markerCode === 'C') return 'output-start';
    if (markerCode === 'D') return 'command-end';
    return null;
  }

  protected parseExitCode(exitCodeText: string | undefined): number | null {
    if (!exitCodeText || !/^-?\d+$/.test(exitCodeText)) return null;
    const exitCode = Number.parseInt(exitCodeText, 10);
    return Number.isSafeInteger(exitCode) ? exitCode : null;
  }

  protected recentPromptInputLine(): string | null {
    const active = this.terminal.buffer.active;
    const cursorLineIndex = active.baseY + active.cursorY;
    for (
      let lineIndex = cursorLineIndex;
      lineIndex >= Math.max(0, cursorLineIndex - 1);
      lineIndex -= 1
    ) {
      const lineText = this.logicalLineText(lineIndex).text;
      const promptIndex = lineText.lastIndexOf('$ ');
      if (promptIndex >= 0) {
        return lineText.slice(promptIndex + 2).replace(/\s+$/, '');
      }
    }
    return null;
  }

  protected activeLineText(): string {
    const active = this.terminal.buffer.active;
    return active.getLine(active.baseY + active.cursorY)?.translateToString(true) ?? '';
  }

  protected observeLineFeed(): void {
    const active = this.terminal.buffer.active;
    const completedLineIndex = active.baseY + active.cursorY - 1;
    const completedLine = this.logicalLineText(completedLineIndex);
    const event: TerminalLineFeedEvent = {
      line: completedLine.text,
      isWrapped: completedLine.isWrapped,
    };
    this.notifyCallbacks(this.lineFeedCallbacks, event);
  }

  protected logicalLineText(endingLineIndex: number): TerminalLogicalLine {
    const active = this.terminal.buffer.active;
    let firstLineIndex = endingLineIndex;
    while (firstLineIndex > 0 && active.getLine(firstLineIndex)?.isWrapped) {
      firstLineIndex -= 1;
    }
    const lineSegments: string[] = [];
    for (let lineIndex = firstLineIndex; lineIndex <= endingLineIndex; lineIndex += 1) {
      lineSegments.push(active.getLine(lineIndex)?.translateToString(true) ?? '');
    }
    return {
      text: lineSegments.join(''),
      isWrapped: firstLineIndex !== endingLineIndex,
    };
  }

  protected notifyCallbacks<Event>(
    callbacks: ReadonlySet<(event: Event) => void>,
    event: Event,
  ): void;
  protected notifyCallbacks(callbacks: ReadonlySet<() => void>): void;
  protected notifyCallbacks<Event>(
    callbacks: ReadonlySet<((event: Event) => void) | (() => void)>,
    event?: Event,
  ): void {
    for (const callback of callbacks) {
      try {
        callback(event as Event);
      } catch {
        // Parsed-stream observers are one-way taps: an observer cannot break terminal parsing.
      }
    }
  }

  dispose(): void {
    this.terminal.dispose();
  }
}

export namespace TerminalEmulator {
  export const $Class = $TerminalEmulator;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

/** One cell, flattened to what a cell-grid renderer needs — no xterm types leak past this seam. */
export interface TerminalCell {
  characters: string;
  foreground: number;
  background: number;
  isForegroundDefault: boolean;
  isForegroundRgb: boolean;
  isForegroundPalette: boolean;
  isBackgroundDefault: boolean;
  isBackgroundRgb: boolean;
  isBackgroundPalette: boolean;
  isBold: boolean;
  isDim: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isBlink: boolean;
  isInverse: boolean;
  isInvisible: boolean;
  isStrikethrough: boolean;
  isOverline: boolean;
  width: number;
}

export interface TerminalScrollbackRequest {
  readonly lineCount?: number;
  readonly range?: {
    readonly startLine: number;
    readonly endLine: number;
  };
}

export interface TerminalScrollbackSnapshot {
  readonly lines: readonly string[];
  readonly totalLines: number;
  readonly startLine: number;
  readonly endLine: number;
}

export type TerminalShellIntegrationEventKind =
  | 'prompt-start'
  | 'command-start'
  | 'output-start'
  | 'command-end';

export interface TerminalShellIntegrationEvent {
  kind: TerminalShellIntegrationEventKind;
  marker: 'A' | 'B' | 'C' | 'D';
  exitCode: number | null;
  command: string | null;
  currentWorkingDirectory: string;
  currentLine: string;
  cursorColumn: number;
}

export interface TerminalLineFeedEvent {
  line: string;
  isWrapped: boolean;
}

interface TerminalLogicalLine {
  text: string;
  isWrapped: boolean;
}
