import { Static } from 'ivue/extras';
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import {
  MarkdownDocument,
  type MarkdownDocumentOptions,
  type MarkdownSource,
} from './MarkdownDocument';
import type {
  BlockRecord,
  BlockKind,
  TableCellRecord,
  TableColumnAlignment,
} from './MarkdownParser';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import { StatusChannel } from '../system/StatusChannel';
import type { TableBorderGlyphSet } from '../theme/ThemeIcons';

// invariant: Parsing starts only after opening (src/modules/markdown/markdown.invariants.md)
// invariant: Preview rendering follows visible rows (src/modules/markdown/markdown.invariants.md)
class $MarkdownPreview {
  protected static get $emptyBlocks(): readonly BlockRecord[] {
    const emptyBlocks: readonly BlockRecord[] = [];
    return emptyBlocks;
  }

  declare $watchEffect: typeof import('vue').watchEffect;
  declare $stopEffects: () => void;

  protected renderTarget: RenderTarget | null = null;
  protected documentOptions: MarkdownDocumentOptions = {};

  get document() {
    return shallowRef<MarkdownDocument.Model | null>(null);
  }
  get active() {
    return ref(false);
  }
  get scrollTop() {
    return ref(0);
  }

  get blocks(): readonly BlockRecord[] {
    const previewClass = this.constructor as typeof $MarkdownPreview;
    return this.document.value?.blocks.value ?? previewClass.$emptyBlocks;
  }

  get parsedRevision(): number {
    return this.document.value?.revision.value ?? -1;
  }

  open(
    source: MarkdownSource,
    renderTarget: RenderTarget | null = null,
    documentOptions: MarkdownDocumentOptions = {},
  ): void {
    if (this.active.value) this.close();

    this.documentOptions = documentOptions;
    this.renderTarget = renderTarget;
    const document = this.createDocument(source);
    this.document.value = document;
    this.scrollTop.value = 0;
    this.active.value = true;
    document.open();
    this.$watchEffect(() => this.invalidateRender());
    StatusChannel.Class.update({
      markdownPreviewOpen: true,
      markdownScrollTop: 0,
    });
  }

  // invariant: Closing releases all preview work (src/modules/markdown/markdown.invariants.md)
  close(): void {
    const target = this.renderTarget;
    this.document.value?.close();
    this.document.value = null;
    this.active.value = false;
    this.scrollTop.value = 0;
    this.renderTarget = null;
    this.documentOptions = {};
    this.$stopEffects();
    target?.requestRender();
    StatusChannel.Class.update({
      markdownPreviewOpen: false,
      markdownScrollTop: 0,
      markdownBlockCount: 0,
    });
  }

  dispose(): void {
    this.close();
  }

  attachRenderTarget(target: RenderTarget): void {
    this.renderTarget = target;
    if (this.active.value) target.requestRender();
  }

  detachRenderTarget(target: RenderTarget): void {
    if (this.renderTarget === target) this.renderTarget = null;
  }

  scrollBy(delta: number, width: number, height: number): void {
    const maximum = Math.max(0, this.totalRows(width) - Math.max(1, height));
    this.scrollTop.value = Math.max(
      0,
      Math.min(maximum, this.scrollTop.value + delta),
    );
    StatusChannel.Class.update({ markdownScrollTop: this.scrollTop.value });
  }

  scrollTo(row: number, width: number, height: number): void {
    const maximum = Math.max(0, this.totalRows(width) - Math.max(1, height));
    this.scrollTop.value = Math.max(0, Math.min(maximum, row));
    StatusChannel.Class.update({ markdownScrollTop: this.scrollTop.value });
  }

  // invariant: Preview rendering follows visible rows (src/modules/markdown/markdown.invariants.md)
  visibleRows(
    width: number,
    height: number,
    tableBorders: TableBorderGlyphSet,
  ): PreviewRow[] {
    const document = this.document.value;
    const rowWidth = Math.max(1, Math.floor(width));
    const rowLimit = Math.max(0, Math.floor(height));
    if (!document || rowLimit === 0) return [];

    if (document.error.value)
      return [this.statusRow(`Markdown: ${document.error.value}`)];
    if (document.parsing.value && document.blocks.value.length === 0) {
      return [this.statusRow('Parsing Markdown…')];
    }

    return this.collectRows(
      document.blocks.value,
      rowWidth,
      this.scrollTop.value,
      rowLimit,
      tableBorders,
    );
  }

