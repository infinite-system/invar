import { expect, test } from 'bun:test';
import { MockBackend } from './MockBackend';
import type { TerminalBackend } from './TerminalBackend.interface';
import { TerminalFactory } from './TerminalFactory';

test('terminal construction is published through overridable static methods', () => {
  expect(TerminalFactory.Class.createBackend).toBeFunction();
  expect(TerminalFactory.Class.create).toBeFunction();
});

test('factory-created terminal instances keep independent identifiers and labels', () => {
  class TestTerminalFactory extends TerminalFactory.$Class {
    static override createBackend(): TerminalBackend {
      return new MockBackend.Class();
    }
  }
  const terminal = TestTerminalFactory.create({
    identifier: 'terminal',
    label: 'Terminal',
  });
  const terminalTwo = TestTerminalFactory.create({
    identifier: 'terminal-2',
    label: 'Terminal 2',
  });

  expect(terminal.id).toBe('terminal');
  expect(terminalTwo.id).toBe('terminal-2');
  expect(terminalTwo.instanceLabel).toBe('Terminal 2');
  expect(terminal).not.toBe(terminalTwo);
  terminal.dispose();
  terminalTwo.dispose();
});
