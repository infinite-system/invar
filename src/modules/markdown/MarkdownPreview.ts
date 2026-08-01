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
import { TextCoordinates } from '../text/TextCoordinates';
import {
  WrapBreakOpportunity,
  type WrapBreakProfile,
} from '../text/WrapBreakOpportunity';
import { StatusChannel } from '../system/StatusChannel';
import type { TableBorderGlyphSet } from '../theme/ThemeIcons';
import { MarkdownStylesheet } from './MarkdownStylesheet';
import { TextViewport } from '../text/TextViewport';

// invariant: Parsing starts only after opening (src/modules/markdown/markdown.invariants.md)
// invariant: Preview rendering follows visible rows (src/modules/markdown/markdown.invariants.md)
// invariant: Explicit jumps use one reading position (src/modules/text/text.invariants.md)
class $MarkdownPreview {
  protected static get $emptyBlocks(): readonly BlockRecord[] {
    const emptyBlocks: readonly BlockRecord[] = Object.freeze([]);
    return emptyBlocks;
  }

  declare $watchEffect: typeof import('vue').watchEffect;
  declare $stopEffects: () => void;

  protected renderTarget: RenderTarget | null = null;
  protected documentOptions: MarkdownDocumentOptions = {};
  protected positionMapRevision = -1;
  protected positionMapWidth = -1;
  protected positionMapValue: MarkdownSourcePositionMap = {
    sourceLines: [],
    renderedRows: [],
    blockIndices: [],
    totalRows: 0,
  };
  protected rowLayoutRevision = -1;
  protected rowLayoutWidth = -1;
  protected wrappedRowOffsetsByBlock = new Map<BlockRecord, Uint32Array>();
  protected contentWidthRevision = -1;
  protected contentWidthViewport = -1;
  protected contentWidthValue = 1;

  get document() {
    return shallowRef<MarkdownDocument.Model | null>(null);
  }
  get active() {
    return ref(false);
  }
  get scrollTop() {
    return ref(0);
  }
  get scrollLeft() {
    return ref(0);
  }
  get wordWrapEnabled() {
    return ref(true);
  }

  toggleWordWrap(): void {
    this.wordWrapEnabled.value = !this.wordWrapEnabled.value;
    this.invalidateRender();
  }

  protected layoutWidth(viewportWidth: number): number {
    const normalizedWidth = Math.max(1, Math.floor(viewportWidth));
    if (this.wordWrapEnabled.value) return normalizedWidth;
    return this.blocks.reduce(
      (widestWidth, block) =>
        Math.max(widestWidth, TextCoordinates.Class.lineWidth(block.text) + 8),
      normalizedWidth,
    );
  }

  get blocks(): readonly BlockRecord[] {
    const previewClass = this.constructor as typeof $MarkdownPreview;
    return this.document.value?.blocks.value ?? previewClass.$emptyBlocks;
  }

  get parsedRevision(): number {
    return this.document.value?.revision.value ?? -1;
  }

  referenceTargets(): string[] {
    const targets: string[] = [];
    for (const block of this.blocks) {
      targets.push(...block.links);
      for (const row of block.table?.rows ?? []) {
        for (const cell of row) targets.push(...cell.links);
      }
    }
    return targets;
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
    this.scrollLeft.value = 0;
    this.active.value = true;
    document.open();
    this.$watchEffect(() => this.invalidateRender());
    StatusChannel.Class.update({
      markdownPreviewOpen: true,
      markdownScrollTop: 0,
      markdownScrollLeft: 0,
    });
  }

