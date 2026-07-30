import { expect, test } from 'bun:test';
import { ProviderRegistry } from '../plugins/ProviderRegistry';
import { TextDocument } from '../text/TextDocument';
import type { DocumentLanguageService } from './DocumentLanguageService.interface';
import type {
  LanguageCompletionContext,
  LanguageCompletionList,
  LanguageDocument,
  LanguageHover,
  LanguageLocation,
  LanguagePosition,
} from './LanguageProvider.interface';
import { LanguageProviderRouter } from './LanguageProviderRouter';

class TestDocumentLanguageService implements DocumentLanguageService {
  readonly identifier = 'document-language-service' as const;

  constructor(
    protected readonly extension: string,
    protected readonly label: string,
  ) {}

  supportsDocument(document: LanguageDocument): boolean {
    return document.path.endsWith(this.extension);
  }

  completionTriggerCharacters(_document: LanguageDocument): readonly string[] {
    return [this.label];
  }

  definition(
    _document: LanguageDocument,
    _position: LanguagePosition,
  ): Promise<LanguageLocation | null> {
    return Promise.resolve(null);
  }

  hover(
    _document: LanguageDocument,
    _position: LanguagePosition,
  ): Promise<LanguageHover | null> {
    return Promise.resolve({
      contents: this.label,
      range: null,
    });
  }

  completion(
    _document: LanguageDocument,
    _position: LanguagePosition,
    _context: LanguageCompletionContext,
  ): Promise<LanguageCompletionList> {
    return Promise.resolve({
      items: [],
      isIncomplete: false,
    });
  }

  diagnosticsAt(): readonly [] {
    return [];
  }

  statusNotice(): string | null {
    return null;
  }

  syncDocument(): void {}
}

test('a newer language service cannot shadow a peer document type', async () => {
  const providers = new ProviderRegistry.Class();
  const router = new LanguageProviderRouter.Class(providers);
  const typeScriptService = new TestDocumentLanguageService('.ts', 'ts');
  const alternateService = new TestDocumentLanguageService('.alt', 'alt');
  const disposeTypeScript = providers.register(
    typeScriptService.identifier,
    typeScriptService,
  );
  const disposeAlternate = providers.register(
    alternateService.identifier,
    alternateService,
  );
  const typeScriptDocument = new TextDocument.Class();
  typeScriptDocument.loadFromText('const value = 1;', '/tmp/value.ts');
  const alternateDocument = new TextDocument.Class();
  alternateDocument.loadFromText('value', '/tmp/value.alt');

  expect(
    (await router.hover(typeScriptDocument, { line: 0, column: 0 }))?.contents,
  ).toBe('ts');
  expect(
    (await router.hover(alternateDocument, { line: 0, column: 0 }))?.contents,
  ).toBe('alt');

  disposeAlternate();
  expect(
    await router.hover(alternateDocument, { line: 0, column: 0 }),
  ).toBeNull();
  expect(
    (await router.hover(typeScriptDocument, { line: 0, column: 0 }))?.contents,
  ).toBe('ts');

  disposeTypeScript();
  providers.dispose();
});
