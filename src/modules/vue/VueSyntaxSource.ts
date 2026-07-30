import { parse, type SFCBlock, type SFCDescriptor } from 'vue/compiler-sfc';
import { TextCoordinates } from '../text/TextCoordinates';
import type {
  DocumentSyntaxSource,
  SyntaxDocument,
  SyntaxPosition,
  SyntaxRegion,
} from '../syntax/DocumentSyntaxSource.interface';
import { Highlighter, type LangId, type Span } from '../syntax/Highlighter';
import type {
  WorkspaceContribution,
  WorkspaceProvider,
} from '../workspace/WorkspaceContributor.interface';

interface NormalizedRegion extends SyntaxRegion {
  readonly startOffset: number;
  readonly endOffset: number;
}

interface SyntaxSnapshot {
  readonly revision: number;
  readonly lineStartOffsets: readonly number[];
  readonly regions: readonly NormalizedRegion[];
  readonly notice: string | null;
}

// invariant: Embedded documents have more than one syntax language (src/modules/syntax/syntax.invariants.md)
// invariant: Syntax work follows visible lines and document revisions (src/modules/syntax/syntax.invariants.md)
// invariant: SFC block boundaries come from the SFC grammar (src/modules/vue/vue.invariants.md)
// invariant: Vue syntax is a removable SFC contribution (src/modules/vue/vue.invariants.md)
class $VueSyntaxSource implements DocumentSyntaxSource, WorkspaceContribution {
  readonly identifier = 'document-syntax-source' as const;
  readonly providers: readonly WorkspaceProvider[] = [this];
  protected readonly snapshotsByDocument = new WeakMap<
    SyntaxDocument,
    SyntaxSnapshot
  >();

  supportsDocument(document: SyntaxDocument): boolean {
    return document.path.toLowerCase().endsWith('.vue');
  }

  regions(document: SyntaxDocument): readonly SyntaxRegion[] {
    return this.snapshot(document).regions;
  }

  spansForLine(document: SyntaxDocument, lineIndex: number): readonly Span[] {
    const line = document.line(lineIndex);
    const snapshot = this.snapshot(document);
    const lineStartOffset = snapshot.lineStartOffsets[lineIndex] ?? 0;
    const lineEndOffset = lineStartOffset + line.length;
    const spans: Span[] = [];
    let segmentStartOffset = lineStartOffset;
    for (const region of snapshot.regions) {
      if (
        region.endOffset <= lineStartOffset ||
        region.startOffset >= lineEndOffset
      ) {
        continue;
      }
      const regionStartOffset = Math.max(region.startOffset, lineStartOffset);
      const regionEndOffset = Math.min(region.endOffset, lineEndOffset);
      if (regionStartOffset > segmentStartOffset) {
        spans.push(
          ...this.highlightAbsoluteSegment(
            line,
            lineStartOffset,
            segmentStartOffset,
            regionStartOffset,
            'vue',
          ),
        );
      }
      spans.push(
        ...this.highlightAbsoluteSegment(
          line,
          lineStartOffset,
          regionStartOffset,
          regionEndOffset,
          region.language,
        ),
      );
      segmentStartOffset = Math.max(segmentStartOffset, regionEndOffset);
    }
    if (segmentStartOffset < lineEndOffset) {
      spans.push(
        ...this.highlightAbsoluteSegment(
          line,
          lineStartOffset,
          segmentStartOffset,
          lineEndOffset,
          'vue',
        ),
      );
    }
    return spans.length > 0 ? spans : [{ text: line, role: 'text' }];
  }

  languageAtLine(document: SyntaxDocument, lineIndex: number): LangId {
    const snapshot = this.snapshot(document);
    const lineStartOffset = snapshot.lineStartOffsets[lineIndex] ?? 0;
    const lineEndOffset = lineStartOffset + document.line(lineIndex).length;
    return (
      snapshot.regions.find(
        (region) =>
          region.startOffset <= lineStartOffset &&
          region.endOffset >= lineEndOffset &&
          region.endOffset > region.startOffset,
      )?.language ?? 'vue'
    );
  }

  statusNotice(document: SyntaxDocument): string | null {
    return this.snapshot(document).notice;
  }

  sourceRevision(document: SyntaxDocument): number {
    return this.snapshot(document).revision;
  }

  opened(_root: string): void {}
  suspended(): void {}
  resumed(): void {}
  disposed(): void {}

