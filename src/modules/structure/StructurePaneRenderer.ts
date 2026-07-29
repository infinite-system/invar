// The structure pane renderer: the visible window of outline rows as a StyledText for the primary
// dock body, plus the stated empty affordances. Stateless capability — pure statics behind the
// Static() seam; every model read happens through the passed-in outline so reactivity flows from
// the host's reactive render call.
//
// The mark column resolves through the passed-in symbol-mark row — the theme's ONE table — so a
// class here is marked exactly like the same class in a completion list or the file tree.
//
// invariant: Only the visible window is rendered (src/modules/ui/ui.invariants.md)
// invariant: One table resolves every symbol mark (src/modules/theme/theme.invariants.md)
// invariant: A structure source answers or declines, never blanks (src/modules/structure/structure.invariants.md)
// invariant: Selection is item-anchored click-set keyboard-moved and stays (src/modules/ui/ui.invariants.md)
import { StyledText, fg, bg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import { TextCoordinates } from '../text/TextCoordinates';
import type { Palette } from '../theme/ThemePalettes';
import type { SymbolMarkSet } from '../theme/ThemeIcons';
import type { StructureOutline } from './StructureOutline';

class $StructurePaneRenderer {
  static render(context: StructurePaneRenderContext): StyledText {
    const { outline, palette, innerWidth } = context;
    const rows = outline.rows.value;
    if (rows.length === 0) {
      return this.renderEmptyState(context);
    }
    const selectedIndex = outline.selectedIndex.value;
    const hoveredIndex = outline.hoveredIndex.value;
    const top = outline.windowTop();
    const visible = rows.slice(top, top + context.height);
    const chunks: TextChunk[] = [];
    visible.forEach((row, visibleIndex) => {
      const rowIndex = top + visibleIndex;
      const selected = rowIndex === selectedIndex;
      const hovered = rowIndex === hoveredIndex;
      const indent = '  '.repeat(row.depth);
      const mark = context.symbolMarks[row.symbolClass];
      const lineLabel = `:${row.line + 1}`;
      const completeLabel = ` ${indent}${mark} ${row.name} ${lineLabel}`;
      let label = TextCoordinates.Class.displayColumnWindow(
        completeLabel,
        0,
        Math.max(1, context.viewportWidth),
      );
      // Pad to the pane's inner width so the row highlight spans the full row.
      label = TextCoordinates.Class.padToDisplayWidth(label, innerWidth);
      const rowBackground = selected
        ? context.structureFocused
          ? palette.selection
          : palette.cursorLine
        : hovered
          ? palette.cursorLine
          : null;
      const styled = fg(
        selected && context.structureFocused ? palette.accent : palette.fg,
      )(label);
      chunks.push(rowBackground ? bg(rowBackground)(styled) : styled);
      if (visibleIndex < visible.length - 1) chunks.push(fg(palette.fg)('\n'));
    });
    return new StyledText(chunks);
  }

  /** The honest empty pane: every rows-absent state names itself; a blank pane is impossible. */
  protected static renderEmptyState(
    context: StructurePaneRenderContext,
  ): StyledText {
    const { outline, palette } = context;
    const status = outline.status.value;
    const headline =
      status === 'no-document'
        ? 'No file is open.'
        : status === 'loading'
          ? 'Reading structure…'
          : status === 'ready'
            ? 'No symbols in this file.'
            : 'No structure available.';
    const lines: string[] = [headline];
    const notice = outline.notice.value;
    if (notice) {
      lines.push('');
      lines.push(...this.wrapText(notice, Math.max(8, context.viewportWidth)));
    }
    const chunks: TextChunk[] = [];
    const visibleLines = lines.slice(0, Math.max(1, context.height));
    visibleLines.forEach((line, index) => {
      const padded = TextCoordinates.Class.padToDisplayWidth(
        ` ${line}`,
        context.innerWidth,
      );
      chunks.push(fg(index === 0 ? palette.fg : palette.dim)(padded));
      if (index < visibleLines.length - 1) chunks.push(fg(palette.fg)('\n'));
    });
    return new StyledText(chunks);
  }

  protected static wrapText(text: string, width: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > width && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
}

export namespace StructurePaneRenderer {
  export const $Class = Static($StructurePaneRenderer);
  export let Class = $Class;
}

export interface StructurePaneRenderContext {
  outline: StructureOutline.Model;
  /** True while the structure pane owns the keyboard — selection paints at full intensity. */
  structureFocused: boolean;
  palette: Palette;
  /** The theme's symbol-mark row for the active glyph tier — the one resolver, read once. */
  symbolMarks: SymbolMarkSet;
  /** Visible row count (pane body height). */
  height: number;
  /** Pane inner width — rows pad to this so the row highlight spans the full width. */
  innerWidth: number;
  /** Text viewport width (inner width minus the scrollbar column). */
  viewportWidth: number;
}
