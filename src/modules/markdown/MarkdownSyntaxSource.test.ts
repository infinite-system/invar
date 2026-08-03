import { describe, expect, test } from 'bun:test';
import { ProviderRegistry } from '../plugins/ProviderRegistry';
import { DocumentSyntax } from '../syntax/DocumentSyntax';
import { TextDocument } from '../text/TextDocument';
import { MarkdownSyntaxSource } from './MarkdownSyntaxSource';

function documentFrom(text: string, path = '/tmp/document.md') {
  const document = new TextDocument.Class();
  document.loadFromText(text, path);
  return document;
}

describe('MarkdownSyntaxSource', () => {
  test('supports Markdown extensions and declines other documents', () => {
    const source = new MarkdownSyntaxSource.Class();

    expect(source.supportsDocument(documentFrom('', '/tmp/notes.md'))).toBe(
      true,
    );
    expect(
      source.supportsDocument(documentFrom('', '/tmp/notes.MARKDOWN')),
    ).toBe(true);
    expect(source.supportsDocument(documentFrom('', '/tmp/notes.txt'))).toBe(
      false,
    );
  });

  test('preserves Markdown text while classifying headings lists quotes and code', () => {
    const lines = [
      '# Heading',
      '- item',
      '> quote',
      '```ts',
      'text with `inline code` after it',
    ];
    const document = documentFrom(lines.join('\n'));
    const source = new MarkdownSyntaxSource.Class();

    expect(source.spansForLine(document, 0)).toEqual([
      { text: '# Heading', role: 'keyword' },
    ]);
    expect(source.spansForLine(document, 1)[0]?.role).toBe('operator');
    expect(source.spansForLine(document, 2)[0]?.role).toBe('comment');
    expect(source.spansForLine(document, 3)[0]?.role).toBe('string');
    expect(source.spansForLine(document, 4)).toContainEqual({
      text: '`inline code`',
      role: 'string',
    });
    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
      expect(
        source
          .spansForLine(document, lineIndex)
          .map((span) => span.text)
          .join(''),
      ).toBe(document.line(lineIndex));
    }
  });

  test('provider withdrawal restores the ordinary plain fallback', () => {
    const providers = new ProviderRegistry.Class();
    const syntax = new DocumentSyntax.Class(providers);
    const document = documentFrom('# Heading');
    const source = new MarkdownSyntaxSource.Class();

    expect(syntax.languageAtLine(document, 0)).toBe('plain');
    const disposeSource = providers.register(source.identifier, source);
    expect(syntax.languageAtLine(document, 0)).toBe('markdown');
    expect(syntax.spansForLine(document, 0)[0]?.role).toBe('keyword');

    disposeSource();
    expect(syntax.languageAtLine(document, 0)).toBe('plain');
    expect(syntax.spansForLine(document, 0)).toEqual([
      { text: '# Heading', role: 'text' },
    ]);
    providers.dispose();
  });
});
