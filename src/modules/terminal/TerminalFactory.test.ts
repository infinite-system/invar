import { expect, test } from 'bun:test';
import { TerminalFactory } from './TerminalFactory';

test('terminal construction is published through overridable static methods', () => {
  expect(TerminalFactory.Class.createBackend).toBeFunction();
  expect(TerminalFactory.Class.create).toBeFunction();
});
