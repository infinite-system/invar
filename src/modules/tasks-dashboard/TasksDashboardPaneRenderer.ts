// The tasks dashboard renderer. It paints the CLI watch vocabulary from the CLI's exported
// tables. It also owns the row-action geometry used by paint, pointer hits, and tooltips.
//
// invariant: The CLI lenses are the dashboard's one generator (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: Dashboard motion exists only while observed (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: Each dashboard lens has one stable row shape (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: Dashboard controls state their selection and next action (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md)
import { StyledText, bg, fg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import {
  TASKS_GATE_RAMP,
  projectTasksWatchTaskGroup,
  tasksMotionStepAtElapsed,
  type GateGlance,
  type TasksWatchTextLine,
  type TasksWatchTextSegment,
  type TasksWatchTextTone,
} from '../../../scripts/tasks/tasks-status';
import { TextCoordinates } from '../text/TextCoordinates';
import type { TaskActionIconSet } from '../theme/ThemeIcons';
import type { Palette } from '../theme/ThemePalettes';
import { WrapText } from '../ui/WrapText';
import type {
  TasksDashboardActionNotice,
  TasksDashboardLens,
  TasksDashboardRow,
} from './TasksDashboardOverview';

class $TasksDashboardPaneRenderer {
  // Hot cell-paint path: this packed color is fixed and never varies by subclass.
  protected static readonly ROUND_AMBER = '#d7af5f';

  static lensTabs(): LensTab[] {
    const labels: Array<[TasksDashboardLens, string]> = [
      ['live', 'LIVE'],
      ['active', 'ACTIVE'],
      ['done', 'DONE'],
    ];
    const tabs: LensTab[] = [];
    let column = 0;
    for (const [labelIndex, [lens, label]] of labels.entries()) {
      const text = `${labelIndex === 0 ? '|' : ''} ${label} ${
        labelIndex === labels.length - 1 ? '|' : ''
      }`;
      tabs.push({
        lens,
        label,
        text,
        startColumn: column,
        endColumn: column + TextCoordinates.Class.lineWidth(text),
      });
      column += TextCoordinates.Class.lineWidth(text);
    }
    return tabs;
  }

  static cycleGlyphColumn(): number {
    const tabs = this.lensTabs();
    return (tabs[tabs.length - 1]?.endColumn ?? 0) + 1;
  }

  static hitTestTabLine(column: number): TasksDashboardTabLineTarget | null {
    for (const tab of this.lensTabs()) {
      if (column >= tab.startColumn && column < tab.endColumn)
        return { kind: 'lens', lens: tab.lens };
    }
    return column === this.cycleGlyphColumn() ? { kind: 'cycle' } : null;
  }

  static taskActionAt(
    context: TasksDashboardRenderContext,
    row: TasksDashboardRow,
    column: number,
  ): TasksDashboardAction | null {
    const projection = this.actionProjection(context, row);
    if (projection === null) return null;
    for (const segment of projection.segments) {
      if (column >= segment.startColumn && column < segment.endColumn)
        return segment.action;
    }
    return null;
  }

  static tooltipForAction(
    action: TasksDashboardAction,
    row: TasksDashboardRow,
  ): string {
    return action === 'session'
      ? row.sessionAvailable === false
        ? `Builder tmux session is missing: ${row.sessionName}`
        : `Attach to builder tmux session: ${row.sessionName}`
      : action === 'workspace'
        ? 'Open the task worktree as a workspace'
        : action === 'task'
          ? 'Open the task record'
          : action === 'brief'
            ? 'Open the latest brief'
            : 'Open the latest report';
  }

  static tooltipForTabLineTarget(
    target: TasksDashboardTabLineTarget,
    cycling: boolean,
  ): string | null {
    if (target.kind !== 'cycle') return null;
    return cycling
      ? 'Stop automatic lens cycling'
      : 'Start automatic lens cycling';
  }

  static render(context: TasksDashboardRenderContext): StyledText {
    const chunks: TextChunk[] = [];
    this.renderTabLine(context, chunks);
    const bodyHeight = Math.max(0, context.height - 1);
    if (!context.available) {
      this.renderLines(
        context,
        chunks,
        [
          'No task system in this workspace.',
          '',
          'A tasks pane appears when .invar/tasks/ exists.',
        ],
        bodyHeight,
      );
      return new StyledText(chunks);
    }
    if (context.rows.length === 0) {
      this.renderLines(
        context,
        chunks,
        [
          context.lens === 'live'
            ? 'IN-PROGRESS: none.'
            : context.lens === 'active'
              ? 'ACTIVE: none.'
              : 'COMPLETED: none.',
        ],
        bodyHeight,
      );
      return new StyledText(chunks);
    }
    const visible = context.rows.slice(
      context.windowTop,
      context.windowTop + bodyHeight,
    );
    visible.forEach((row, visibleIndex) => {
      chunks.push(fg(context.palette.fg)('\n'));
      this.renderRow(context, chunks, row, context.windowTop + visibleIndex);
    });
    return new StyledText(chunks);
  }

  protected static renderTabLine(
    context: TasksDashboardRenderContext,
    chunks: TextChunk[],
  ): void {
    let column = 0;
    const put = (
      text: string,
      colour: string,
      backgroundColour: string | null = null,
    ): void => {
      const foregroundChunk = fg(colour)(text);
      chunks.push(
        backgroundColour
          ? bg(backgroundColour)(foregroundChunk)
          : foregroundChunk,
      );
      column += TextCoordinates.Class.lineWidth(text);
    };
    const tabs = this.lensTabs();
    for (const tab of tabs) {
      const active = tab.lens === context.lens;
      const hovered =
        context.hoveredTabLineTarget?.kind === 'lens' &&
        context.hoveredTabLineTarget.lens === tab.lens;
      put(
        tab.text,
        active ? context.palette.accent : context.palette.dim,
        active
          ? context.palette.selection
          : hovered
            ? context.palette.cursorLine
            : null,
      );
    }
    put(' ', context.palette.dim);
    const cycleHovered = context.hoveredTabLineTarget?.kind === 'cycle';
    put(
      context.cycling
        ? context.taskActionIcons.cycleStop
        : context.taskActionIcons.cycleStart,
      context.cycling ? context.palette.accent : context.palette.dim,
      context.cycling
        ? context.palette.selection
        : cycleHovered
          ? context.palette.cursorLine
          : null,
    );
    put(
      TextCoordinates.Class.padToDisplayWidth(
        '',
        Math.max(0, context.innerWidth - column),
      ),
      context.palette.dim,
    );
  }

  protected static renderLines(
    context: TasksDashboardRenderContext,
    chunks: TextChunk[],
    lines: string[],
    bodyHeight: number,
  ): void {
    lines.slice(0, bodyHeight).forEach((line, index) => {
      chunks.push(fg(context.palette.fg)('\n'));
      chunks.push(
        fg(index === 0 ? context.palette.fg : context.palette.dim)(
          TextCoordinates.Class.padToDisplayWidth(
            ` ${line}`,
            context.innerWidth,
          ),
        ),
      );
    });
  }

  protected static renderRow(
    context: TasksDashboardRenderContext,
    chunks: TextChunk[],
    row: TasksDashboardRow,
    rowIndex: number,
  ): void {
    const selectedTaskNumber =
      context.rows[context.selectedIndex]?.taskNumber ?? null;
    const selected =
      rowIndex === context.selectedIndex ||
      (row.kind === 'detail' &&
        row.taskNumber !== null &&
        row.taskNumber === selectedTaskNumber);
    const hovered =
      row.taskNumber !== null && row.taskNumber === context.hoveredTaskNumber;
    const rowBackground = selected
      ? context.paneFocused
        ? context.palette.selection
        : context.palette.cursorLine
      : hovered
        ? context.palette.cursorLine
        : null;
    const decorate = (chunk: TextChunk): TextChunk =>
      rowBackground ? bg(rowBackground)(chunk) : chunk;
    if (row.kind === 'detail') {
      this.renderDetailRow(context, chunks, row, decorate);
      return;
    }
    if (row.kind === 'group' || row.kind === 'scope') {
      chunks.push(
        decorate(
          fg(
            row.kind === 'group' ? context.palette.accent : context.palette.dim,
          )(this.clipAndPad(` ${row.label}`, context)),
        ),
      );
      return;
    }
    if (row.kind === 'gate') {
      this.renderGateRow(context, chunks, decorate);
      return;
    }

    if (context.lens === 'live') {
      const line = this.taskGroupLine(context, row);
      this.renderProjectedLine(
        context,
        chunks,
        line,
        decorate,
        context.innerWidth,
      );
      return;
    }
    const glyph = context.lens === 'done' ? '✔' : ' ';
    const glyphColour =
      context.lens === 'done' ? context.palette.added : context.palette.dim;
    const pieces: Array<[string, string]> = [
      [` ${glyph} `, glyphColour],
      [
        `#${row.taskNumber}`,
        selected && context.paneFocused
          ? context.palette.accent
          : context.palette.fg,
      ],
      [` ${row.label}`, context.palette.fg],
    ];
    if (row.attachment)
      pieces.push([` — ${row.attachment}`, context.palette.dim]);
    if (row.durationLabel)
      pieces.push([`  ${row.durationLabel}`, context.palette.accent]);
    if (row.identity) pieces.push([`  ${row.identity}`, context.palette.dim]);
    this.renderPieces(
      context,
      chunks,
      pieces,
      decorate,
      this.actionProjection(context, row)?.textEndColumn ?? context.innerWidth,
    );
    this.renderActions(context, chunks, row, decorate);
  }

  protected static renderDetailRow(
    context: TasksDashboardRenderContext,
    chunks: TextChunk[],
    row: TasksDashboardRow,
    decorate: (chunk: TextChunk) => TextChunk,
  ): void {
    const notice =
      context.actionNotice?.taskNumber === row.taskNumber
        ? context.actionNotice.message
        : null;
    const maximumWidth =
      this.actionProjection(context, row)?.textEndColumn ?? context.innerWidth;
    const line = this.taskGroupLine(context, row);
    const pieces =
      notice === null
        ? this.projectedPieces(context, line)
        : ([[` ${notice}`, context.palette.warning]] as Array<
            [string, string]
          >);
    this.renderPieces(context, chunks, pieces, decorate, maximumWidth);
    this.renderActions(context, chunks, row, decorate);
  }

  protected static renderActions(
    context: TasksDashboardRenderContext,
    chunks: TextChunk[],
    row: TasksDashboardRow,
    decorate: (chunk: TextChunk) => TextChunk,
  ): void {
    const projection = this.actionProjection(context, row);
    if (projection === null) return;
    for (const segment of projection.segments) {
      const colour =
        segment.action === 'session' && row.sessionAvailable === false
          ? context.palette.warning
          : context.palette.accent;
      chunks.push(decorate(fg(colour)(` ${segment.glyph} `)));
    }
    const consumed = projection.endColumn;
    if (consumed < context.innerWidth)
      chunks.push(
        decorate(
          fg(context.palette.fg)(
            TextCoordinates.Class.padToDisplayWidth(
              '',
              context.innerWidth - consumed,
            ),
          ),
        ),
      );
  }

  protected static taskGroupLine(
    context: TasksDashboardRenderContext,
    row: TasksDashboardRow,
  ): TasksWatchTextLine {
    const group = projectTasksWatchTaskGroup({
      taskNumber: row.taskNumber ?? 0,
      label: row.label,
      standing: row.standing,
      phase: row.phase,
      round: row.round,
      durationLabel: row.durationLabel,
      addedLines: row.addedLines,
      removedLines: row.removedLines,
      identity: row.identity,
      sessionName: row.sessionName,
      sessionAvailable: row.sessionAvailable,
      gateGlance: context.gateGlance,
      animationElapsedMilliseconds: context.animationElapsedMilliseconds,
      nowMilliseconds: Date.now(),
    });
    return row.kind === 'detail' ? group.detail : group.title;
  }

  protected static projectedPieces(
    context: TasksDashboardRenderContext,
    line: TasksWatchTextLine,
  ): Array<[string, string]> {
    return line.segments.map((segment) => [
      segment.text,
      this.colourForProjectedSegment(context, segment),
    ]);
  }

  protected static renderProjectedLine(
    context: TasksDashboardRenderContext,
    chunks: TextChunk[],
    line: TasksWatchTextLine,
    decorate: (chunk: TextChunk) => TextChunk,
    maximumWidth: number,
  ): void {
    this.renderPieces(
      context,
      chunks,
      this.projectedPieces(context, line),
      decorate,
      maximumWidth,
    );
  }

  protected static colourForProjectedSegment(
    context: TasksDashboardRenderContext,
    segment: TasksWatchTextSegment,
  ): string {
    if (segment.color !== null) return segment.color;
    const tones: Record<TasksWatchTextTone, string> = {
      foreground: context.palette.fg,
      strong: context.palette.fg,
      dim: context.palette.dim,
      success: context.palette.added,
      warning: context.palette.warning,
      error: context.palette.error,
      accent: context.palette.accent,
      round: this.ROUND_AMBER,
      motion: context.palette.accent,
    };
    return tones[segment.tone];
  }

  protected static renderGateRow(
    context: TasksDashboardRenderContext,
    chunks: TextChunk[],
    decorate: (chunk: TextChunk) => TextChunk,
  ): void {
    const gate = context.gateGlance;
    const step = tasksMotionStepAtElapsed(context.animationElapsedMilliseconds);
    const colour =
      gate?.exitCode === 0
        ? context.palette.added
        : gate?.exitCode === null
          ? TASKS_GATE_RAMP[step % TASKS_GATE_RAMP.length]!.color
          : context.palette.error;
    const label =
      gate === null
        ? ' Gate: no fleet gate registry.'
        : gate.exitCode === null
          ? ` Gate: running ${gate.phase}`
          : gate.exitCode === 0
            ? ` Gate: passed ${gate.phase}`
            : ` Gate: failed ${gate.phase}`;
    chunks.push(decorate(fg(colour)(this.clipAndPad(label, context))));
  }

  protected static renderPieces(
    context: TasksDashboardRenderContext,
    chunks: TextChunk[],
    pieces: Array<[string, string]>,
    decorate: (chunk: TextChunk) => TextChunk,
    maximumWidth: number,
  ): void {
    const fullWidth = pieces.reduce(
      (width, [text]) => width + WrapText.Class.displayWidth(text),
      0,
    );
    const ellipsisWidth = WrapText.Class.displayWidth(context.ellipsisCell);
    const truncated = fullWidth > maximumWidth;
    const contentWidth = Math.max(
      0,
      maximumWidth - (truncated ? ellipsisWidth : 0),
    );
    let consumed = 0;
    for (const [text, colour] of pieces) {
      const remaining = Math.max(0, contentWidth - consumed);
      if (remaining === 0) break;
      const clipped = WrapText.Class.clipToWidth(text, remaining, '');
      chunks.push(decorate(fg(colour)(clipped)));
      consumed += WrapText.Class.displayWidth(clipped);
    }
    if (truncated) {
      chunks.push(decorate(fg(context.palette.dim)(context.ellipsisCell)));
      consumed += ellipsisWidth;
    }
    chunks.push(
      decorate(
        fg(context.palette.fg)(
          TextCoordinates.Class.padToDisplayWidth(
            '',
            Math.max(0, maximumWidth - consumed),
          ),
        ),
      ),
    );
  }

  protected static actionProjection(
    context: TasksDashboardRenderContext,
    row: TasksDashboardRow,
  ): TaskActionProjection | null {
    const isActionRow =
      row.kind === 'detail' || (row.kind === 'task' && context.lens !== 'live');
    if (
      !isActionRow ||
      row.taskNumber === null ||
      row.taskNumber !== context.hoveredTaskNumber
    ) {
      return null;
    }
    const icons = context.taskActionIcons;
    const actions: ReadonlyArray<readonly [TasksDashboardAction, string]> = [
      ...(row.sessionName === null
        ? []
        : ([['session', icons.session]] as const)),
      ['workspace', icons.workspace],
      ['task', icons.taskRecord],
      ['brief', icons.latestBrief],
      ['report', icons.latestReport],
    ];
    const textEndColumn = Math.max(0, context.innerWidth - actions.length * 3);
    const segments = actions.map(([action, glyph], index) => ({
      action,
      glyph,
      startColumn: textEndColumn + index * 3,
      endColumn: textEndColumn + index * 3 + 3,
    }));
    return { textEndColumn, endColumn: context.innerWidth, segments };
  }

  protected static clipAndPad(
    text: string,
    context: TasksDashboardRenderContext,
  ): string {
    const clipped = WrapText.Class.clipToWidth(
      text,
      Math.max(1, context.innerWidth),
      context.ellipsisCell,
    );
    return TextCoordinates.Class.padToDisplayWidth(clipped, context.innerWidth);
  }
}

export namespace TasksDashboardPaneRenderer {
  export const $Class = Static($TasksDashboardPaneRenderer);
  export let Class = $Class;
}

interface LensTab {
  lens: TasksDashboardLens;
  label: string;
  text: string;
  startColumn: number;
  endColumn: number;
}

export type TasksDashboardTabLineTarget =
  { kind: 'lens'; lens: TasksDashboardLens } | { kind: 'cycle' };

interface TaskActionSegment {
  action: TasksDashboardAction;
  glyph: string;
  startColumn: number;
  endColumn: number;
}

interface TaskActionProjection {
  textEndColumn: number;
  endColumn: number;
  segments: TaskActionSegment[];
}

export type TasksDashboardAction =
  'session' | 'workspace' | 'task' | 'brief' | 'report';

export interface TasksDashboardRenderContext {
  rows: readonly TasksDashboardRow[];
  lens: TasksDashboardLens;
  cycling: boolean;
  available: boolean;
  windowTop: number;
  selectedIndex: number;
  hoveredTaskNumber: number | null;
  paneFocused: boolean;
  palette: Palette;
  height: number;
  innerWidth: number;
  viewportWidth: number;
  animationElapsedMilliseconds: number;
  gateGlance: GateGlance | null;
  actionNotice: TasksDashboardActionNotice | null;
  taskActionIcons: TaskActionIconSet;
  ellipsisCell: string;
  hoveredTabLineTarget: TasksDashboardTabLineTarget | null;
}
