import { expect, test } from 'bun:test';
import { SelectableText } from './SelectableText';

test('selectable text remains constructible through its class seam', () => {
  expect(SelectableText.Class).toBeDefined();
});