  /** Materialize the rendered text only for operations whose domain is the whole preview (find and
   * copy selection). Normal painting continues to call visibleRows and stays viewport bounded. */
  allRows(width: number, tableBorders: TableBorderGlyphSet): PreviewRow[] {
    const document = this.document.value;
    const rowWidth = Math.max(1, Math.floor(width));
    if (!document) return [];
    if (document.error.value)
      return [this.statusRow(`Markdown: ${document.error.value}`)];
    if (document.parsing.value && document.blocks.value.length === 0) {
      return [this.statusRow('Parsing Markdown…')];
    }
    return this.collectRows(
      document.blocks.value,
      rowWidth,
      0,
      Number.MAX_SAFE_INTEGER,
      tableBorders,
    );
  }

  /** The exact plain text represented by one preview row, shared by rendering hit-tests, find, and
   * clipboard selection so those paths cannot disagree about cell-to-text mapping. */
  textForRow(row: PreviewRow): string {
    if (row.overrideText !== undefined) return row.overrideText;
    if (!row.block) return '';
    return `${row.prefix}${row.block.text.slice(row.textStart, row.textEnd)}${row.suffix}`;
  }

  totalRows(width: number): number {
    const document = this.document.value;
    if (!document) return 0;
    let rowCount = 0;
    const rowWidth = Math.max(1, Math.floor(width));
    for (const block of document.blocks.value) {
      if (block.kind === 'list') continue;
      rowCount += this.rowCountForBlock(block, rowWidth) + 1;
    }
    return rowCount;
  }

  protected createDocument(source: MarkdownSource): MarkdownDocument.Model {
    return new MarkdownDocument.Class(source, this.documentOptions);
  }

  protected invalidateRender(): void {
    void this.active.value;
    void this.scrollTop.value;
    const document = this.document.value;
    if (document) {
      void document.revision.value;
      void document.parsing.value;
      void document.error.value;
    }
    this.renderTarget?.requestRender();
  }

