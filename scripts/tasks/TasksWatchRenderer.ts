// invariant: Child synchronized updates commit as one repaint (src/modules/terminal/terminal.invariants.md)
import { Static } from 'ivue/extras';

export const TASKS_WATCH_ANIMATION_FRAMES_PER_SECOND = 60;

class $TasksWatchRenderer {
  protected static get $graphemeSegmenter(): Intl.Segmenter {
    return new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  }

  protected static get targetAnimationFramesPerSecond(): number {
    return TASKS_WATCH_ANIMATION_FRAMES_PER_SECOND;
  }

  protected static get animationFrameMilliseconds(): number {
    return 1_000 / this.targetAnimationFramesPerSecond;
  }

  protected previousLines: string[] = [];
  protected animationRowsForFrame: TasksWatchAnimationRowsForFrame | null =
    null;
  protected animationTimer: ReturnType<typeof setTimeout> | null = null;
  protected animationEpochMilliseconds: number;
  protected animationFrameValue = 0;
  protected readonly writeOutput: (output: string) => void;
  protected readonly nowMilliseconds: () => number;
  protected readonly terminalColumns: () => number;
  protected readonly refreshTerminalColumnsOnResize: (() => void) | null;
  protected readonly scheduleTimer: TasksWatchScheduleTimer;
  protected readonly cancelTimer: TasksWatchCancelTimer;

  constructor(options: TasksWatchRendererOptions = {}) {
    this.writeOutput =
      options.writeOutput ??
      ((output: string): void => {
        process.stdout.write(output);
      });
    this.nowMilliseconds = options.nowMilliseconds ?? (() => performance.now());
    if (options.terminalColumns !== undefined) {
      this.terminalColumns = options.terminalColumns;
      this.refreshTerminalColumnsOnResize = null;
    } else {
      const tasksWatchRendererClass = this
        .constructor as typeof $TasksWatchRenderer;
      let detectedTerminalColumns =
        tasksWatchRendererClass.detectTerminalColumns();
      this.terminalColumns = () => {
        const reportedTerminalColumns = process.stdout.columns;
        return typeof reportedTerminalColumns === 'number' &&
          reportedTerminalColumns > 0
          ? reportedTerminalColumns
          : detectedTerminalColumns;
      };
      this.refreshTerminalColumnsOnResize = () => {
        detectedTerminalColumns =
          tasksWatchRendererClass.detectTerminalColumns();
      };
      if (process.stdout.isTTY === true) {
        process.on('SIGWINCH', this.refreshTerminalColumnsOnResize);
      }
    }
    this.scheduleTimer =
      options.scheduleTimer ??
      ((callback, delayMilliseconds) =>
        setTimeout(callback, delayMilliseconds));
    this.cancelTimer = options.cancelTimer ?? ((timer) => clearTimeout(timer));
    this.animationEpochMilliseconds = this.nowMilliseconds();
  }

  get animationFrame(): number {
    return this.animationFrameValue;
  }

  /**
   * How long the animation has run, in milliseconds, at the frame now on screen.
   * This — not the frame ordinal — is what the animated rows are drawn from, so
   * a change of paint rate changes the SMOOTHNESS of the motion and never its
   * SPEED (#348).
   */
  get animationElapsedMilliseconds(): number {
    const tasksWatchRendererClass = this
      .constructor as typeof $TasksWatchRenderer;
    return tasksWatchRendererClass.animationElapsedMillisecondsAtFrame(
      this.animationFrameValue,
    );
  }

