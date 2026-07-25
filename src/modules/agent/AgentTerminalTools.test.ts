import { expect, test } from 'bun:test';
import { AgentTerminalTools, type AgentTerminalToolPort } from './AgentTerminalTools';

function terminalPort(): AgentTerminalToolPort {
  return {
    readTerminalInput: () => ({
      currentInputLine: 'printf brokn',
      recentOutputLines: ['previous output'],
    }),
    stageTerminalCommand: async (command) => ({ state: 'staged', command }),
    replaceTerminalInput: async (command) => ({ state: 'staged', command }),
    runTerminalCommand: async (command) => ({ state: 'executed', command }),
  };
}

test('ask mode exposes staging only and its description is an operating manual', () => {
  const definitions = AgentTerminalTools.Class.definitions(false, terminalPort());
  expect(definitions.map((definition) => definition.name)).toEqual([
    'readTerminalInput',
    'stageTerminalCommand',
    'replaceTerminalInput',
  ]);
  expect(definitions[1]?.description).toContain('Default courtesy');
  expect(definitions[1]?.description).toContain('header shows the cwd');
  expect(definitions[1]?.description).toContain('edit the real readline buffer');
  expect(definitions[1]?.description).toContain('Ctrl+C during animated typing');
});

test('read observes input and scrollback while replacement remains staged', async () => {
  const definitions = AgentTerminalTools.Class.definitions(false, terminalPort());
  const readResult = await definitions[0]!.invoke({});
  expect(readResult).toContain('Current terminal input: printf brokn');
  expect(readResult).toContain('previous output');
  const replaceResult = await definitions[2]!.invoke({ command: 'printf fixed' });
  expect(replaceResult).toContain('staged without Enter');
});

test('bypass mode adds visible autonomous execution', async () => {
  const definitions = AgentTerminalTools.Class.definitions(true, terminalPort());
  expect(definitions.map((definition) => definition.name)).toEqual([
    'readTerminalInput',
    'stageTerminalCommand',
    'replaceTerminalInput',
    'runTerminalCommand',
  ]);
  const result = await definitions[3]!.invoke({ command: 'printf hello' });
  expect(result).toContain('sent Enter after the complete command');
});
