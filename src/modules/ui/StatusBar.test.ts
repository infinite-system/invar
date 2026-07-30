import { expect, test } from 'bun:test';
import { StatusBar } from './StatusBar';

test('status bar behavior remains constructible through its class seam', () => {
  expect(StatusBar.Class).toBeDefined();
});

test('status composition owns exactly one left margin', () => {
  expect(StatusBar.Class.composeStatusText(['project', 'file.ts'])).toBe(
    ' project  ·  file.ts',
  );
  expect(StatusBar.Class.composeStatusText([])).toBe('');
});
