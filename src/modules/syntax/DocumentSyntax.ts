import type { ProviderRegistry } from '../plugins/ProviderRegistry';
import type {
  DocumentSyntaxReader,
  DocumentSyntaxSource,
  SyntaxDocument,
  SyntaxRegion,
} from './DocumentSyntaxSource.interface';
import { Highlighter, type LangId, type Span } from './Highlighter';
import { LanguageRegistry } from './LanguageRegistry';

// invariant: Document syntax has one removable host port (src/modules/syntax/syntax.invariants.md)
class $DocumentSyntax implements DocumentSyntaxReader {
  constructor(protected readonly providers: ProviderRegistry.Model) {}

  protected readonly sourceSelectionByDocument = new WeakMap<
    SyntaxDocument,
    {
      registryRevision: number;
      source: DocumentSyntaxSource | null;
    }
  >();

  usesSource(document: SyntaxDocument): boolean {
    return this.sourceFor(document) !== null;
  }

  regions(document: SyntaxDocument): readonly SyntaxRegion[] {
    return this.sourceFor(document)?.regions(document) ?? [];
  }

  spansForLine(document: SyntaxDocument, lineIndex: number): readonly Span[] {
    const source = this.sourceFor(document);
    if (source) return source.spansForLine(document, lineIndex);
    return Highlighter.Class.highlightLine(
      document.line(lineIndex),
      LanguageRegistry.Class.forPath(document.path),
    );
  }

  languageAtLine(document: SyntaxDocument, lineIndex: number): LangId {
    return (
      this.sourceFor(document)?.languageAtLine(document, lineIndex) ??
      LanguageRegistry.Class.forPath(document.path)
    );
  }

  statusNotice(document: SyntaxDocument): string | null {
    return this.sourceFor(document)?.statusNotice(document) ?? null;
  }

  revision(document: SyntaxDocument): string {
    const registryRevision = this.providers.revision.value;
    const sourceRevision = this.sourceFor(document)?.sourceRevision?.(document);
    return `${registryRevision}:${sourceRevision ?? 0}`;
  }

  protected sourceFor(document: SyntaxDocument): DocumentSyntaxSource | null {
    const registryRevision = this.providers.revision.value;
    const cached = this.sourceSelectionByDocument.get(document);
    if (cached?.registryRevision === registryRevision) return cached.source;
    const sources = this.providers.resolveAll<DocumentSyntaxSource>(
      'document-syntax-source',
    );
    let source: DocumentSyntaxSource | null = null;
    for (
      let sourceIndex = sources.length - 1;
      sourceIndex >= 0;
      sourceIndex -= 1
    ) {
      const candidate = sources[sourceIndex];
      if (candidate?.supportsDocument(document)) {
        source = candidate;
        break;
      }
    }
    this.sourceSelectionByDocument.set(document, {
      registryRevision,
      source,
    });
    return source;
  }
}

export namespace DocumentSyntax {
  export const $Class = $DocumentSyntax;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
