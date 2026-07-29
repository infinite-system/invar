import {
  BoxRenderable,
  StyledText,
  fg,
  bg,
  bold,
  italic,
  underline,
  link as terminalLink,
  type BoxOptions,
  type CliRenderer,
  type TextChunk,
} from '@opentui/core';
import { MarkdownParser, type BlockRecord } from './MarkdownParser';
import { MarkdownPreview, type PreviewRow } from './MarkdownPreview';
import {
  MarkdownStylesheet,
  type MarkdownInlineSelector,
  type MarkdownTextStyle,
} from './MarkdownStylesheet';
import type { Palette } from '../theme/ThemePalettes';
import type { TableBorderGlyphSet } from '../theme/ThemeIcons';
import { SelectableText } from '../ui/SelectableText';
import { TextCoordinates } from '../text/TextCoordinates';
import type { FindInBuffer } from '../search/FindInBuffer';

// invariant: Preview rendering follows visible rows (src/modules/markdown/markdown.invariants.md)
class $MarkdownRenderable extends BoxRenderable {
  readonly bodyRenderable: SelectableText.Model;
  protected visibleRowsSnapshot: PreviewRow[] = [];
  protected hoveredReferenceKey: string | null = null;
  protected referenceIsDeadProvider: ((target: string) => boolean) | null =
    null;
  protected findEngineProvider: (() => FindInBuffer.Instance | null) | null =
    null;

  constructor(
    renderer: CliRenderer,
    readonly preview: MarkdownPreview.Model,
    readonly theme: MarkdownRenderableTheme,
    options: MarkdownRenderableOptions = {},
  ) {
    super(renderer, {
      id: 'markdown-preview',
      flexGrow: 1,
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      padding: 0,
      overflow: 'hidden',
      ...options,
    });
    this.bodyRenderable = new SelectableText.Class(renderer, {
      id: 'markdown-preview-body',
      width: '100%',
      height: '100%',
      content: '',
      wrapMode: 'none',
      truncate: true,
      selectable: false,
    });
    this.add(this.bodyRenderable);
    this.preview.attachRenderTarget(this);
  }

  setHoveredReferenceKey(referenceKey: string | null): void {
    this.hoveredReferenceKey = referenceKey;
  }

  attachReferenceIsDeadProvider(provider: (target: string) => boolean): void {
    this.referenceIsDeadProvider = provider;
  }

  attachFindEngineProvider(provider: () => FindInBuffer.Instance | null): void {
    this.findEngineProvider = provider;
  }

  refresh(): void {
    this.pullVisibleRows();
  }

  positionAtCell(
    screenColumn: number,
    screenRow: number,
  ): { line: number; column: number } | null {
    const visibleRowIndex = screenRow - this.bodyRenderable.y;
    const row = this.visibleRowsSnapshot[visibleRowIndex];
    if (!row) return null;
    const rowText = this.preview.textForRow(row);
    return {
      line: this.preview.scrollTop.value + visibleRowIndex,
      column: TextCoordinates.Class.graphemeAtDisplayColumn(
        rowText,
        Math.max(0, screenColumn - this.bodyRenderable.x),
      ),
    };
  }

  referenceAtCell(
    screenColumn: number,
    screenRow: number,
  ): MarkdownReferenceHit | null {
    const visibleRowIndex = screenRow - this.bodyRenderable.y;
    const row = this.visibleRowsSnapshot[visibleRowIndex];
    if (!row?.block) return null;
    const rowText = this.preview.textForRow(row);
    const rowDisplayColumn = Math.max(0, screenColumn - this.bodyRenderable.x);
    if (row.tableCells && row.tableRowIndex !== undefined) {
      return this.tableReferenceAtDisplayColumn(row, rowDisplayColumn);
    }
    const rowGraphemeColumn = TextCoordinates.Class.graphemeAtDisplayColumn(
      rowText,
      rowDisplayColumn,
    );
    const rowUtf16Offset = TextCoordinates.Class.graphemeToU16(
      rowText,
      rowGraphemeColumn,
    );
    const blockUtf16Offset = row.textStart + rowUtf16Offset - row.prefix.length;
    for (
      let spanIndex = 0;
      spanIndex < row.block.spans.length;
      spanIndex += 4
    ) {
      const spanStart = row.block.spans[spanIndex]!;
      const spanEnd = row.block.spans[spanIndex + 1]!;
      const inlineStyle = row.block.spans[spanIndex + 2]!;
      const linkIndexPlusOne = row.block.spans[spanIndex + 3]!;
      if (blockUtf16Offset < spanStart || blockUtf16Offset >= spanEnd) continue;
      const target =
        inlineStyle === MarkdownParser.Class.inlineStyles.link
          ? row.block.links[linkIndexPlusOne - 1]
          : inlineStyle === MarkdownParser.Class.inlineStyles.code
            ? row.block.text.slice(spanStart, spanEnd)
            : undefined;
      if (!target) return null;
      return {
        key: this.referenceKey(row.blockIndex, spanStart, spanEnd, inlineStyle),
        target,
        explicitLink: inlineStyle === MarkdownParser.Class.inlineStyles.link,
      };
    }
    return null;
  }

