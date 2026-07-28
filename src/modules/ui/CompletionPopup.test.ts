import { expect, test } from 'bun:test';
import type {
  LanguageCompletionContext,
  LanguageCompletionList,
  LanguageProvider,
} from '../workspace/LanguageProvider.interface';
import { TextDocument } from '../editor/TextDocument';
import { CompletionPopup } from './CompletionPopup';

class MockRustProvider implements Pick<
  LanguageProvider,
  'completion' | 'completionTriggerCharacters'
> {
  readonly completionTriggerCharacters = ['.'];

  async completion(
    _document: TextDocument.Instance,
    _position: { line: number; column: number },
    _context: LanguageCompletionContext,
  ): Promise<LanguageCompletionList> {
    return {
      isIncomplete: false,
      items: [
        {
          label: 'push_str',
          symbolClass: 'callable',
          insertText: null,
          textEdit: null,
          sortText: '01',
          filterText: 'push_str',
        },
        {
          label: 'pop',
          symbolClass: 'callable',
          insertText: 'pop',
          textEdit: null,
          sortText: '02',
          filterText: null,
        },
      ],
    };
  }
}

test('a second provider feeds the same provider-neutral prefix filter', async () => {
  const provider = new MockRustProvider();
  const document = new TextDocument.Class();
  document.loadFromText('items.p', '/tmp/main.rs');
  const result = await provider.completion(
    document,
    { line: 0, column: 7 },
    { triggerKind: 'triggerCharacter', triggerCharacter: '.' },
  );

  expect(
    CompletionPopup.$Class
      .filterItems(result.items, 'push')
      .map((item) => item.label),
  ).toEqual(['push_str']);
  expect(provider.completionTriggerCharacters).toEqual(['.']);
});

test('large completion lists are prefixed once before viewport rendering', () => {
  const items = Array.from({ length: 1_500 }, (_unusedValue, index) => ({
    label: `property${index}`,
    symbolClass: 'value' as const,
    insertText: null,
    textEdit: null,
    sortText: String(index).padStart(4, '0'),
    filterText: null,
  }));

  expect(CompletionPopup.$Class.filterItems(items, 'property14')).toHaveLength(
    111,
  );
});