  // invariant: Closing releases all preview work (src/modules/markdown/markdown.invariants.md)
  close(): void {
    const target = this.renderTarget;
    this.document.value?.close();
    this.document.value = null;
    this.active.value = false;
    this.scrollTop.value = 0;
    this.scrollLeft.value = 0;
    this.renderTarget = null;
    this.documentOptions = {};
    this.$stopEffects();
    target?.requestRender();
    StatusChannel.Class.update({
      markdownPreviewOpen: false,
      markdownScrollTop: 0,
      markdownScrollLeft: 0,
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

  scrollHorizontallyTo(column: number, width: number): void {
    const maximum = Math.max(0, this.totalColumns(width) - Math.max(1, width));
    this.scrollLeft.value = Math.max(0, Math.min(maximum, column));
    StatusChannel.Class.update({ markdownScrollLeft: this.scrollLeft.value });
  }

  /** The first rendered row generated by the source block that contains `sourceLine`. */
  firstRenderedRowForSourceLine(
    sourceLine: number,
    width: number,
  ): number | null {
    const positionMap = this.sourcePositionMap(width);
    if (positionMap.sourceLines.length === 0) return null;
    const anchorIndex = this.lowerAnchorIndex(
      sourceLine,
      positionMap.sourceLines,
    );
    return positionMap.renderedRows[anchorIndex] ?? null;
  }

  /** Map a source line to its continuous rendered reading position between block anchors. */
  renderedRowForSourceLine(sourceLine: number, width: number): number | null {
    const positionMap = this.sourcePositionMap(width);
    return this.interpolatePosition(
      sourceLine,
      positionMap.sourceLines,
      positionMap.renderedRows,
    );
  }

  /** Map a rendered row back to its continuous source reading position between block anchors. */
  sourceLineForRenderedRow(renderedRow: number, width: number): number | null {
    const positionMap = this.sourcePositionMap(width);
    return this.interpolatePosition(
      renderedRow,
      positionMap.renderedRows,
      positionMap.sourceLines,
    );
  }

  protected sourcePositionMap(width: number): MarkdownSourcePositionMap {
    const normalizedWidth = this.layoutWidth(width);
    if (
      this.positionMapRevision === this.parsedRevision &&
      this.positionMapWidth === normalizedWidth
    ) {
      return this.positionMapValue;
    }
    this.prepareRowLayoutCache(normalizedWidth);

    const stylesheet = MarkdownStylesheet.Class;
    const sourceLines: number[] = [];
    const renderedRows: number[] = [];
    const blockIndices: number[] = [];
    let rowIndex = 0;
    let previousBlock: BlockRecord | null = null;
    let finalSourceLine = 0;

    for (let blockIndex = 0; blockIndex < this.blocks.length; blockIndex++) {
      const block = this.blocks[blockIndex]!;
      if (block.kind === 'list') continue;
      rowIndex += stylesheet.spacingBetweenBlocks(previousBlock, block);
      previousBlock = block;
      if (
        sourceLines.length === 0 ||
        block.range.startLine > sourceLines[sourceLines.length - 1]!
      ) {
        sourceLines.push(block.range.startLine);
        renderedRows.push(rowIndex);
        blockIndices.push(blockIndex);
      }
      rowIndex += this.rowCountForBlock(block, normalizedWidth);
      finalSourceLine = Math.max(finalSourceLine, block.range.endLine);
    }
    if (previousBlock !== null) {
      rowIndex += stylesheet.spacingBetweenBlocks(previousBlock, null);
    }
    if (
      sourceLines.length > 0 &&
      finalSourceLine > sourceLines[sourceLines.length - 1]!
    ) {
      sourceLines.push(finalSourceLine);
      renderedRows.push(rowIndex);
      blockIndices.push(this.blocks.length);
    }

    this.positionMapRevision = this.parsedRevision;
    this.positionMapWidth = normalizedWidth;
    this.positionMapValue = {
      sourceLines,
      renderedRows,
      blockIndices,
      totalRows: rowIndex,
    };
    return this.positionMapValue;
  }

  protected prepareRowLayoutCache(width: number): void {
    if (
      this.rowLayoutRevision === this.parsedRevision &&
      this.rowLayoutWidth === width
    ) {
      return;
    }
    this.rowLayoutRevision = this.parsedRevision;
    this.rowLayoutWidth = width;
    this.wrappedRowOffsetsByBlock.clear();
  }

  protected interpolatePosition(
    position: number,
    inputAnchors: readonly number[],
    outputAnchors: readonly number[],
  ): number | null {
    if (
      inputAnchors.length === 0 ||
      inputAnchors.length !== outputAnchors.length
    )
      return null;
    const lowerAnchorIndex = this.lowerAnchorIndex(position, inputAnchors);
    const upperAnchorIndex = Math.min(
      inputAnchors.length - 1,
      lowerAnchorIndex + 1,
    );
    const lowerInput = inputAnchors[lowerAnchorIndex]!;
    const lowerOutput = outputAnchors[lowerAnchorIndex]!;
    if (upperAnchorIndex === lowerAnchorIndex) return lowerOutput;
    const upperInput = inputAnchors[upperAnchorIndex]!;
    const upperOutput = outputAnchors[upperAnchorIndex]!;
    if (upperInput === lowerInput) return lowerOutput;
    const interpolation =
      (Math.max(lowerInput, Math.min(upperInput, position)) - lowerInput) /
      (upperInput - lowerInput);
    return Math.round(
      lowerOutput + (upperOutput - lowerOutput) * interpolation,
    );
  }

  protected lowerAnchorIndex(
    position: number,
    anchors: readonly number[],
  ): number {
    let lowerBound = 0;
    let upperBound = Math.max(0, anchors.length - 1);
    while (lowerBound < upperBound) {
      const middle = Math.ceil((lowerBound + upperBound) / 2);
      if (anchors[middle]! <= position) lowerBound = middle;
      else upperBound = middle - 1;
    }
    return lowerBound;
  }

  /** Reveal the rendered block for a source jump at the shared reading position. */
  revealSourceLine(sourceLine: number, width: number, height: number): boolean {
    const targetRow = this.firstRenderedRowForSourceLine(sourceLine, width);
    if (targetRow === null) return false;
    const totalRows = this.totalRows(width);
    const nextScrollTop = TextViewport.Class.scrollTopForTarget(
      targetRow,
      this.scrollTop.value,
      height,
      totalRows,
      'reading',
    );
    this.scrollTo(nextScrollTop, width, height);
    return true;
  }

  // invariant: Preview rendering follows visible rows (src/modules/markdown/markdown.invariants.md)
  visibleRows(
    width: number,
    height: number,
    tableBorders: TableBorderGlyphSet,
  ): PreviewRow[] {
    const document = this.document.value;
    const rowWidth = this.layoutWidth(width);
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
    const rowWidth = this.layoutWidth(width);
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

  // invariant: Markdown presentation resolves through one stylesheet (src/modules/markdown/markdown.invariants.md)
  totalRows(width: number): number {
    const document = this.document.value;
    if (!document) return 0;
    const rowWidth = this.layoutWidth(width);
    return this.sourcePositionMap(rowWidth).totalRows;
  }

  /** The widest rendered row. Prose and tables stay viewport-bound; fenced code may overflow. */
  totalColumns(width: number): number {
    const normalizedWidth = this.layoutWidth(width);
    if (
      this.contentWidthRevision === this.parsedRevision &&
      this.contentWidthViewport === normalizedWidth
    ) {
      return this.contentWidthValue;
    }
    let contentWidth = normalizedWidth;
    for (const block of this.blocks) {
      if (block.kind === 'code') {
        contentWidth = Math.max(
          contentWidth,
          this.codeRowWidth(block, normalizedWidth),
        );
      }
    }
    this.contentWidthRevision = this.parsedRevision;
    this.contentWidthViewport = normalizedWidth;
    this.contentWidthValue = contentWidth;
    return contentWidth;
  }

  protected createDocument(source: MarkdownSource): MarkdownDocument.Model {
    return new MarkdownDocument.Class(source, this.documentOptions);
  }

  protected invalidateRender(): void {
    void this.active.value;
    void this.scrollTop.value;
    void this.scrollLeft.value;
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
    const stylesheet = MarkdownStylesheet.Class;
    const rows: PreviewRow[] = [];
    let rowIndex = 0;
    const endVisible = firstVisible + visibleCount;
    let previousBlock: BlockRecord | null = null;
    let firstBlockIndex = 0;
    let initialBlockSpacingIsCounted = false;
    const positionMap = this.sourcePositionMap(width);
    if (
      positionMap.renderedRows.length > 0 &&
      firstVisible >= positionMap.renderedRows[0]!
    ) {
      const anchorIndex = this.lowerAnchorIndex(
        firstVisible,
        positionMap.renderedRows,
      );
      firstBlockIndex = Math.min(
        blocks.length,
        positionMap.blockIndices[anchorIndex] ?? 0,
      );
      rowIndex = positionMap.renderedRows[anchorIndex] ?? 0;
      initialBlockSpacingIsCounted = true;
    }
    const pushSpacers = (spacerCount: number): void => {
      for (let spacerIndex = 0; spacerIndex < spacerCount; spacerIndex++) {
        if (rowIndex >= firstVisible && rowIndex < endVisible) {
          rows.push(this.spacerRow());
        }
        rowIndex++;
      }
    };

    for (
      let blockIndex = firstBlockIndex;
      blockIndex < blocks.length;
      blockIndex++
    ) {
      const block = blocks[blockIndex]!;
      if (block.kind === 'list') continue;
      if (!initialBlockSpacingIsCounted) {
        pushSpacers(stylesheet.spacingBetweenBlocks(previousBlock, block));
      }
      initialBlockSpacingIsCounted = false;
      previousBlock = block;
      if (rowIndex >= endVisible) break;
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
          const firstLocalRow = Math.max(0, firstVisible - rowIndex);
          const endLocalRow = Math.min(blockRowCount, endVisible - rowIndex);
          let blockLocalRow = firstLocalRow;
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
          this.visitBlock(
            block,
            blockIndex,
            width,
            emit,
            firstLocalRow,
            endLocalRow,
          );
        }
      }

      rowIndex = blockEndRow;
      if (rowIndex >= endVisible) break;
    }
    if (previousBlock !== null && rowIndex < endVisible) {
      pushSpacers(stylesheet.spacingBetweenBlocks(previousBlock, null));
    }
    return rows;
  }

  protected spacerRow(): PreviewRow {
    return {
      block: null,
      blockIndex: -1,
      textStart: 0,
      textEnd: 0,
      prefix: '',
      suffix: '',
      role: 'spacer',
    };
  }

  protected rowCountForBlock(block: BlockRecord, width: number): number {
    if (block.kind === 'table') return (block.table?.rows.length ?? 0) + 1;
    if (block.kind !== 'code' && block.kind !== 'hr') {
      const configuration = this.wrappedVisitConfiguration(block, width);
      return (
        this.wrappedRowOffsets(
          block,
          configuration.availableWidth,
          configuration.options,
        ).length / 2
      );
    }
    let rowCount = 0;
    this.visitBlock(block, -1, width, () => {
      rowCount++;
      return false;
    });
    return rowCount;
  }

  // invariant: Markdown presentation resolves through one stylesheet (src/modules/markdown/markdown.invariants.md)
  protected visitBlock(
    block: BlockRecord,
    blockIndex: number,
    width: number,
    emit: EmitRow,
    firstLocalRow = 0,
    endLocalRow = Number.MAX_SAFE_INTEGER,
  ): boolean {
    const stylesheet = MarkdownStylesheet.Class;
    const panePaddingText = stylesheet.panePaddingText;
    switch (block.kind) {
      case 'code':
        return this.visitCode(block, blockIndex, width, emit);
      case 'table':
        return false;
      case 'hr': {
        const ruleWidth = Math.max(
          0,
          width - panePaddingText.length - stylesheet.panePadding.right,
        );
        return emit(
          block,
          blockIndex,
          0,
          0,
          '',
          '',
          'rule',
          panePaddingText + stylesheet.vocabulary.ruleGlyph.repeat(ruleWidth),
        );
      }
      default: {
        const configuration = this.wrappedVisitConfiguration(block, width);
        return this.visitWrapped(
          block,
          blockIndex,
          configuration.availableWidth,
          emit,
          configuration.options,
          firstLocalRow,
          endLocalRow,
        );
      }
    }
  }

  protected wrappedVisitConfiguration(
    block: BlockRecord,
    width: number,
  ): WrappedVisitConfiguration {
    const stylesheet = MarkdownStylesheet.Class;
    const panePaddingText = stylesheet.panePaddingText;
    const innerWidth = Math.max(1, width - stylesheet.panePadding.right);
    if (block.kind === 'blockquote') {
      const quotePrefix =
        panePaddingText + stylesheet.vocabulary.quoteBarPrefix;
      return {
        availableWidth: innerWidth,
        options: {
          firstPrefix: quotePrefix,
          continuationPrefix: quotePrefix,
          suffix: '',
          role: 'quote',
          breakProfile: 'prose',
          fillWidth: false,
        },
      };
    }
    if (block.kind === 'listitem') {
      const indentation = stylesheet.listIndentText(block.level);
      const marker = block.marker ?? stylesheet.vocabulary.listMarkerFallback;
      const firstPrefix = `${panePaddingText}${indentation}${marker} `;
      return {
        availableWidth: innerWidth,
        options: {
          firstPrefix,
          continuationPrefix: ' '.repeat(firstPrefix.length),
          suffix: '',
          role: 'content',
          breakProfile: 'prose',
          fillWidth: false,
        },
      };
    }
    return {
      availableWidth: innerWidth,
      options: {
        firstPrefix: panePaddingText,
        continuationPrefix: panePaddingText,
        suffix: '',
        role: 'content',
        breakProfile: 'prose',
        fillWidth: false,
      },
    };
  }

  protected visitCode(
    block: BlockRecord,
    blockIndex: number,
    width: number,
    emit: EmitRow,
  ): boolean {
    const stylesheet = MarkdownStylesheet.Class;
    const panePaddingText = stylesheet.panePaddingText;
    const frame = stylesheet.vocabulary.codeFrame;
    const codeRowWidth = this.codeRowWidth(block, width);
    const frameWidth = Math.max(
      2,
      codeRowWidth - TextCoordinates.Class.lineWidth(panePaddingText),
    );
    const label = block.language ? ` ${block.language} ` : '';
    const topFill = Math.max(0, frameWidth - 2 - label.length);
    if (
      emit(
        block,
        blockIndex,
        0,
        0,
        '',
        '',
        'codeBorder',
        `${panePaddingText}${frame.topLeft}${label}${frame.horizontal.repeat(topFill)}${frame.topRight}`,
      )
    ) {
      return true;
    }
    const framePrefix = `${panePaddingText}${frame.vertical} `;
    const frameSuffix = ` ${frame.vertical}`;
    const contentWidth = Math.max(
      1,
      codeRowWidth -
        TextCoordinates.Class.lineWidth(framePrefix) -
        TextCoordinates.Class.lineWidth(frameSuffix),
    );
    let lineStart = 0;
    while (lineStart <= block.text.length) {
      const newline = block.text.indexOf('\n', lineStart);
      const lineEnd = newline < 0 ? block.text.length : newline;
      const lineWidth = TextCoordinates.Class.lineWidth(
        block.text.slice(lineStart, lineEnd),
      );
      if (
        emit(
          block,
          blockIndex,
          lineStart,
          lineEnd,
          framePrefix,
          ' '.repeat(Math.max(0, contentWidth - lineWidth)) + frameSuffix,
          'codeContent',
        )
      ) {
        return true;
      }
      if (newline < 0) break;
      lineStart = newline + 1;
    }
    return emit(
      block,
      blockIndex,
      0,
      0,
      '',
      '',
      'codeBorder',
      `${panePaddingText}${frame.bottomLeft}${frame.horizontal.repeat(Math.max(0, frameWidth - 2))}${frame.bottomRight}`,
    );
  }

  protected codeRowWidth(block: BlockRecord, viewportWidth: number): number {
    const stylesheet = MarkdownStylesheet.Class;
    const frameOverhead =
      TextCoordinates.Class.lineWidth(stylesheet.panePaddingText) + 4;
    return Math.max(
      1,
      Math.max(1, viewportWidth - stylesheet.panePadding.right),
      frameOverhead + this.maximumPhysicalLineWidth(block.text),
    );
  }

  protected maximumPhysicalLineWidth(text: string): number {
    let maximumWidth = 0;
    let lineStart = 0;
    while (lineStart <= text.length) {
      const newline = text.indexOf('\n', lineStart);
      const lineEnd = newline < 0 ? text.length : newline;
      maximumWidth = Math.max(
        maximumWidth,
        TextCoordinates.Class.lineWidth(text.slice(lineStart, lineEnd)),
      );
      if (newline < 0) break;
      lineStart = newline + 1;
    }
    return maximumWidth;
  }

  // invariant: Wrapped surfaces share one break generator (project.invariants.md)
  protected visitWrapped(
    block: BlockRecord,
    blockIndex: number,
    availableWidth: number,
    emit: EmitRow,
    options: WrappedVisitOptions,
    firstLocalRow = 0,
    endLocalRow = Number.MAX_SAFE_INTEGER,
  ): boolean {
    const rowOffsets = this.wrappedRowOffsets(block, availableWidth, options);
    const rowCount = rowOffsets.length / 2;
    const lastLocalRow = Math.min(rowCount, endLocalRow);
    for (
      let localRowIndex = firstLocalRow;
      localRowIndex < lastLocalRow;
      localRowIndex++
    ) {
      const textStart = rowOffsets[localRowIndex * 2]!;
      const textEnd = rowOffsets[localRowIndex * 2 + 1]!;
      const prefix =
        localRowIndex === 0 ? options.firstPrefix : options.continuationPrefix;
      const segmentWidth = TextCoordinates.Class.lineWidth(
        block.text.slice(textStart, textEnd),
      );
      const suffix = options.fillWidth
        ? ' '.repeat(
            Math.max(
              0,
              this.wrappedContentWidth(availableWidth, options) - segmentWidth,
            ),
          ) + options.suffix
        : options.suffix;
      if (
        emit(
          block,
          blockIndex,
          textStart,
          textEnd,
          prefix,
          suffix,
          options.role,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  protected wrappedRowOffsets(
    block: BlockRecord,
    availableWidth: number,
    options: WrappedVisitOptions,
  ): Uint32Array {
    const cachedOffsets = this.wrappedRowOffsetsByBlock.get(block);
    if (cachedOffsets) return cachedOffsets;
    const rowOffsets: number[] = [];
    const contentWidth = Math.max(
      1,
      availableWidth -
        TextCoordinates.Class.lineWidth(options.firstPrefix) -
        TextCoordinates.Class.lineWidth(options.suffix),
    );
    let lineStart = 0;
    let isFirstLine = true;

    while (lineStart <= block.text.length) {
      const newline = block.text.indexOf('\n', lineStart);
      const physicalEnd = newline < 0 ? block.text.length : newline;
      if (
        this.visitWrappedLine(
          block,
          -1,
          lineStart,
          physicalEnd,
          contentWidth,
          isFirstLine,
          (_emittedBlock, _emittedBlockIndex, textStart, textEnd) => {
            rowOffsets.push(textStart, textEnd);
            return false;
          },
          options,
        )
      ) {
        break;
      }
      isFirstLine = false;
      if (newline < 0) break;
      lineStart = newline + 1;
    }
    const packedOffsets = Uint32Array.from(rowOffsets);
    this.wrappedRowOffsetsByBlock.set(block, packedOffsets);
    return packedOffsets;
  }

  protected wrappedContentWidth(
    availableWidth: number,
    options: WrappedVisitOptions,
  ): number {
    return Math.max(
      1,
      availableWidth -
        TextCoordinates.Class.lineWidth(options.firstPrefix) -
        TextCoordinates.Class.lineWidth(options.suffix),
    );
  }

  protected visitWrappedLine(
    block: BlockRecord,
    blockIndex: number,
    lineStart: number,
    physicalEnd: number,
    contentWidth: number,
    isFirstLine: boolean,
    emit: EmitRow,
    options: WrappedVisitOptions,
  ): boolean {
    const rowSuffix = (segmentWidth: number): string =>
      options.fillWidth
        ? ' '.repeat(Math.max(0, contentWidth - segmentWidth)) + options.suffix
        : options.suffix;

    if (physicalEnd === lineStart) {
      return emit(
        block,
        blockIndex,
        lineStart,
        lineStart,
        isFirstLine ? options.firstPrefix : options.continuationPrefix,
        rowSuffix(0),
        options.role,
      );
    }

    const lineText = block.text.slice(lineStart, physicalEnd);
    const graphemes = TextCoordinates.Class.graphemes(lineText);
    const utf16Offsets: number[] = new Array(graphemes.length + 1);
    utf16Offsets[0] = 0;
    for (
      let graphemeIndex = 0;
      graphemeIndex < graphemes.length;
      graphemeIndex++
    ) {
      utf16Offsets[graphemeIndex + 1] =
        utf16Offsets[graphemeIndex]! + graphemes[graphemeIndex]!.length;
    }

    let segmentStart = 0;
    let isFirstSegment = isFirstLine;
    while (segmentStart < graphemes.length) {
      let segmentEnd = segmentStart;
      let segmentWidth = 0;
      while (segmentEnd < graphemes.length) {
        const graphemeWidth = TextCoordinates.Class.lineWidth(
          graphemes[segmentEnd]!,
        );
        if (
          segmentEnd > segmentStart &&
          segmentWidth + graphemeWidth > contentWidth
        ) {
          break;
        }
        segmentWidth += graphemeWidth;
        segmentEnd++;
      }
      if (segmentEnd < graphemes.length) {
        const preferredBreak =
          WrapBreakOpportunity.Class.previousBreakOpportunity(
            graphemes,
            segmentStart,
            segmentEnd,
            options.breakProfile,
          );
        if (preferredBreak > segmentStart && preferredBreak < segmentEnd) {
          segmentEnd = preferredBreak;
          segmentWidth = 0;
          for (
            let graphemeIndex = segmentStart;
            graphemeIndex < segmentEnd;
            graphemeIndex++
          ) {
            segmentWidth += TextCoordinates.Class.lineWidth(
              graphemes[graphemeIndex]!,
            );
          }
        }
      }
      if (
        emit(
          block,
          blockIndex,
          lineStart + utf16Offsets[segmentStart]!,
          lineStart + utf16Offsets[segmentEnd]!,
          isFirstSegment ? options.firstPrefix : options.continuationPrefix,
          rowSuffix(segmentWidth),
          options.role,
        )
      ) {
        return true;
      }
      isFirstSegment = false;
      segmentStart = segmentEnd;
      while (
        segmentStart < graphemes.length &&
        WrapBreakOpportunity.Class.breakKindBetween(
          graphemes[segmentStart]!,
          undefined,
          options.breakProfile,
        ) === 'whitespace'
      ) {
        segmentStart++;
      }
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
    const panePadding = MarkdownStylesheet.Class.panePadding;
    const contentWidths = this.tableContentWidths(
      Math.max(1, width - panePadding.left - panePadding.right),
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
    const panePaddingText = MarkdownStylesheet.Class.panePaddingText;
    let overrideText = panePaddingText + tableBorders.vertical;
    let nextCellColumn = panePaddingText.length + 1;
    const previewCells: PreviewTableCell[] = [];

    for (
      let columnIndex = 0;
      columnIndex < contentWidths.length;
      columnIndex++
    ) {
      const contentWidth = contentWidths[columnIndex]!;
      const cell = cells[columnIndex]!;
      const visibleText = TextCoordinates.Class.displayColumnWindow(
        cell.text,
        0,
        contentWidth,
      );
      const unusedWidth = Math.max(
        0,
        contentWidth - TextCoordinates.Class.lineWidth(visibleText),
      );
      const alignment = alignments[columnIndex] ?? 'left';
      const alignmentPadding = this.tableAlignmentPadding(
        alignment,
        unusedWidth,
      );
      const leadingPadding = ` ${' '.repeat(alignmentPadding.left)}`;
      const trailingPadding = `${' '.repeat(alignmentPadding.right)} `;
      const textStartDisplayColumn =
        nextCellColumn + TextCoordinates.Class.lineWidth(leadingPadding);

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
        MarkdownStylesheet.Class.panePaddingText +
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
      overrideText: MarkdownStylesheet.Class.panePaddingText + text,
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

interface WrappedVisitOptions {
  readonly firstPrefix: string;
  readonly continuationPrefix: string;
  /** Painted after the row text; with fillWidth the row is space-padded to contentWidth first
   *  so a right frame edge stays on one column. */
  readonly suffix: string;
  readonly role: PreviewRowRole;
  readonly breakProfile: WrapBreakProfile;
  readonly fillWidth: boolean;
}

interface WrappedVisitConfiguration {
  readonly availableWidth: number;
  readonly options: WrappedVisitOptions;
}

interface MarkdownSourcePositionMap {
  readonly sourceLines: readonly number[];
  readonly renderedRows: readonly number[];
  readonly blockIndices: readonly number[];
  readonly totalRows: number;
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