  setSelectionRange(
    anchorColumn: number,
    anchorRow: number,
    focusColumn: number,
    focusRow: number,
  ): void {
    this.bodyRenderable.setSelectionRange(
      anchorColumn,
      anchorRow,
      focusColumn,
      focusRow,
    );
  }

  clearSelectionRange(): void {
    this.bodyRenderable.clearSelectionRange();
  }

  protected override onUpdate(deltaTime: number): void {
    this.pullVisibleRows();
    super.onUpdate(deltaTime);
  }

  protected override destroySelf(): void {
    this.preview.detachRenderTarget(this);
    super.destroySelf();
  }

  protected pullVisibleRows(): void {
    const palette = this.theme.palette;
    const width = Math.max(1, this.width);
    const height = Math.max(1, this.height);
    const rows = this.preview.visibleRows(
      width,
      height,
      this.theme.tableBorders,
    );
    this.visibleRowsSnapshot = rows;
    const chunks: TextChunk[] = [];

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      this.appendRow(chunks, rows[rowIndex]!, rowIndex, palette);
      if (rowIndex < rows.length - 1) chunks.push(fg(palette.fg)('\n'));
    }
    this.bodyRenderable.content = new StyledText(chunks);
    this.bodyRenderable.fg = palette.fg;
    this.backgroundColor = palette.bg;
  }

  // invariant: Markdown presentation resolves through one stylesheet (src/modules/markdown/markdown.invariants.md)
  protected appendRow(
    chunks: TextChunk[],
    row: PreviewRow,
    visibleRowIndex: number,
    palette: Palette,
  ): void {
    const stylesheet = MarkdownStylesheet.Class;
    if (row.role === 'spacer') {
      chunks.push(fg(palette.fg)(''));
      return;
    }
    if (
      row.role === 'status' ||
      row.role === 'rule' ||
      row.role === 'codeBorder' ||
      row.role === 'tableSeparator'
    ) {
      const rowStyle = stylesheet.textStyle(
        stylesheet.rowSelector(row.role, row.block?.kind ?? null, undefined),
      );
      chunks.push(this.styledChunk(row.overrideText ?? '', rowStyle, palette));
      return;
    }
    if (row.role === 'tableHeader' || row.role === 'tableBody') {
      this.appendTableRow(chunks, row, palette);
      return;
    }

    const block = row.block;
    if (!block) return;
    // The pane padding stays unstyled so a framed row (code) never paints its background
    // into the breathing room at the pane edge.
    const panePaddingText = stylesheet.panePaddingText;
    let prefixText = row.prefix;
    if (panePaddingText.length > 0 && prefixText.startsWith(panePaddingText)) {
      chunks.push(fg(palette.fg)(panePaddingText));
      prefixText = prefixText.slice(panePaddingText.length);
    }
    if (prefixText) chunks.push(this.decoratePrefix(prefixText, row, palette));
    this.appendInline(chunks, block, row, visibleRowIndex, palette);
    if (row.suffix) chunks.push(this.decoratePrefix(row.suffix, row, palette));
  }

  protected appendInline(
    chunks: TextChunk[],
    block: BlockRecord,
    row: PreviewRow,
    visibleRowIndex: number,
    palette: Palette,
  ): void {
    let position = row.textStart;
    const spans = block.spans;
    const findEngine = this.findEngineProvider?.() ?? null;
    const renderedRowIndex = this.preview.scrollTop.value + visibleRowIndex;
    const findMatches =
      findEngine?.matches.value.filter(
        (match) => match.line === renderedRowIndex,
      ) ?? [];
    const rowText = this.preview.textForRow(row);
    while (position < row.textEnd) {
      let nextBoundary = row.textEnd;
      let activeStyle = 0;
      let activeLink = 0;
      let activeSpanStart = -1;
      let activeSpanEnd = -1;

      for (let spanIndex = 0; spanIndex < spans.length; spanIndex += 4) {
        const spanStart = spans[spanIndex]!;
        const spanEnd = spans[spanIndex + 1]!;
        if (spanStart <= position && spanEnd > position) {
          activeStyle = spans[spanIndex + 2]!;
          activeLink = spans[spanIndex + 3]!;
          activeSpanStart = spanStart;
          activeSpanEnd = spanEnd;
          nextBoundary = Math.min(nextBoundary, spanEnd);
        } else if (spanStart > position) {
          nextBoundary = Math.min(nextBoundary, spanStart);
        }
      }

      let findHighlighted = false;
      for (const match of findMatches) {
        const matchStartUtf16 = TextCoordinates.Class.graphemeToU16(
          rowText,
          match.startColumn,
        );
        const matchEndUtf16 = TextCoordinates.Class.graphemeToU16(
          rowText,
          match.endColumn,
        );
        const blockMatchStart =
          row.textStart + matchStartUtf16 - row.prefix.length;
        const blockMatchEnd = row.textStart + matchEndUtf16 - row.prefix.length;
        if (blockMatchStart <= position && blockMatchEnd > position) {
          findHighlighted = true;
          nextBoundary = Math.min(nextBoundary, blockMatchEnd);
        } else if (blockMatchStart > position) {
          nextBoundary = Math.min(nextBoundary, blockMatchStart);
        }
      }

      const text = block.text.slice(position, nextBoundary);
      const referenceKey =
        activeSpanStart >= 0
          ? this.referenceKey(
              row.blockIndex,
              activeSpanStart,
              activeSpanEnd,
              activeStyle,
            )
          : null;
      chunks.push(
        this.decorateText(
          text,
          block,
          row,
          activeStyle,
          activeLink,
          findHighlighted,
          referenceKey !== null && referenceKey === this.hoveredReferenceKey,
          palette,
        ),
      );
      position = nextBoundary;
    }
  }

  /** Apply one stylesheet text style to a chunk of row text. */
  protected styledChunk(
    text: string,
    style: MarkdownTextStyle,
    palette: Palette,
  ): TextChunk {
    const stylesheet = MarkdownStylesheet.Class;
    let chunk = fg(stylesheet.paletteColor(palette, style.colorSlot))(text);
    if (style.backgroundSlot !== null) {
      chunk = bg(stylesheet.paletteColor(palette, style.backgroundSlot))(chunk);
    }
    if (style.bold) chunk = bold(chunk);
    if (style.italic) chunk = italic(chunk);
    if (style.underline) chunk = underline(chunk);
    return chunk;
  }

  /** Wrap an already-built chunk with a stylesheet style (used for overlays that must keep the
   *  inner chunk, like a hovered link). */
  protected styledWrap(
    chunk: TextChunk,
    style: MarkdownTextStyle,
    palette: Palette,
  ): TextChunk {
    const stylesheet = MarkdownStylesheet.Class;
    if (style.colorSlot !== null) {
      chunk = fg(stylesheet.paletteColor(palette, style.colorSlot))(chunk);
    }
    if (style.backgroundSlot !== null) {
      chunk = bg(stylesheet.paletteColor(palette, style.backgroundSlot))(chunk);
    }
    if (style.bold) chunk = bold(chunk);
    if (style.italic) chunk = italic(chunk);
    if (style.underline) chunk = underline(chunk);
    return chunk;
  }

  protected decoratePrefix(
    text: string,
    row: PreviewRow,
    palette: Palette,
  ): TextChunk {
    const stylesheet = MarkdownStylesheet.Class;
    return this.styledChunk(text, stylesheet.prefixStyle(row.role), palette);
  }

  protected inlineSelectorFor(
    inlineStyle: number,
  ): MarkdownInlineSelector | null {
    const inlineStyles = MarkdownParser.Class.inlineStyles;
    if (inlineStyle === inlineStyles.code) return 'inlineCode';
    if (inlineStyle === inlineStyles.emphasis) return 'inlineEmphasis';
    if (inlineStyle === inlineStyles.strong) return 'inlineStrong';
    if (inlineStyle === inlineStyles.link) return 'inlineLink';
    return null;
  }

  protected decorateText(
    text: string,
    block: BlockRecord,
    row: PreviewRow,
    inlineStyle: number,
    linkIndexPlusOne: number,
    findHighlighted: boolean,
    referenceHovered: boolean,
    palette: Palette,
    links: readonly string[] = block.links,
  ): TextChunk {
    const stylesheet = MarkdownStylesheet.Class;
    const elementStyle = stylesheet.textStyle(
      stylesheet.rowSelector(row.role, block.kind, block.level),
    );
    const inlineSelector =
      row.role === 'codeContent' ? null : this.inlineSelectorFor(inlineStyle);
    const overlayStyle =
      inlineSelector !== null
        ? stylesheet.inlineTextStyle(inlineSelector)
        : null;
    const mergedStyle: MarkdownTextStyle = overlayStyle
      ? {
          colorSlot: overlayStyle.colorSlot ?? elementStyle.colorSlot,
          backgroundSlot:
            overlayStyle.backgroundSlot ?? elementStyle.backgroundSlot,
          bold: elementStyle.bold || overlayStyle.bold,
          italic: elementStyle.italic || overlayStyle.italic,
          underline: elementStyle.underline || overlayStyle.underline,
        }
      : elementStyle;
    let chunk = this.styledChunk(text, mergedStyle, palette);

    if (inlineSelector === 'inlineLink') {
      const target = links[linkIndexPlusOne - 1];
      if (target) {
        chunk = terminalLink(target)(chunk);
        // invariant: Dead relative Markdown links have one revision-stamped verdict (src/modules/markdown/markdown.invariants.md)
        if (this.referenceIsDeadProvider?.(target) === true) {
          chunk = this.styledWrap(
            chunk,
            stylesheet.deadReferenceStyle,
            palette,
          );
        }
      }
    }
    if (referenceHovered) {
      chunk = this.styledWrap(chunk, stylesheet.referenceHoverStyle, palette);
    }
    if (findHighlighted) {
      const highlightStyle = stylesheet.findHighlightStyle;
      if (highlightStyle.backgroundSlot !== null) {
        chunk = bg(
          stylesheet.paletteColor(palette, highlightStyle.backgroundSlot),
        )(chunk);
      }
    }
    return chunk;
  }

  protected referenceKey(
    blockIndex: number,
    spanStart: number,
    spanEnd: number,
    inlineStyle: number,
  ): string {
    return `${blockIndex}:${spanStart}:${spanEnd}:${inlineStyle}`;
  }

  protected tableReferenceAtDisplayColumn(
    row: PreviewRow,
    rowDisplayColumn: number,
  ): MarkdownReferenceHit | null {
    if (!row.block || row.tableRowIndex === undefined || !row.tableCells) {
      return null;
    }
    for (const previewCell of row.tableCells) {
      const visibleTextWidth = TextCoordinates.Class.lineWidth(
        previewCell.visibleText,
      );
      if (
        rowDisplayColumn < previewCell.textStartDisplayColumn ||
        rowDisplayColumn >=
          previewCell.textStartDisplayColumn + visibleTextWidth
      ) {
        continue;
      }
      const localDisplayColumn =
        rowDisplayColumn - previewCell.textStartDisplayColumn;
      const graphemeColumn = TextCoordinates.Class.graphemeAtDisplayColumn(
        previewCell.visibleText,
        localDisplayColumn,
      );
      const utf16Offset = TextCoordinates.Class.graphemeToU16(
        previewCell.visibleText,
        graphemeColumn,
      );
      for (
        let spanIndex = 0;
        spanIndex < previewCell.cell.spans.length;
        spanIndex += 4
      ) {
        const spanStart = previewCell.cell.spans[spanIndex]!;
        const spanEnd = previewCell.cell.spans[spanIndex + 1]!;
        const inlineStyle = previewCell.cell.spans[spanIndex + 2]!;
        const linkIndexPlusOne = previewCell.cell.spans[spanIndex + 3]!;
        if (utf16Offset < spanStart || utf16Offset >= spanEnd) continue;
        const target =
          inlineStyle === MarkdownParser.Class.inlineStyles.link
            ? previewCell.cell.links[linkIndexPlusOne - 1]
            : inlineStyle === MarkdownParser.Class.inlineStyles.code
              ? previewCell.cell.text.slice(spanStart, spanEnd)
              : undefined;
        if (!target) return null;
        return {
          key: this.tableReferenceKey(
            row.blockIndex,
            row.tableRowIndex,
            previewCell.cellIndex,
            spanStart,
            spanEnd,
            inlineStyle,
          ),
          target,
          explicitLink: inlineStyle === MarkdownParser.Class.inlineStyles.link,
        };
      }
    }
    return null;
  }

  protected appendTableRow(
    chunks: TextChunk[],
    row: PreviewRow,
    palette: Palette,
  ): void {
    // invariant: Markdown tables align by display cells (src/modules/markdown/markdown.invariants.md)
    if (!row.block || !row.tableCells || !row.tableBorders) return;
    const stylesheet = MarkdownStylesheet.Class;
    const borderStyle = stylesheet.textStyle('tableBorder');
    chunks.push(fg(palette.fg)(stylesheet.panePaddingText));
    chunks.push(
      this.styledChunk(row.tableBorders.vertical, borderStyle, palette),
    );
    for (const previewCell of row.tableCells) {
      chunks.push(fg(palette.fg)(previewCell.leadingPadding));
      this.appendTableCellText(chunks, row, previewCell, palette);
      chunks.push(fg(palette.fg)(previewCell.trailingPadding));
      chunks.push(
        this.styledChunk(row.tableBorders.vertical, borderStyle, palette),
      );
    }
  }

  protected appendTableCellText(
    chunks: TextChunk[],
    row: PreviewRow,
    previewCell: NonNullable<PreviewRow['tableCells']>[number],
    palette: Palette,
  ): void {
    if (!row.block || row.tableRowIndex === undefined) return;
    let position = 0;
    while (position < previewCell.visibleText.length) {
      let nextBoundary = previewCell.visibleText.length;
      let activeStyle = 0;
      let activeLink = 0;
      let activeSpanStart = -1;
      let activeSpanEnd = -1;

      for (
        let spanIndex = 0;
        spanIndex < previewCell.cell.spans.length;
        spanIndex += 4
      ) {
        const spanStart = previewCell.cell.spans[spanIndex]!;
        const spanEnd = previewCell.cell.spans[spanIndex + 1]!;
        if (spanStart <= position && spanEnd > position) {
          activeStyle = previewCell.cell.spans[spanIndex + 2]!;
          activeLink = previewCell.cell.spans[spanIndex + 3]!;
          activeSpanStart = spanStart;
          activeSpanEnd = spanEnd;
          nextBoundary = Math.min(nextBoundary, spanEnd);
        } else if (spanStart > position) {
          nextBoundary = Math.min(nextBoundary, spanStart);
        }
      }

      const referenceKey =
        activeSpanStart >= 0
          ? this.tableReferenceKey(
              row.blockIndex,
              row.tableRowIndex,
              previewCell.cellIndex,
              activeSpanStart,
              activeSpanEnd,
              activeStyle,
            )
          : null;
      chunks.push(
        this.decorateText(
          previewCell.visibleText.slice(position, nextBoundary),
          row.block,
          row,
          activeStyle,
          activeLink,
          false,
          referenceKey !== null && referenceKey === this.hoveredReferenceKey,
          palette,
          previewCell.cell.links,
        ),
      );
      position = nextBoundary;
    }
  }

  protected tableReferenceKey(
    blockIndex: number,
    tableRowIndex: number,
    cellIndex: number,
    spanStart: number,
    spanEnd: number,
    inlineStyle: number,
  ): string {
    return `${blockIndex}:${tableRowIndex}:${cellIndex}:${spanStart}:${spanEnd}:${inlineStyle}`;
  }
}

export namespace MarkdownRenderable {
  export const $Class = $MarkdownRenderable;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface MarkdownRenderableTheme {
  readonly palette: Palette;
  readonly tableBorders: TableBorderGlyphSet;
}

export type MarkdownRenderableOptions = Omit<BoxOptions, 'flexDirection'>;

export interface MarkdownReferenceHit {
  key: string;
  target: string;
  /** True for an authored `[label](target)` link span; false for an inline-code path. An authored
   *  link that does not resolve still owes the user an explanation, where stray backtick text
   *  does not. */
  explicitLink: boolean;
}