  protected snapshot(document: SyntaxDocument): SyntaxSnapshot {
    const revision = document.revision.value;
    const cached = this.snapshotsByDocument.get(document);
    if (cached?.revision === revision) return cached;
    const lineStartOffsets = this.buildLineStartOffsets(document);
    let descriptor: SFCDescriptor | null = null;
    let notice: string | null = null;
    try {
      descriptor = this.parseDocument(document.text);
    } catch (error) {
      notice =
        error instanceof Error
          ? `Vue syntax unavailable: ${error.message}`
          : 'Vue syntax unavailable: the SFC parser failed';
    }
    const regions = descriptor
      ? this.normalizedRegions(document, descriptor, lineStartOffsets)
      : [];
    const snapshot = {
      revision,
      lineStartOffsets,
      regions,
      notice,
    };
    this.snapshotsByDocument.set(document, snapshot);
    return snapshot;
  }

  protected parseDocument(text: string): SFCDescriptor {
    return parse(text, { sourceMap: false }).descriptor;
  }

  protected normalizedRegions(
    document: SyntaxDocument,
    descriptor: SFCDescriptor,
    lineStartOffsets: readonly number[],
  ): readonly NormalizedRegion[] {
    const regions: NormalizedRegion[] = [];
    const appendBlock = (
      block: SFCBlock | null | undefined,
      kind: string,
      language: LangId,
    ): void => {
      if (!block) return;
      const startOffset = block.loc.start.offset;
      const endOffset = block.loc.end.offset;
      if (endOffset <= startOffset) return;
      regions.push({
        kind,
        language,
        startOffset,
        endOffset,
        start: this.positionAtOffset(document, lineStartOffsets, startOffset),
        end: this.positionAtOffset(document, lineStartOffsets, endOffset),
      });
    };
    appendBlock(
      descriptor.script,
      'script',
      this.scriptLanguage(descriptor.script?.lang),
    );
    appendBlock(
      descriptor.scriptSetup,
      'script-setup',
      this.scriptLanguage(descriptor.scriptSetup?.lang),
    );
    appendBlock(
      descriptor.template,
      'template',
      this.templateLanguage(descriptor.template?.lang),
    );
    for (const style of descriptor.styles) {
      appendBlock(style, 'style', this.styleLanguage(style.lang));
    }
    for (const customBlock of descriptor.customBlocks) {
      appendBlock(customBlock, customBlock.type, 'plain');
    }
    return regions.toSorted(
      (firstRegion, secondRegion) =>
        firstRegion.startOffset - secondRegion.startOffset,
    );
  }

  protected scriptLanguage(language: string | undefined): LangId {
    if (!language || language === 'js' || language === 'jsx')
      return 'javascript';
    if (language === 'ts' || language === 'tsx') return 'typescript';
    return 'plain';
  }

  protected templateLanguage(language: string | undefined): LangId {
    return !language || language === 'html' ? 'vue' : 'plain';
  }

  protected styleLanguage(language: string | undefined): LangId {
    if (!language || language === 'css') return 'css';
    if (language === 'scss') return 'scss';
    return 'plain';
  }

  protected highlightAbsoluteSegment(
    line: string,
    lineStartOffset: number,
    startOffset: number,
    endOffset: number,
    language: LangId,
  ): readonly Span[] {
    if (endOffset <= startOffset) return [];
    return Highlighter.Class.highlightLine(
      line.slice(startOffset - lineStartOffset, endOffset - lineStartOffset),
      language,
    );
  }

  protected buildLineStartOffsets(document: SyntaxDocument): readonly number[] {
    const lineStartOffsets = new Array<number>(document.lineCount);
    let offset = 0;
    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
      lineStartOffsets[lineIndex] = offset;
      offset += document.line(lineIndex).length;
      if (lineIndex < document.lineCount - 1) offset += document.eol.length;
    }
    return lineStartOffsets;
  }

  protected positionAtOffset(
    document: SyntaxDocument,
    lineStartOffsets: readonly number[],
    offset: number,
  ): SyntaxPosition {
    let low = 0;
    let high = Math.max(0, lineStartOffsets.length - 1);
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((lineStartOffsets[middle] ?? 0) <= offset) low = middle;
      else high = middle - 1;
    }
    const line = low;
    const lineText = document.line(line);
    const utf16Column = Math.max(
      0,
      Math.min(lineText.length, offset - (lineStartOffsets[line] ?? 0)),
    );
    return {
      line,
      column: TextCoordinates.Class.u16ToGrapheme(lineText, utf16Column),
    };
  }
}

export namespace VueSyntaxSource {
  export const $Class = $VueSyntaxSource;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
