import { expect, test } from 'bun:test';
import { EditorContentMount } from './EditorContentMount';

test('editor content mounting remains constructible through its class seam', () => {
  expect(EditorContentMount.Class).toBeDefined();
});
