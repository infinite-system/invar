import { expect, test } from 'bun:test';
import { CommandDefaults, type CommandContext } from './CommandDefaults';
import type { Command } from './CommandRegistry';

test('default commands expose the registry population capability', () => {
  expect(typeof CommandDefaults.Class.registerDefaultCommands).toBe('function');
});

test('go-to-line is a guarded palette command that opens the shared prompt', () => {
  let registeredCommands: Command[] = [];
  let openCount = 0;
  const registry = {
    registerAll(commands: Command[]) {
      registeredCommands = commands;
      return () => {};
    },
  };
  const context = {
    workspaceSet: {
      active: {
        editor: { hasDocument: { value: true } },
      },
    },
    openGoToLine: () => {
      openCount += 1;
    },
  } as unknown as CommandContext;

  CommandDefaults.Class.registerDefaultCommands(registry as never, context);
  const command = registeredCommands.find(
    (candidate) => candidate.id === 'editor.goToLine',
  );
  expect(command?.title).toBe('Editor: Go to Line');
  expect(command?.when?.()).toBe(true);
  command?.run();
  expect(openCount).toBe(1);
});
