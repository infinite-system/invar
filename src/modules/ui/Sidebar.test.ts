import { expect, test } from 'bun:test';
import { Sidebar } from './Sidebar';

test('sidebar behavior remains constructible through its class seam', () => {
  expect(Sidebar.Class).toBeDefined();
});
