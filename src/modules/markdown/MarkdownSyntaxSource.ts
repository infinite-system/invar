import type {
  DocumentSyntaxSource,
  SyntaxDocument,
  SyntaxRegion,
} from '../syntax/DocumentSyntaxSource.interface';
import type { LangId, Span } from '../syntax/Highlighter';

// invariant: Document syntax has one removable host port (src/modules/syntax/syntax.invariants.md)
// invariant: Provider rendezvous is host carried (src/modules/plugins/plugins.invariants.md)
class $MarkdownSyntaxSource implements DocumentSyntaxSource {
  readonly identifier = 'document-syntax-source' as const;

  supportsDocument(document: SyntaxDocument): boolean {
    return /\.(?:md|markdown)$/i.test(document.path);
  }

  regions(_document: SyntaxDocument): readonly SyntaxRegion[] {
    return [];
  }

  spansForLine(document: SyntaxDocument, lineIndex: number): readonly Span[] {
    return this.tokenizeLine(document.line(lineIndex));
  }

  languageAtLine(_document: SyntaxDocument, _lineIndex: number): LangId {
    return 'markdown';
  }

  statusNotice(_document: SyntaxDocument): string | null {
    return null;
  }

  sourceRevision(document: SyntaxDocument): number {
    return document.revision.value;
  }

  protected tokenizeLine(line: string): Span[] {
    if (/^\s*#{1,6}\s/.test(line)) return [{ text: line, role: 'keyword' }];
    if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
      const match = line.match(/^(\s*(?:[-*+]|\d+\.)\s)(.*)$/);
      if (match) {
        return [
          { text: match[1]!, role: 'operator' },
          { text: match[2]!, role: 'text' },
        ];
      }
    }
    if (/^\s*>/.test(line)) return [{ text: line, role: 'comment' }];
    if (/^\s*```/.test(line)) return [{ text: line, role: 'string' }];
    if (line.includes('`')) return this.tokenizeInlineCode(line);
    return [{ text: line, role: 'text' }];
  }

  protected tokenizeInlineCode(line: string): Span[] {
    const spans: Span[] = [];
    const pattern = /`[^`]*`/g;
    let previousEndIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
      if (match.index > previousEndIndex) {
        spans.push({
          text: line.slice(previousEndIndex, match.index),
          role: 'text',
        });
      }
      spans.push({ text: match[0], role: 'string' });
      previousEndIndex = match.index + match[0].length;
    }
    if (previousEndIndex < line.length) {
      spans.push({ text: line.slice(previousEndIndex), role: 'text' });
    }
    return spans.length > 0 ? spans : [{ text: line, role: 'text' }];
  }
}

export namespace MarkdownSyntaxSource {
  export const $Class = $MarkdownSyntaxSource;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
