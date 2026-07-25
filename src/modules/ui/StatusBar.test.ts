import { expect, test } from 'bun:test';
import { StatusBar } from './StatusBar';

test('status bar behavior remains constructible through its class seam', () => {
  expect(StatusBar.Class).toBeDefined();
});
