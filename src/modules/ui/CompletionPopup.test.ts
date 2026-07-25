import { expect, test } from 'bun:test';
import { ref } from 'vue';
import type {
  LanguageCompletionContext,
  LanguageDocument,
  LanguageProvider,
} from '../lsp/LanguageProvider.interface';
import { CompletionPopup } from './CompletionPopup';

class MockRustProvider implements LanguageProvider {
  readonly completionTriggerCharacters = ['.'];

  async completion(
    _document: LanguageDocument,
    _position: { line: number; column: number },
    _context: LanguageCompletionContext,
  ) {
    return {
      isIncomplete: false,
      items: [
        {
          label: 'push_str',
          kind: 2,
          insertText: null,
          textEdit: null,
          sortText: '01',
          filterText: 'push_str',
        },
        {
          label: 'pop',
          kind: 2,
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
  const provider: LanguageProvider = new MockRustProvider();
  const document: LanguageDocument = {
    path: '/tmp/main.rs',
    text: 'items.p',
    lineCount: 1,
    revision: ref(1),
    line: () => 'items.p',
  };
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
    kind: 10,
    insertText: null,
    textEdit: null,
    sortText: String(index).padStart(4, '0'),
    filterText: null,
  }));

  expect(CompletionPopup.$Class.filterItems(items, 'property14')).toHaveLength(
    111,
  );
});
