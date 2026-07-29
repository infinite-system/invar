// invariant: Markdown blocks stay compact (src/modules/markdown/markdown.invariants.md)
import { Static } from 'ivue/extras';

class $MarkdownParser {
  protected static get $inlineStyles(): InlineStyles {
    const inlineStyles: InlineStyles = Object.freeze({
      emphasis: 1,
      strong: 2,
      code: 3,
      link: 4,
    });
    return inlineStyles;
  }

  static get inlineStyles(): InlineStyles {
    return this.$inlineStyles;
  }

  protected static get $emptyNumbers(): readonly number[] {
    const emptyNumbers: readonly number[] = Object.freeze([]);
    return emptyNumbers;
  }

  protected static get $emptyStrings(): readonly string[] {
    const emptyStrings: readonly string[] = Object.freeze([]);
    return emptyStrings;
  }

  parse(text: string, revision = 0): MarkdownParseResult {
    const lines = this.splitSourceLines(text);
    const blocks: BlockRecord[] = [];
    let lineIndex = 0;

    while (lineIndex < lines.length) {
      if (this.isBlank(lines[lineIndex]!.text)) {
        lineIndex++;
        continue;
      }

      const codeEnd = this.readCodeBlock(lines, lineIndex, blocks);
      if (codeEnd !== lineIndex) {
        lineIndex = codeEnd;
        continue;
      }

      const tableEnd = this.readTable(lines, lineIndex, blocks);
      if (tableEnd !== lineIndex) {
        lineIndex = tableEnd;
        continue;
      }

      const headingEnd = this.readHeading(lines, lineIndex, blocks);
      if (headingEnd !== lineIndex) {
        lineIndex = headingEnd;
        continue;
      }

      if (this.isHorizontalRule(lines[lineIndex]!.text)) {
        blocks.push(
          this.createBlock('hr', '─', lineIndex, lineIndex + 1, lines),
        );
        lineIndex++;
        continue;
      }

      const quoteEnd = this.readBlockquote(lines, lineIndex, blocks);
      if (quoteEnd !== lineIndex) {
        lineIndex = quoteEnd;
        continue;
      }

      const listEnd = this.readList(lines, lineIndex, blocks);
      if (listEnd !== lineIndex) {
        lineIndex = listEnd;
        continue;
      }

      lineIndex = this.readParagraph(lines, lineIndex, blocks);
    }

    return { revision, blocks };
  }

  async parseAsync(
    text: string,
    revision: number,
  ): Promise<MarkdownParseResult> {
    await Promise.resolve();
    return this.parse(text, revision);
  }

  dispose(): void {
    // Plain parser currently owns no native handle. The seam remains for a future parser.
  }

  protected splitSourceLines(source: string): SourceLine[] {
    const lines: SourceLine[] = [];
    const expression = /.*(?:\r\n|\n|$)/g;
    let match: RegExpExecArray | null;

    while ((match = expression.exec(source))) {
      if (!match[0] && match.index === source.length) break;
      const raw = match[0];
      const eolLength = raw.endsWith('\r\n') ? 2 : raw.endsWith('\n') ? 1 : 0;
      lines.push({
        text: raw.slice(0, raw.length - eolLength),
        startOffset: match.index,
        endOffset: match.index + raw.length - eolLength,
      });
      if (expression.lastIndex >= source.length) break;
    }

    return lines.length ? lines : [{ text: '', startOffset: 0, endOffset: 0 }];
  }

  protected readCodeBlock(
    lines: readonly SourceLine[],
    startLine: number,
    blocks: BlockRecord[],
  ): number {
    const opening = lines[startLine]!.text.match(
      /^\s*(`{3,}|~{3,})\s*([^\s`]*)\s*$/,
    );
    if (!opening) return startLine;

    const fence = opening[1]!;
    const closingExpression = new RegExp(
      `^\\s*${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`,
    );
    const content: string[] = [];
    let endLine = startLine + 1;
    while (
      endLine < lines.length &&
      !closingExpression.test(lines[endLine]!.text)
    ) {
      content.push(lines[endLine]!.text);
      endLine++;
    }
    if (endLine < lines.length) endLine++;

