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
  TASKS_BUILDING_BREATH_FRAMES,
  TASKS_BUILDING_RAMP,
  TASKS_EXPLORING_GLYPHS,
  TASKS_EXPLORING_RAMP,
  TASKS_GATE_RAMP,
  TASKS_MOTION_PAINTS_PER_STEP,
  type GateGlance,
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
  protected static readonly ROUND_AMBER = '#d7af5f';

  static lensTabs(): LensTab[] {
    const labels: Array<[TasksDashboardLens, string]> = [
      ['live', 'LIVE'],
      ['active', 'ACTIVE'],
      ['done', 'DONE'],
    ];
    const tabs: LensTab[] = [];
    let column = 0;
    for (const [lens, label] of labels) {
      tabs.push({
        lens,
        label,
        startColumn: column,
        endColumn: column + label.length + 1,
      });
      column += label.length + 3;
    }
    return tabs;
  }

  static cycleGlyphColumn(): number {
    const tabs = this.lensTabs();
    return (tabs[tabs.length - 1]?.endColumn ?? 0) + 2;
  }

  static hitTestTabLine(column: number): TasksDashboardTabLineTarget | null {
    for (const tab of this.lensTabs()) {
      if (column >= tab.startColumn && column <= tab.endColumn)
        return { kind: 'lens', lens: tab.lens };
    }
    return column === this.cycleGlyphColumn() ? { kind: 'cycle' } : null;
  }

  static taskActionAt(
    context: TasksDashboardRenderContext,
    row: TasksDashboardRow,
    column: number,
  ): TasksDashboardAction | null {
    const actionRow =
      row.kind === 'detail' || (row.kind === 'task' && context.lens !== 'live');
    if (!actionRow || row.taskNumber === null) return null;
    for (const segment of this.actionSegments(context, row)) {
      if (column >= segment.startColumn && column <= segment.endColumn)
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
    for (const [tabIndex, tab] of tabs.entries()) {
      const active = tab.lens === context.lens;
      const hovered =
        context.hoveredTabLineTarget?.kind === 'lens' &&
        context.hoveredTabLineTarget.lens === tab.lens;
      put(
        ` ${tab.label} `,
        active ? context.palette.accent : context.palette.dim,
        active
          ? context.palette.selection
          : hovered
            ? context.palette.cursorLine
            : null,
      );
      if (tabIndex < tabs.length - 1) put(' ', context.palette.dim);
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
    const hovered = rowIndex === context.hoveredIndex;
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
    if (context.lens === 'live') {
      this.renderPieces(
        context,
        chunks,
        pieces,
        decorate,
        context.viewportWidth,
      );
      return;
    }
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
      this.actionStartColumn(context, row),
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
    const prefixWidth = Math.max(0, this.actionStartColumn(context, row));
    const pieces =
      notice === null
        ? this.statusPieces(context, row)
        : ([[` ${notice}`, context.palette.warning]] as Array<
            [string, string]
          >);
    this.renderPieces(context, chunks, pieces, decorate, prefixWidth);
    this.renderActions(context, chunks, row, decorate);
  }

  protected static renderActions(
    context: TasksDashboardRenderContext,
    chunks: TextChunk[],
    row: TasksDashboardRow,
    decorate: (chunk: TextChunk) => TextChunk,
  ): void {
    const actions = this.actionSegments(context, row);
    for (const segment of actions) {
      const colour =
        segment.action === 'session' && row.sessionAvailable === false
          ? context.palette.warning
          : context.palette.accent;
      chunks.push(decorate(fg(colour)(` ${segment.glyph} `)));
    }
    const consumed = this.actionStartColumn(context, row) + actions.length * 3;
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

  protected static statusPieces(
    context: TasksDashboardRenderContext,
    row: TasksDashboardRow,
  ): Array<[string, string]> {
    const motionStep = Math.floor(
      context.animationPaint / TASKS_MOTION_PAINTS_PER_STEP,
    );
    const pieces: Array<[string, string]> = [[' ', context.palette.dim]];
    if (row.sessionAvailable === false)
      pieces.push(['! DEGRADED  ', context.palette.warning]);
    if (row.standing === 'ready')
      pieces.push(['◉ READY', context.palette.added]);
    else if (row.phase !== null) {
      const ramp =
        row.phase === 'exploring' ? TASKS_EXPLORING_RAMP : TASKS_BUILDING_RAMP;
      const motionFrame =
        row.phase === 'exploring'
          ? {
              glyph:
                TASKS_EXPLORING_GLYPHS[
                  motionStep % TASKS_EXPLORING_GLYPHS.length
                ]!,
              color:
                TASKS_EXPLORING_RAMP[motionStep % TASKS_EXPLORING_RAMP.length]!
                  .color,
            }
          : TASKS_BUILDING_BREATH_FRAMES[
              motionStep % TASKS_BUILDING_BREATH_FRAMES.length
            ]!;
      pieces.push([motionFrame.glyph, motionFrame.color]);
      pieces.push([' ', context.palette.dim]);
      for (
        let phaseLetterIndex = 0;
        phaseLetterIndex < row.phase.length;
        phaseLetterIndex += 1
      ) {
        pieces.push([
          row.phase[phaseLetterIndex] ?? '',
          ramp[(phaseLetterIndex + motionStep) % ramp.length]!.color,
        ]);
      }
    }
    if (row.round > 1) pieces.push([` round ${row.round}`, this.ROUND_AMBER]);
    if (row.durationLabel)
      pieces.push([`  ${row.durationLabel}`, context.palette.accent]);
    if (row.addedLines !== null && row.removedLines !== null)
      pieces.push([
        row.addedLines === 0 && row.removedLines === 0
          ? '  ±0'
          : `  +${row.addedLines} -${row.removedLines}`,
        context.palette.dim,
      ]);
    if (row.identity) pieces.push([`  ${row.identity}`, context.palette.dim]);
    return pieces;
  }

  protected static renderGateRow(
    context: TasksDashboardRenderContext,
    chunks: TextChunk[],
    decorate: (chunk: TextChunk) => TextChunk,
  ): void {
    const gate = context.gateGlance;
    const step = Math.floor(
      context.animationPaint / TASKS_MOTION_PAINTS_PER_STEP,
    );
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

  protected static actionStartColumn(
    context: TasksDashboardRenderContext,
    row: TasksDashboardRow,
  ): number {
    const actionCount = row.sessionName === null ? 4 : 5;
    return Math.max(0, context.innerWidth - actionCount * 3);
  }

  protected static actionSegments(
    context: TasksDashboardRenderContext,
    row: TasksDashboardRow,
  ): TaskActionSegment[] {
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
    return actions.map(([action, glyph], index) => ({
      action,
      glyph,
      startColumn: this.actionStartColumn(context, row) + index * 3,
      endColumn: this.actionStartColumn(context, row) + index * 3 + 2,
    }));
  }

  protected static clipAndPad(
    text: string,
    context: TasksDashboardRenderContext,
  ): string {
    const clipped = WrapText.Class.clipToWidth(
      text,
      Math.max(1, context.viewportWidth),
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

export type TasksDashboardAction =
  'session' | 'workspace' | 'task' | 'brief' | 'report';

export interface TasksDashboardRenderContext {
  rows: readonly TasksDashboardRow[];
  lens: TasksDashboardLens;
  cycling: boolean;
  available: boolean;
  windowTop: number;
  selectedIndex: number;
  hoveredIndex: number;
  paneFocused: boolean;
  palette: Palette;
  height: number;
  innerWidth: number;
  viewportWidth: number;
  animationPaint: number;
  gateGlance: GateGlance | null;
  actionNotice: TasksDashboardActionNotice | null;
  taskActionIcons: TaskActionIconSet;
  ellipsisCell: string;
  hoveredTabLineTarget: TasksDashboardTabLineTarget | null;
}
