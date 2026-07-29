// The tasks dashboard renderer: the lens tab line, then the visible window of lens rows, as a
// StyledText for the right-dock body. Stateless capability — pure statics behind the Static()
// seam; every model read happens through the passed-in context so reactivity flows from the
// host's reactive render call.
//
// The motion vocabulary is the CLI watch's, held still: READY wears the calm green dot (◉) and
// does not move; building wears the teal dot (●) — the pane repaints on data change, never on a
// paint clock, so motion is colour, not animation.
//
// invariant: An absent task tree is stated, never blank (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md)
import { StyledText, fg, bg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import { TextCoordinates } from '../text/TextCoordinates';
import type { Palette } from '../theme/ThemePalettes';
import type {
  TasksDashboardLens,
  TasksDashboardRow,
} from './TasksDashboardOverview';

class $TasksDashboardPaneRenderer {
  /** The CLI gradient vocabulary, reduced to its lead colours: building teal, round amber. */
  protected static readonly BUILDING_TEAL = '#00afaf';
  protected static readonly ROUND_AMBER = '#d7af5f';

  /** The tab line's fixed layout — one source for painting and pointer hit-testing. */
  static lensTabs(): LensTab[] {
    const labels: Array<[TasksDashboardLens, string]> = [
      ['live', 'LIVE'],
      ['active', 'ACTIVE'],
      ['done', 'DONE'],
    ];
    const tabs: LensTab[] = [];
    let column = 1;
    for (const [lens, label] of labels) {
      tabs.push({
        lens,
        label,
        startColumn: column,
        endColumn: column + label.length - 1,
      });
      column += label.length + 2;
    }
    return tabs;
  }

  static cycleGlyphColumn(): number {
    const tabs = this.lensTabs();
    return (tabs[tabs.length - 1]?.endColumn ?? 0) + 3;
  }

  /** What a pointer-down on the tab line hits: a lens tab, the play/pause glyph, or nothing. */
  static hitTestTabLine(
    column: number,
  ): { kind: 'lens'; lens: TasksDashboardLens } | { kind: 'cycle' } | null {
    for (const tab of this.lensTabs()) {
      if (column >= tab.startColumn && column <= tab.endColumn)
        return { kind: 'lens', lens: tab.lens };
    }
    if (column === this.cycleGlyphColumn()) return { kind: 'cycle' };
    return null;
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
        [this.emptyLensLine(context.lens)],
        bodyHeight,
      );
      return new StyledText(chunks);
    }
    const top = context.windowTop;
    const visible = context.rows.slice(top, top + bodyHeight);
    visible.forEach((row, visibleIndex) => {
      chunks.push(fg(context.palette.fg)('\n'));
      this.renderRow(context, chunks, row, top + visibleIndex);
    });
    return new StyledText(chunks);
  }

  protected static emptyLensLine(lens: TasksDashboardLens): string {
    return lens === 'live'
      ? 'IN-PROGRESS: none.'
      : lens === 'active'
        ? 'ACTIVE: none.'
        : 'COMPLETED: none.';
  }

  protected static renderTabLine(
    context: TasksDashboardRenderContext,
    chunks: TextChunk[],
  ): void {
    let column = 0;
    const put = (text: string, colour: string): void => {
      chunks.push(fg(colour)(text));
      column += text.length;
    };
    put(' ', context.palette.dim);
    for (const tab of this.lensTabs()) {
      const active = tab.lens === context.lens;
      put(tab.label, active ? context.palette.accent : context.palette.dim);
      put('  ', context.palette.dim);
    }
    put(' ', context.palette.dim);
    put(
      context.cycling ? '▶' : '▷',
      context.cycling ? context.palette.accent : context.palette.dim,
    );
    const padded = TextCoordinates.Class.padToDisplayWidth(
      '',
      Math.max(0, context.innerWidth - column),
    );
    if (padded.length > 0) chunks.push(fg(context.palette.dim)(padded));
  }

  /** The honest empty pane: every rows-absent state names itself; a blank pane is impossible. */
  protected static renderLines(
    context: TasksDashboardRenderContext,
    chunks: TextChunk[],
    lines: string[],
    bodyHeight: number,
  ): void {
    lines.slice(0, Math.max(0, bodyHeight)).forEach((line, index) => {
      chunks.push(fg(context.palette.fg)('\n'));
      const padded = TextCoordinates.Class.padToDisplayWidth(
        ` ${line}`,
        context.innerWidth,
      );
      chunks.push(
        fg(index === 0 ? context.palette.fg : context.palette.dim)(padded),
      );
    });
  }

  protected static renderRow(
    context: TasksDashboardRenderContext,
    chunks: TextChunk[],
    row: TasksDashboardRow,
    rowIndex: number,
  ): void {
    const selected = rowIndex === context.selectedIndex;
    const hovered = rowIndex === context.hoveredIndex;
    const rowBackground = selected
      ? context.paneFocused
        ? context.palette.selection
        : context.palette.cursorLine
      : hovered
        ? context.palette.cursorLine
        : null;
    const decorate = (styled: TextChunk): TextChunk =>
      rowBackground ? bg(rowBackground)(styled) : styled;
    if (row.kind === 'group') {
      const label = this.clipAndPad(` ${row.label}`, context);
      chunks.push(decorate(fg(context.palette.accent)(label)));
      return;
    }
    const glyph =
      row.standing === 'ready'
        ? '◉'
        : row.standing === 'building'
          ? '●'
          : context.lens === 'done'
            ? '✔'
            : ' ';
    const glyphColour =
      row.standing === 'ready' || context.lens === 'done'
        ? context.palette.added
        : row.standing === 'building'
          ? this.BUILDING_TEAL
          : context.palette.fg;
    const pieces: Array<[string, string]> = [];
    pieces.push([` ${glyph} `, glyphColour]);
    pieces.push([
      `#${row.taskNumber}`,
      selected && context.paneFocused
        ? context.palette.accent
        : context.palette.fg,
    ]);
    pieces.push([` ${row.label}`, context.palette.fg]);
    if (row.standing === 'ready')
      pieces.push([' READY', context.palette.added]);
    if (row.round > 1) pieces.push([` round ${row.round}`, this.ROUND_AMBER]);
    if (row.attachment.length > 0)
      pieces.push([` — ${row.attachment}`, context.palette.dim]);
    if (row.durationLabel.length > 0)
      pieces.push([`  ${row.durationLabel}`, context.palette.accent]);
    if (row.identity.length > 0)
      pieces.push([`  ${row.identity}`, context.palette.dim]);
    // Clip the composed line to the text viewport, then pad so the row highlight spans the pane.
    let consumedColumns = 0;
    for (const [text, colour] of pieces) {
      const remaining = Math.max(0, context.viewportWidth - consumedColumns);
      if (remaining === 0) break;
      const clipped = TextCoordinates.Class.displayColumnWindow(
        text,
        0,
        remaining,
      );
      if (clipped.length === 0) break;
      chunks.push(decorate(fg(colour)(clipped)));
      consumedColumns += clipped.length;
    }
    const padding = TextCoordinates.Class.padToDisplayWidth(
      '',
      Math.max(0, context.innerWidth - consumedColumns),
    );
    if (padding.length > 0)
      chunks.push(decorate(fg(context.palette.fg)(padding)));
  }

  protected static clipAndPad(
    text: string,
    context: TasksDashboardRenderContext,
  ): string {
    const clipped = TextCoordinates.Class.displayColumnWindow(
      text,
      0,
      Math.max(1, context.viewportWidth),
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

export interface TasksDashboardRenderContext {
  rows: readonly TasksDashboardRow[];
  lens: TasksDashboardLens;
  cycling: boolean;
  available: boolean;
  windowTop: number;
  selectedIndex: number;
  hoveredIndex: number;
  /** True while the pane owns the keyboard — selection paints at full intensity. */
  paneFocused: boolean;
  palette: Palette;
  /** Visible row count (pane body height, tab line included). */
  height: number;
  /** Pane inner width — rows pad to this so the row highlight spans the full width. */
  innerWidth: number;
  /** Text viewport width (inner width minus the scrollbar column). */
  viewportWidth: number;
}