  static frame(
    previousLines: readonly string[],
    currentLines: readonly string[],
    enterAlternateScreen: boolean,
  ): string {
    const changedRows: TasksWatchAnimationRow[] = [];
    const rowCount = Math.max(previousLines.length, currentLines.length);
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const previousLine = previousLines[rowIndex] ?? '';
      const currentLine = currentLines[rowIndex] ?? '';
      if (previousLine === currentLine) continue;
      changedRows.push({ rowIndex, line: currentLine });
    }
    if (!enterAlternateScreen && changedRows.length === 0) return '';
    const screenSetup = enterAlternateScreen ? '\x1b[?1049h\x1b[?25l' : '';
    return this.synchronizedRows(changedRows, screenSetup);
  }

  static animationFrameOutput(
    previousLines: readonly string[],
    animationRows: readonly TasksWatchAnimationRow[],
  ): string {
    const changedRows = animationRows.filter(
      ({ rowIndex, line }) => previousLines[rowIndex] !== line,
    );
    if (changedRows.length === 0) return '';
    return this.synchronizedRows(changedRows, '');
  }

  static animationFrameAtTime(
    animationEpochMilliseconds: number,
    nowMilliseconds: number,
  ): number {
    return Math.max(
      0,
      Math.floor(
        (nowMilliseconds - animationEpochMilliseconds) /
          this.animationFrameMilliseconds,
      ),
    );
  }

  /**
   * The animation time a frame ordinal stands for. Frames are the SAMPLING of
   * the animation; this converts a sample back to the wall-clock moment it
   * paints, which is the only quantity the row content may depend on.
   */
  static animationElapsedMillisecondsAtFrame(animationFrame: number): number {
    return animationFrame * this.animationFrameMilliseconds;
  }

  protected static detectTerminalColumns(): number {
    const reportedTerminalColumns = process.stdout.columns;
    if (
      typeof reportedTerminalColumns === 'number' &&
      reportedTerminalColumns > 0
    ) {
      return reportedTerminalColumns;
    }
    if (process.stdout.isTTY === true) {
      const terminalSizeResult = Bun.spawnSync(['stty', 'size'], {
        stdin: 'inherit',
        stderr: 'ignore',
      });
      const terminalColumns = Number.parseInt(
        terminalSizeResult.stdout.toString().trim().split(/\s+/)[1] ?? '',
        10,
      );
      if (terminalColumns > 0) return terminalColumns;
    }
    const environmentTerminalColumns = Number.parseInt(
      process.env.COLUMNS ?? '',
      10,
    );
    if (environmentTerminalColumns > 0) return environmentTerminalColumns;
    return Number.POSITIVE_INFINITY;
  }

  // A logical row must stay one physical terminal row. If a long ANSI line
  // autowraps, later row-addressed diffs cannot clear its untracked tail.
  protected static lineWithinColumns(
    terminalLine: string,
    terminalColumnCount: number,
  ): string {
    if (!Number.isFinite(terminalColumnCount)) return terminalLine;
    const terminalColumnLimit = Math.max(0, Math.floor(terminalColumnCount));
    let clippedTerminalLine = '';
    let visibleCellWidth = 0;
    let sourceTextOffset = 0;
    let lineWasClipped = false;
    const appendText = (textFragment: string): void => {
      for (const { segment } of this.$graphemeSegmenter.segment(textFragment)) {
        const segmentWidth = Bun.stringWidth(segment);
        if (visibleCellWidth + segmentWidth > terminalColumnLimit) {
          lineWasClipped = true;
          return;
        }
        visibleCellWidth += segmentWidth;
        clippedTerminalLine += segment;
      }
    };
    for (const escapeSequenceMatch of terminalLine.matchAll(
      /\x1b\[[0-?]*[ -/]*[@-~]/g,
    )) {
      const escapeSequenceStart = escapeSequenceMatch.index;
      appendText(terminalLine.slice(sourceTextOffset, escapeSequenceStart));
      if (lineWasClipped) break;
      clippedTerminalLine += escapeSequenceMatch[0];
      sourceTextOffset = escapeSequenceStart + escapeSequenceMatch[0].length;
    }
    if (!lineWasClipped) appendText(terminalLine.slice(sourceTextOffset));
    return lineWasClipped
      ? `${clippedTerminalLine}\x1b[0m`
      : clippedTerminalLine;
  }

  protected static synchronizedRows(
    changedRows: readonly TasksWatchAnimationRow[],
    screenSetup: string,
  ): string {
    return (
      '\x1b[?2026h' +
      screenSetup +
      '\x1b[H' +
      changedRows
        .map(({ rowIndex, line }) => `\x1b[${rowIndex + 1};1H${line}\x1b[0K`)
        .join('') +
      '\x1b[?2026l'
    );
  }

  static restoreScreen(): string {
    return '\x1b[?2026h\x1b[?25h\x1b[?1049l\x1b[?2026l';
  }

  renderDataFrame(
    currentLines: readonly string[],
    animationRowsForFrame: TasksWatchAnimationRowsForFrame | null,
    enterAlternateScreen: boolean,
  ): void {
    const currentLinesWithinTerminal = currentLines.map((line) =>
      TasksWatchRenderer.Class.lineWithinColumns(line, this.terminalColumns()),
    );
    this.writeFrame(
      TasksWatchRenderer.Class.frame(
        this.previousLines,
        currentLinesWithinTerminal,
        enterAlternateScreen,
      ),
    );
    this.previousLines = currentLinesWithinTerminal;
    this.animationRowsForFrame = animationRowsForFrame;
    if (animationRowsForFrame === null) {
      this.stopAnimationTimer();
      return;
    }
    this.scheduleAnimationTimer();
  }

  dispose(): void {
    this.animationRowsForFrame = null;
    this.stopAnimationTimer();
    if (this.refreshTerminalColumnsOnResize !== null) {
      process.off('SIGWINCH', this.refreshTerminalColumnsOnResize);
    }
  }

  protected writeFrame(output: string): void {
    if (output.length > 0) this.writeOutput(output);
  }

  protected scheduleAnimationTimer(): void {
    if (this.animationRowsForFrame === null || this.animationTimer !== null) {
      return;
    }
    const tasksWatchRendererClass = this
      .constructor as typeof $TasksWatchRenderer;
    const nextFrameDeadlineMilliseconds =
      this.animationEpochMilliseconds +
      (this.animationFrameValue + 1) *
        tasksWatchRendererClass.animationFrameMilliseconds;
    const delayMilliseconds = Math.max(
      1,
      Math.ceil(nextFrameDeadlineMilliseconds - this.nowMilliseconds()),
    );
    this.animationTimer = this.scheduleTimer(
      () => this.onAnimationTimer(),
      delayMilliseconds,
    );
  }

  protected stopAnimationTimer(): void {
    if (this.animationTimer === null) return;
    this.cancelTimer(this.animationTimer);
    this.animationTimer = null;
  }

  protected onAnimationTimer(): void {
    this.animationTimer = null;
    if (this.animationRowsForFrame === null) return;
    const tasksWatchRendererClass = this
      .constructor as typeof $TasksWatchRenderer;
    const dueAnimationFrame = tasksWatchRendererClass.animationFrameAtTime(
      this.animationEpochMilliseconds,
      this.nowMilliseconds(),
    );
    if (dueAnimationFrame > this.animationFrameValue) {
      this.animationFrameValue = dueAnimationFrame;
      const animationRows = this.animationRowsForFrame(
        tasksWatchRendererClass.animationElapsedMillisecondsAtFrame(
          dueAnimationFrame,
        ),
      ).map(({ rowIndex, line }) => ({
        rowIndex,
        line: TasksWatchRenderer.Class.lineWithinColumns(
          line,
          this.terminalColumns(),
        ),
      }));
      this.writeFrame(
        TasksWatchRenderer.Class.animationFrameOutput(
          this.previousLines,
          animationRows,
        ),
      );
      for (const { rowIndex, line } of animationRows) {
        this.previousLines[rowIndex] = line;
      }
    }
    this.scheduleAnimationTimer();
  }
}

export namespace TasksWatchRenderer {
  export const $Class = Static($TasksWatchRenderer);
  export let Class = $Class;
}

export interface TasksWatchAnimationRow {
  readonly rowIndex: number;
  line: string;
}

export interface TasksWatchRendererOptions {
  readonly writeOutput?: (output: string) => void;
  readonly nowMilliseconds?: () => number;
  readonly terminalColumns?: () => number;
  readonly scheduleTimer?: TasksWatchScheduleTimer;
  readonly cancelTimer?: TasksWatchCancelTimer;
}

export type TasksWatchAnimationRowsForFrame = (
  animationElapsedMilliseconds: number,
) => readonly TasksWatchAnimationRow[];

export type TasksWatchScheduleTimer = (
  callback: () => void,
  delayMilliseconds: number,
) => ReturnType<typeof setTimeout>;

export type TasksWatchCancelTimer = (
  timer: ReturnType<typeof setTimeout>,
) => void;