    const block = this.createBlock(
      'code',
      content.join('\n'),
      startLine,
      endLine,
      lines,
    );
    block.language = opening[2] || undefined;
    blocks.push(block);
    return endLine;
  }

  protected readTable(
    lines: readonly SourceLine[],
    startLine: number,
    blocks: BlockRecord[],
  ): number {
    // invariant: Markdown tables align by display cells (src/modules/markdown/markdown.invariants.md)
    if (
      startLine + 1 >= lines.length ||
      !lines[startLine]!.text.includes('|') ||
      !this.isTableSeparator(lines[startLine + 1]!.text)
    ) {
      return startLine;
    }

    const separatorCells = this.splitTableCells(lines[startLine + 1]!.text);
    const alignments = separatorCells.map((cell) =>
      this.tableAlignmentFor(cell),
    );
    const sourceRows: string[][] = [
      this.splitTableCells(lines[startLine]!.text),
    ];
    let endLine = startLine + 2;
    while (
      endLine < lines.length &&
      !this.isBlank(lines[endLine]!.text) &&
      lines[endLine]!.text.includes('|')
    ) {
      sourceRows.push(this.splitTableCells(lines[endLine]!.text));
      endLine++;
    }

    if (
      alignments.some((alignment) => alignment === null) ||
      sourceRows.some((row) => row.length !== alignments.length)
    ) {
      return startLine;
    }

    const rows = sourceRows.map((row) =>
      row.map((cell) => this.parseTableCell(cell)),
    );
    const block = this.createBlock(
      'table',
      rows.map((row) => row.map((cell) => cell.text).join(' ')).join('\n'),
      startLine,
      endLine,
      lines,
    );
    block.table = {
      alignments: alignments as TableColumnAlignment[],
      rows,
    };
    blocks.push(block);
    return endLine;
  }

  protected readHeading(
    lines: readonly SourceLine[],
    startLine: number,
    blocks: BlockRecord[],
  ): number {
    const atx = lines[startLine]!.text.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (atx) {
      const block = this.createInlineBlock(
        'heading',
        atx[2]!,
        startLine,
        startLine + 1,
        lines,
      );
      block.level = atx[1]!.length;
      blocks.push(block);
      return startLine + 1;
    }

    if (startLine + 1 < lines.length) {
      const setext = lines[startLine + 1]!.text.match(/^\s*(=+|-+)\s*$/);
      if (setext && !this.isBlank(lines[startLine]!.text)) {
        const block = this.createInlineBlock(
          'heading',
          lines[startLine]!.text.trim(),
          startLine,
          startLine + 2,
          lines,
        );
        block.level = setext[1]![0] === '=' ? 1 : 2;
        blocks.push(block);
        return startLine + 2;
      }
    }

    return startLine;
  }

  protected readBlockquote(
    lines: readonly SourceLine[],
    startLine: number,
    blocks: BlockRecord[],
  ): number {
    if (!/^\s*>/.test(lines[startLine]!.text)) return startLine;

    const content: string[] = [];
    let endLine = startLine;
    while (endLine < lines.length && /^\s*>/.test(lines[endLine]!.text)) {
      content.push(lines[endLine]!.text.replace(/^\s*>\s?/, ''));
      endLine++;
    }
    blocks.push(
      this.createInlineBlock(
        'blockquote',
        this.reflowQuoteParagraphs(content),
        startLine,
        endLine,
        lines,
      ),
    );
    return endLine;
  }

  /** Hard-wrapped quote lines reflow like paragraph lines do: runs of non-blank lines join with
   *  a space, and a blank quoted line separates paragraphs inside the quote. */
  protected reflowQuoteParagraphs(content: readonly string[]): string {
    const quoteParagraphs: string[] = [];
    let currentRun: string[] = [];
    for (const contentLine of content) {
      if (contentLine.trim() === '') {
        if (currentRun.length > 0) {
          quoteParagraphs.push(currentRun.join(' '));
          currentRun = [];
        }
        continue;
      }
      currentRun.push(contentLine.trim());
    }
    if (currentRun.length > 0) quoteParagraphs.push(currentRun.join(' '));
    return quoteParagraphs.join('\n\n');
  }

  protected readList(
    lines: readonly SourceLine[],
    startLine: number,
    blocks: BlockRecord[],
  ): number {
    if (!this.matchListItem(lines[startLine]!.text)) return startLine;

    let endLine = startLine;
    const items: BlockRecord[] = [];
    while (endLine < lines.length) {
      const item = this.matchListItem(lines[endLine]!.text);
      if (!item) break;
      const block = this.createInlineBlock(
        'listitem',
        item.text,
        endLine,
        endLine + 1,
        lines,
      );
      block.level = Math.floor(item.indent.length / 2) + 1;
      block.marker = /^\d/.test(item.marker) ? item.marker : '•';
      items.push(block);
      endLine++;
    }

    const container = this.createBlock('list', '', startLine, endLine, lines);
    container.level = Math.min(...items.map((item) => item.level ?? 1));
    blocks.push(container, ...items);
    return endLine;
  }

  protected readParagraph(
    lines: readonly SourceLine[],
    startLine: number,
    blocks: BlockRecord[],
  ): number {
    const content: string[] = [];
    let endLine = startLine;
    while (endLine < lines.length && !this.isBlank(lines[endLine]!.text)) {
      if (endLine > startLine && this.startsBlock(lines, endLine)) break;
      content.push(lines[endLine]!.text.trim());
      endLine++;
    }
    blocks.push(
      this.createInlineBlock(
        'paragraph',
        content.join(' '),
        startLine,
        endLine,
        lines,
      ),
    );
    return endLine;
  }

  protected startsBlock(
    lines: readonly SourceLine[],
    lineIndex: number,
  ): boolean {
    const text = lines[lineIndex]!.text;
    return (
      /^\s*(#{1,6})\s+/.test(text) ||
      /^\s*(`{3,}|~{3,})/.test(text) ||
      /^\s*>/.test(text) ||
      Boolean(this.matchListItem(text)) ||
      this.isHorizontalRule(text) ||
      (lineIndex + 1 < lines.length &&
        text.includes('|') &&
        this.isTableSeparator(lines[lineIndex + 1]!.text))
    );
  }

  protected createInlineBlock(
    kind: BlockKind,
    sourceText: string,
    startLine: number,
    endLine: number,
    lines: readonly SourceLine[],
  ): BlockRecord {
    const inline = this.parseInline(sourceText);
    return this.createBlock(
      kind,
      inline.text,
      startLine,
      endLine,
      lines,
      inline.spans,
      inline.links,
    );
  }

  protected createBlock(
    kind: BlockKind,
    text: string,
    startLine: number,
    endLine: number,
    lines: readonly SourceLine[],
    spans?: readonly number[],
    links?: readonly string[],
  ): BlockRecord {
    const finalLine = lines[Math.max(startLine, endLine - 1)]!;
    const parserClass = this.constructor as typeof $MarkdownParser;
    return {
      kind,
      text,
      spans: spans ?? parserClass.$emptyNumbers,
      links: links ?? parserClass.$emptyStrings,
      range: {
        startLine,
        endLine,
        startOffset: lines[startLine]!.startOffset,
        endOffset: finalLine.endOffset,
      },
    };
  }

  protected parseInline(source: string): InlineResult {
    let output = '';
    const spans: number[] = [];
    const links: string[] = [];
    let sourceIndex = 0;
    const parserClass = this.constructor as typeof $MarkdownParser;
    const inlineStyles = parserClass.inlineStyles;

    while (sourceIndex < source.length) {
      const linkMatch = source
        .slice(sourceIndex)
        .match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
      if (linkMatch) {
        const start = output.length;
        output += linkMatch[1]!;
        links.push(linkMatch[2]!);
        spans.push(start, output.length, inlineStyles.link, links.length);
        sourceIndex += linkMatch[0].length;
        continue;
      }

      const codeMatch = source.slice(sourceIndex).match(/^`([^`]+)`/);
      if (codeMatch) {
        const start = output.length;
        output += codeMatch[1]!;
        spans.push(start, output.length, inlineStyles.code, 0);
        sourceIndex += codeMatch[0].length;
        continue;
      }

      const strongMatch = source.slice(sourceIndex).match(/^(\*\*|__)(.+?)\1/);
      if (strongMatch) {
        const start = output.length;
        output += strongMatch[2]!;
        spans.push(start, output.length, inlineStyles.strong, 0);
        sourceIndex += strongMatch[0].length;
        continue;
      }

      const emphasisMatch = source
        .slice(sourceIndex)
        .match(/^(\*|_)([^*_\n]+?)\1/);
      if (emphasisMatch) {
        const start = output.length;
        output += emphasisMatch[2]!;
        spans.push(start, output.length, inlineStyles.emphasis, 0);
        sourceIndex += emphasisMatch[0].length;
        continue;
      }

      if (source[sourceIndex] === '\\' && sourceIndex + 1 < source.length) {
        output += source[sourceIndex + 1]!;
        sourceIndex += 2;
        continue;
      }

      output += source[sourceIndex]!;
      sourceIndex++;
    }

    return { text: output, spans, links };
  }

  protected matchListItem(
    text: string,
  ): { indent: string; marker: string; text: string } | null {
    const match = text.match(/^(\s*)([-+*]|\d+[.)])\s+(.+)$/);
    return match
      ? { indent: match[1]!, marker: match[2]!, text: match[3]! }
      : null;
  }

  protected isTableSeparator(text: string): boolean {
    const cells = this.splitTableCells(text);
    return (
      cells.length >= 2 &&
      cells.every((cell) => this.tableAlignmentFor(cell) !== null)
    );
  }

  protected splitTableCells(text: string): string[] {
    const trimmedText = text.trim();
    const rowText = trimmedText.replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
    const cells: string[] = [];
    let cellText = '';
    let insideCode = false;

    for (
      let characterIndex = 0;
      characterIndex < rowText.length;
      characterIndex++
    ) {
      const character = rowText[characterIndex]!;
      if (character === '\\' && characterIndex + 1 < rowText.length) {
        cellText += character + rowText[characterIndex + 1]!;
        characterIndex++;
        continue;
      }
      if (character === '`') insideCode = !insideCode;
      if (character === '|' && !insideCode) {
        cells.push(cellText.trim());
        cellText = '';
        continue;
      }
      cellText += character;
    }
    cells.push(cellText.trim());
    return cells;
  }

  protected tableAlignmentFor(cell: string): TableColumnAlignment | null {
    const marker = cell.trim();
    if (!/^:?-{3,}:?$/.test(marker)) return null;
    const startsWithColon = marker.startsWith(':');
    const endsWithColon = marker.endsWith(':');
    if (startsWithColon && endsWithColon) return 'center';
    if (endsWithColon) return 'right';
    return 'left';
  }

  protected parseTableCell(sourceText: string): TableCellRecord {
    const inline = this.parseInline(sourceText);
    return {
      text: inline.text,
      spans: inline.spans,
      links: inline.links,
    };
  }

  protected isHorizontalRule(text: string): boolean {
    return /^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(text);
  }

  protected isBlank(text: string): boolean {
    return /^\s*$/.test(text);
  }
}

export namespace MarkdownParser {
  export const $Class = Static($MarkdownParser);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export type BlockKind =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'listitem'
  | 'code'
  | 'blockquote'
  | 'table'
  | 'hr';

export interface InlineStyles {
  readonly emphasis: number;
  readonly strong: number;
  readonly code: number;
  readonly link: number;
}

export interface BlockRange {
  /** Zero-based, inclusive source line. */
  startLine: number;
  /** Zero-based, exclusive source line. */
  endLine: number;
  /** Inclusive UTF-16 source offset. */
  startOffset: number;
  /** Exclusive UTF-16 source offset. */
  endOffset: number;
}

/**
 * Compact block record. Inline spans are packed as repeated
 * [start, end, inline style, linkIndexPlusOne] integers, never token objects.
 */
export interface BlockRecord {
  kind: BlockKind;
  level?: number;
  marker?: string;
  language?: string;
  text: string;
  spans: readonly number[];
  links: readonly string[];
  table?: TableRecord;
  range: BlockRange;
}

export type TableColumnAlignment = 'left' | 'center' | 'right';

export interface TableCellRecord {
  text: string;
  spans: readonly number[];
  links: readonly string[];
}

export interface TableRecord {
  alignments: readonly TableColumnAlignment[];
  rows: readonly (readonly TableCellRecord[])[];
}

export interface MarkdownParseResult {
  revision: number;
  blocks: readonly BlockRecord[];
}

interface SourceLine {
  text: string;
  startOffset: number;
  endOffset: number;
}

interface InlineResult {
  text: string;
  spans: number[];
  links: string[];
}