  protected collectRows(
    blocks: readonly BlockRecord[],
    width: number,
    firstVisible: number,
    visibleCount: number,
    tableBorders: TableBorderGlyphSet,
  ): PreviewRow[] {
    const rows: PreviewRow[] = [];
    let rowIndex = 0;
    const endVisible = firstVisible + visibleCount;

    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = blocks[blockIndex]!;
      if (block.kind === 'list') continue;
      const blockRowCount = this.rowCountForBlock(block, width);
      const blockEndRow = rowIndex + blockRowCount;

      if (blockEndRow > firstVisible && rowIndex < endVisible) {
        if (block.kind === 'table') {
          this.appendVisibleTableRows(
            rows,
            block,
            blockIndex,
            width,
            Math.max(0, firstVisible - rowIndex),
            Math.min(blockRowCount, endVisible - rowIndex),
            tableBorders,
          );
        } else {
          let blockLocalRow = 0;
          const emit: EmitRow = (
            emittedBlock,
            emittedBlockIndex,
            textStart,
            textEnd,
            prefix,
            suffix,
            role,
            overrideText,
          ) => {
            const emittedRowIndex = rowIndex + blockLocalRow;
            if (
              emittedRowIndex >= firstVisible &&
              emittedRowIndex < endVisible
            ) {
              rows.push({
                block: emittedBlock,
                blockIndex: emittedBlockIndex,
                textStart,
                textEnd,
                prefix,
                suffix,
                role,
                overrideText,
              });
            }
            blockLocalRow++;
            return emittedRowIndex + 1 >= endVisible;
          };
          this.visitBlock(block, blockIndex, width, emit);
        }
      }

      rowIndex = blockEndRow;
      if (rowIndex >= firstVisible && rowIndex < endVisible) {
        rows.push({
          block: null,
          blockIndex: -1,
          textStart: 0,
          textEnd: 0,
          prefix: '',
          suffix: '',
          role: 'spacer',
        });
      }
      rowIndex++;
      if (rowIndex >= endVisible) break;
    }
    return rows;
  }

  protected rowCountForBlock(block: BlockRecord, width: number): number {
    if (block.kind === 'table') return (block.table?.rows.length ?? 0) + 1;
    let rowCount = 0;
    this.visitBlock(block, -1, width, () => {
      rowCount++;
      return false;
    });
    return rowCount;
  }

  protected visitBlock(
    block: BlockRecord,
    blockIndex: number,
    width: number,
    emit: EmitRow,
  ): boolean {
    switch (block.kind) {
      case 'code':
        return this.visitCode(block, blockIndex, width, emit);
      case 'blockquote':
        return this.visitWrapped(
          block,
          blockIndex,
          width,
          '│ ',
          '',
          'quote',
          emit,
        );
      case 'table':
        return false;
      case 'hr':
        return emit(block, blockIndex, 0, 0, '', '', 'rule', '─'.repeat(width));
      case 'listitem': {
        const indentation = '  '.repeat(Math.max(0, (block.level ?? 1) - 1));
        const prefix = `${indentation}${block.marker ?? '•'} `;
        return this.visitWrapped(
          block,
          blockIndex,
          width,
          prefix,
          '',
          'content',
          emit,
        );
      }
      default:
        return this.visitWrapped(
          block,
          blockIndex,
          width,
          '',
          '',
          'content',
          emit,
        );
    }
  }

  protected visitCode(
    block: BlockRecord,
    blockIndex: number,
    width: number,
    emit: EmitRow,
  ): boolean {
    const label = block.language ? ` ${block.language} ` : '';
    const remaining = Math.max(0, width - label.length - 2);
    if (
      emit(
        block,
        blockIndex,
        0,
        0,
        '',
        '',
        'codeBorder',
        `┌${label}${'─'.repeat(remaining)}┐`.slice(0, width),
      )
    ) {
      return true;
    }
    if (
      this.visitWrapped(
        block,
        blockIndex,
        width,
        '│ ',
        ' │',
        'codeContent',
        emit,
      )
    )
      return true;
    return emit(
      block,
      blockIndex,
      0,
      0,
      '',
      '',
      'codeBorder',
      `└${'─'.repeat(Math.max(0, width - 2))}┘`.slice(0, width),
    );
  }

  protected visitWrapped(
    block: BlockRecord,
    blockIndex: number,
    width: number,
    firstPrefix: string,
    suffix: string,
    role: PreviewRowRole,
    emit: EmitRow,
  ): boolean {
    const contentWidth = Math.max(
      1,
      width - firstPrefix.length - suffix.length,
    );
    let lineStart = 0;
    let isFirst = true;

    while (lineStart <= block.text.length) {
      const newline = block.text.indexOf('\n', lineStart);
      const physicalEnd = newline < 0 ? block.text.length : newline;
      if (physicalEnd === lineStart) {
        if (
          emit(
            block,
            blockIndex,
            lineStart,
            lineStart,
            isFirst ? firstPrefix : ' '.repeat(firstPrefix.length),
            suffix,
            role,
          )
        ) {
          return true;
        }
      } else {
        let segmentStart = lineStart;
        while (segmentStart < physicalEnd) {
          let segmentEnd = Math.min(physicalEnd, segmentStart + contentWidth);
          if (segmentEnd < physicalEnd) {
            const candidate = block.text.lastIndexOf(' ', segmentEnd);
            if (candidate > segmentStart) segmentEnd = candidate;
          }
          if (
            emit(
              block,
              blockIndex,
              segmentStart,
              segmentEnd,
              isFirst ? firstPrefix : ' '.repeat(firstPrefix.length),
              suffix,
              role,
            )
          ) {
            return true;
          }
          isFirst = false;
          segmentStart = segmentEnd;
          while (segmentStart < physicalEnd && block.text[segmentStart] === ' ')
            segmentStart++;
        }
      }
      isFirst = false;
      if (newline < 0) break;
      lineStart = newline + 1;
    }
    return false;
  }

  protected appendVisibleTableRows(
    rows: PreviewRow[],
    block: BlockRecord,
    blockIndex: number,
    width: number,
    firstLocalRow: number,
    endLocalRow: number,
    tableBorders: TableBorderGlyphSet,
  ): void {
    // invariant: Markdown tables align by display cells (src/modules/markdown/markdown.invariants.md)
    const table = block.table;
    if (!table || table.rows.length === 0) return;
    const contentWidths = this.tableContentWidths(
      width,
      table.alignments.length,
    );

    for (
      let localRowIndex = firstLocalRow;
      localRowIndex < endLocalRow;
      localRowIndex++
    ) {
      if (localRowIndex === 1) {
        rows.push(
          this.tableSeparatorRow(
            block,
            blockIndex,
            contentWidths,
            tableBorders,
          ),
        );
        continue;
      }
      const tableRowIndex = localRowIndex === 0 ? 0 : localRowIndex - 1;
      const tableRow = table.rows[tableRowIndex];
      if (!tableRow) continue;
      rows.push(
        this.tableContentRow(
          block,
          blockIndex,
          tableRow,
          tableRowIndex,
          table.alignments,
          contentWidths,
          tableBorders,
        ),
      );
    }
  }

  protected tableContentWidths(width: number, columnCount: number): number[] {
    if (columnCount <= 0) return [];
    const fixedBorderAndPaddingWidth = columnCount * 3 + 1;
    const distributableWidth = Math.max(
      columnCount,
      width - fixedBorderAndPaddingWidth,
    );
    const baseContentWidth = Math.floor(distributableWidth / columnCount);
    const extraColumns = distributableWidth % columnCount;
    return Array.from(
      { length: columnCount },
      (_unused, columnIndex) =>
        baseContentWidth + (columnIndex < extraColumns ? 1 : 0),
    );
  }

  protected tableContentRow(
    block: BlockRecord,
    blockIndex: number,
    cells: readonly TableCellRecord[],
    tableRowIndex: number,
    alignments: readonly TableColumnAlignment[],
    contentWidths: readonly number[],
    tableBorders: TableBorderGlyphSet,
  ): PreviewRow {
    let overrideText = tableBorders.vertical;
    let nextCellColumn = 1;
    const previewCells: PreviewTableCell[] = [];

    for (
      let columnIndex = 0;
      columnIndex < contentWidths.length;
      columnIndex++
    ) {
      const contentWidth = contentWidths[columnIndex]!;
      const cell = cells[columnIndex]!;
      const visibleText = EditorCoordinates.Class.displayColumnWindow(
        cell.text,
        0,
        contentWidth,
      );
      const unusedWidth = Math.max(
        0,
        contentWidth - EditorCoordinates.Class.lineWidth(visibleText),
      );
      const alignment = alignments[columnIndex] ?? 'left';
      const alignmentPadding = this.tableAlignmentPadding(
        alignment,
        unusedWidth,
      );
      const leadingPadding = ` ${' '.repeat(alignmentPadding.left)}`;
      const trailingPadding = `${' '.repeat(alignmentPadding.right)} `;
      const textStartDisplayColumn =
        nextCellColumn + EditorCoordinates.Class.lineWidth(leadingPadding);

      previewCells.push({
        cell,
        cellIndex: columnIndex,
        visibleText,
        leadingPadding,
        trailingPadding,
        textStartDisplayColumn,
      });
      overrideText +=
        leadingPadding + visibleText + trailingPadding + tableBorders.vertical;
      nextCellColumn += contentWidth + 3;
    }

    return {
      block,
      blockIndex,
      textStart: 0,
      textEnd: 0,
      prefix: '',
      suffix: '',
      role: tableRowIndex === 0 ? 'tableHeader' : 'tableBody',
      overrideText,
      tableRowIndex,
      tableCells: previewCells,
      tableBorders,
    };
  }

  protected tableAlignmentPadding(
    alignment: TableColumnAlignment,
    unusedWidth: number,
  ): { left: number; right: number } {
    if (alignment === 'right') return { left: unusedWidth, right: 0 };
    if (alignment === 'center') {
      const left = Math.floor(unusedWidth / 2);
      return { left, right: unusedWidth - left };
    }
    return { left: 0, right: unusedWidth };
  }

  protected tableSeparatorRow(
    block: BlockRecord,
    blockIndex: number,
    contentWidths: readonly number[],
    tableBorders: TableBorderGlyphSet,
  ): PreviewRow {
    const segments = contentWidths.map((contentWidth) =>
      tableBorders.horizontal.repeat(contentWidth + 2),
    );
    return {
      block,
      blockIndex,
      textStart: 0,
      textEnd: 0,
      prefix: '',
      suffix: '',
      role: 'tableSeparator',
      overrideText:
        tableBorders.leftJunction +
        segments.join(tableBorders.intersection) +
        tableBorders.rightJunction,
      tableBorders,
    };
  }

  protected statusRow(text: string): PreviewRow {
    return {
      block: null,
      blockIndex: -1,
      textStart: 0,
      textEnd: 0,
      prefix: '',
      suffix: '',
      role: 'status',
      overrideText: text,
    };
  }
}

