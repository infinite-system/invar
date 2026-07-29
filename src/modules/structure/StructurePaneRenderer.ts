// The structure pane renderer: the filter field and visible outline window as a StyledText for the
// right dock body, plus the stated empty affordances. Stateless capability — pure statics behind the
// Static() seam; every model read happens through the passed-in outline so reactivity flows from
// the host's reactive render call.
//
// The mark column resolves through the passed-in symbol-mark row — the theme's ONE table — so a
// class here is marked exactly like the same class in a completion list or the file tree.
//
// invariant: Only the visible window is rendered (src/modules/ui/ui.invariants.md)
// invariant: One table resolves every symbol mark (src/modules/theme/theme.invariants.md)
// invariant: A structure source answers or declines, never blanks (src/modules/structure/structure.invariants.md)
// invariant: Outline labels expose source semantics (src/modules/structure/structure.invariants.md)
// invariant: Selection is item-anchored click-set keyboard-moved and stays (src/modules/ui/ui.invariants.md)
import { StyledText, fg, bg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import { TextCoordinates } from '../text/TextCoordinates';
import type { TextInputModel } from '../text/TextInputModel';
import type { Palette } from '../theme/ThemePalettes';
import type { SymbolMarkSet } from '../theme/ThemeIcons';
import type { InterfaceGlyphVocabulary } from '../theme/ThemeIcons';
import { TextFieldPainter } from '../ui/TextFieldPainter';
import type { StructureOutline } from './StructureOutline';

class $StructurePaneRenderer {
  static render(context: StructurePaneRenderContext): StyledText {
    const { outline, palette, innerWidth } = context;
    const depthControl = ` ${context.structureMarks.structureDepth} ${context.defaultDepth}`;
    const filterWidth = Math.max(1, innerWidth - depthControl.length);
    const filterField = TextFieldPainter.Class.paint({
      prefix: ` ${context.searchGlyph ?? '/'} `,
      input: context.filterInput ?? outline.filterInput,
      tone: TextFieldPainter.Class.toneFor(
        palette,
        context.structureFocused ? 'focused' : 'idle',
      ),
      selectionTone: TextFieldPainter.Class.selectionToneFor(palette),
      surfaceBackground: palette.panel,
      caretVisible: context.structureFocused,
      width: filterWidth,
    });
    context.setFilterCaretColumn?.(filterField.caretColumn);
    const rows = outline.rows.value;
    if (rows.length === 0) {
      const emptyState = this.renderEmptyState(context);
      return new StyledText([
        ...filterField.chunks,
        fg(palette.accent)(depthControl),
        fg(palette.fg)('\n'),
        ...(emptyState.chunks as TextChunk[]),
      ]);
    }
    const selectedIndex = outline.selectedIndex.value;
    const hoveredIndex = outline.hoveredIndex.value;
    const top = outline.windowTop();
    const visible = rows.slice(top, top + context.height);
    const semanticSlotsVisible = rows.some(
      (row) =>
        row.visibility !== undefined ||
        row.accessor !== undefined ||
        row.cached !== undefined ||
        row.override !== undefined,
    );
    const chunks: TextChunk[] = [
      ...filterField.chunks,
      fg(palette.accent)(depthControl),
      fg(palette.fg)('\n'),
    ];
    visible.forEach((row, visibleIndex) => {
      const rowIndex = top + visibleIndex;
      const selected = rowIndex === selectedIndex;
      const hovered = rowIndex === hoveredIndex;
      const indent = '  '.repeat(row.depth);
      const foldMark = row.hasChildren
        ? row.childrenVisible
          ? (context.foldOpenGlyph ?? 'v')
          : (context.foldClosedGlyph ?? '>')
        : ' ';
      const mark = context.symbolMarks[row.symbolClass];
      const visibilityMark =
        row.visibility === 'public'
          ? context.structureMarks.structurePublic
          : row.visibility === 'protected'
            ? context.structureMarks.structureProtected
            : row.visibility === 'private'
              ? context.structureMarks.structurePrivate
              : ' ';
      const accessorMark =
        row.accessor === 'getter'
          ? context.structureMarks.structureGetter
          : row.accessor === 'setter'
            ? context.structureMarks.structureSetter
            : ' ';
      const cachedMark = row.cached
        ? context.structureMarks.structureCached
        : ' ';
      const overrideMark = row.override
        ? context.structureMarks.structureOverride
        : ' ';
      const lineLabel = `:${row.line + 1}`;
      const rowBackground = selected
        ? context.structureFocused
          ? palette.selection
          : palette.cursorLine
        : hovered
          ? palette.cursorLine
          : null;
      const selectedForeground =
        selected && context.structureFocused ? palette.accent : null;
      const semanticChunks: StructureSemanticChunk[] = semanticSlotsVisible
        ? [
            {
              text: visibilityMark,
              color:
                row.visibility === 'public'
                  ? palette.added
                  : row.visibility === 'protected'
                    ? palette.modified
                    : row.visibility === 'private'
                      ? palette.warning
                      : palette.fg,
            },
            { text: accessorMark, color: palette.info },
            { text: cachedMark, color: palette.type },
            { text: overrideMark, color: palette.modified },
          ]
        : [];
      const rowChunks = this.fitRowChunks(
        [
          { text: ` ${indent}${foldMark} ${mark} `, color: palette.fg },
          ...semanticChunks,
          {
            text: `${semanticSlotsVisible ? ' ' : ''}${row.name} ${lineLabel}`,
            color: row.accessor ? palette.info : palette.fg,
          },
        ],
        Math.max(1, context.viewportWidth),
        innerWidth,
      );
      for (const rowChunk of rowChunks) {
        const styled = fg(selectedForeground ?? rowChunk.color)(rowChunk.text);
        chunks.push(rowBackground ? bg(rowBackground)(styled) : styled);
      }
      if (visibleIndex < visible.length - 1) chunks.push(fg(palette.fg)('\n'));
    });
    return new StyledText(chunks);
  }

  protected static fitRowChunks(
    sourceChunks: readonly StructureSemanticChunk[],
    viewportWidth: number,
    innerWidth: number,
  ): StructureSemanticChunk[] {
    const fittedChunks: StructureSemanticChunk[] = [];
    let remainingWidth = viewportWidth;
    for (const sourceChunk of sourceChunks) {
      if (remainingWidth <= 0) break;
      const text = TextCoordinates.Class.displayColumnWindow(
        sourceChunk.text,
        0,
        remainingWidth,
      );
      if (text.length > 0) {
        fittedChunks.push({ text, color: sourceChunk.color });
        remainingWidth -= TextCoordinates.Class.lineWidth(text);
      }
    }
    const fittedWidth = fittedChunks.reduce(
      (width, chunk) => width + TextCoordinates.Class.lineWidth(chunk.text),
      0,
    );
    if (fittedWidth < innerWidth) {
      fittedChunks.push({
        text: ' '.repeat(innerWidth - fittedWidth),
        color: sourceChunks[0]?.color ?? '#ffffff',
      });
    }
    return fittedChunks;
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
            ? outline.filterInput.isEmpty
              ? 'No symbols in this file.'
              : 'No matching symbols.'
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
  structureMarks: Pick<
    InterfaceGlyphVocabulary,
    | 'structurePublic'
    | 'structureProtected'
    | 'structurePrivate'
    | 'structureCached'
    | 'structureOverride'
    | 'structureGetter'
    | 'structureSetter'
    | 'structureDepth'
  >;
  filterInput?: TextInputModel.Model;
  searchGlyph?: string;
  defaultDepth: number;
  foldOpenGlyph?: string;
  foldClosedGlyph?: string;
  setFilterCaretColumn?(column: number): void;
  /** Visible row count (pane body height). */
  height: number;
  /** Pane inner width — rows pad to this so the row highlight spans the full width. */
  innerWidth: number;
  /** Text viewport width (inner width minus the scrollbar column). */
  viewportWidth: number;
}

interface StructureSemanticChunk {
  readonly text: string;
  readonly color: string;
}
