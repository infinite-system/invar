import { expect, test } from 'bun:test';
import { Environment } from './Environment';

test('the environment capability exposes the live process directory', () => {
  expect(Environment.Class.cwd).toBe(process.cwd());
});