export namespace MarkdownPreview {
  export const $Class = Static($MarkdownPreview);
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

export interface RenderTarget {
  requestRender(): void;
}

export type PreviewRowRole =
  | 'content'
  | 'codeBorder'
  | 'codeContent'
  | 'quote'
  | 'tableHeader'
  | 'tableBody'
  | 'tableSeparator'
  | 'rule'
  | 'spacer'
  | 'status';

/** Ephemeral flyweight row. Only rows in the requested viewport are instantiated. */
export interface PreviewRow {
  block: BlockRecord | null;
  blockIndex: number;
  textStart: number;
  textEnd: number;
  prefix: string;
  suffix: string;
  role: PreviewRowRole;
  overrideText?: string;
  tableRowIndex?: number;
  tableCells?: readonly PreviewTableCell[];
  tableBorders?: TableBorderGlyphSet;
}

export interface PreviewTableCell {
  cell: TableCellRecord;
  cellIndex: number;
  visibleText: string;
  leadingPadding: string;
  trailingPadding: string;
  textStartDisplayColumn: number;
}

type EmitRow = (
  block: BlockRecord | null,
  blockIndex: number,
  textStart: number,
  textEnd: number,
  prefix: string,
  suffix: string,
  role: PreviewRowRole,
  overrideText?: string,
) => boolean;
