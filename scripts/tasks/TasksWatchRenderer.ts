// invariant: Child synchronized updates commit as one repaint (src/modules/terminal/terminal.invariants.md)
import { Static } from 'ivue/extras';

class $TasksWatchRenderer {
  protected static get TARGET_ANIMATION_FRAMES_PER_SECOND(): number {
    return 60;
  }

  protected static get animationFrameMilliseconds(): number {
    return 1_000 / this.TARGET_ANIMATION_FRAMES_PER_SECOND;
  }

  protected previousLines: string[] = [];
  protected animationRowsForFrame: TasksWatchAnimationRowsForFrame | null =
    null;
  protected animationTimer: ReturnType<typeof setTimeout> | null = null;
  protected animationEpochMilliseconds: number;
  protected animationFrameValue = 0;
  protected readonly writeOutput: (output: string) => void;
  protected readonly nowMilliseconds: () => number;
  protected readonly scheduleTimer: TasksWatchScheduleTimer;
  protected readonly cancelTimer: TasksWatchCancelTimer;

  constructor(options: TasksWatchRendererOptions = {}) {
    this.writeOutput =
      options.writeOutput ??
      ((output: string): void => {
        process.stdout.write(output);
      });
    this.nowMilliseconds = options.nowMilliseconds ?? (() => performance.now());
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
    this.writeFrame(
      TasksWatchRenderer.Class.frame(
        this.previousLines,
        currentLines,
        enterAlternateScreen,
      ),
    );
    this.previousLines = [...currentLines];
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
      );
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
