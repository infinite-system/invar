import { expect, test } from 'bun:test';
import { ProviderRegistry } from '../plugins/ProviderRegistry';
import { TextDocument } from '../text/TextDocument';
import type {
  DocumentSyntaxSource,
  SyntaxDocument,
} from './DocumentSyntaxSource.interface';
import { DocumentSyntax } from './DocumentSyntax';

class TestSyntaxSource implements DocumentSyntaxSource {
  readonly identifier = 'document-syntax-source' as const;

  constructor(
    protected readonly extension: string,
    protected readonly marker: string,
  ) {}

  supportsDocument(document: SyntaxDocument): boolean {
    return document.path.endsWith(this.extension);
  }

  regions(): readonly [] {
    return [];
  }

  spansForLine(): readonly [{ text: string; role: 'keyword' }] {
    return [{ text: this.marker, role: 'keyword' }];
  }

  languageAtLine() {
    return 'typescript' as const;
  }

  statusNotice(): string | null {
    return null;
  }
}

test('document syntax selects the newest supporting source and restores fallback', () => {
  const providers = new ProviderRegistry.Class();
  const syntax = new DocumentSyntax.Class(providers);
  const document = new TextDocument.Class();
  document.loadFromText('plain text', '/tmp/document.special');
  const firstSource = new TestSyntaxSource('.special', 'first');
  const decliningSource = new TestSyntaxSource('.other', 'other');

  expect(syntax.languageAtLine(document, 0)).toBe('plain');
  const disposeFirst = providers.register(firstSource.identifier, firstSource);
  const disposeDeclining = providers.register(
    decliningSource.identifier,
    decliningSource,
  );
  expect(syntax.spansForLine(document, 0)).toEqual([
    { text: 'first', role: 'keyword' },
  ]);

  disposeFirst();
  expect(syntax.languageAtLine(document, 0)).toBe('plain');
  disposeDeclining();
  providers.dispose();
});
