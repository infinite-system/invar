import { expect, test } from 'bun:test';
import { AgentTerminalTools, type AgentTerminalToolPort } from './AgentTerminalTools';

function terminalPort(): AgentTerminalToolPort {
  return {
    stageTerminalCommand: async (command) => ({ state: 'staged', command }),
    runTerminalCommand: async (command) => ({ state: 'executed', command }),
  };
}

test('ask mode exposes staging only and its description is an operating manual', () => {
  const definitions = AgentTerminalTools.Class.definitions(false, terminalPort());
  expect(definitions.map((definition) => definition.name)).toEqual([
    'stageTerminalCommand',
  ]);
  expect(definitions[0]?.description).toContain('Default courtesy');
  expect(definitions[0]?.description).toContain('header shows the cwd');
  expect(definitions[0]?.description).toContain('edit the real readline buffer');
  expect(definitions[0]?.description).toContain('Ctrl+C during animated typing');
});

test('bypass mode adds visible autonomous execution', async () => {
  const definitions = AgentTerminalTools.Class.definitions(true, terminalPort());
  expect(definitions.map((definition) => definition.name)).toEqual([
    'stageTerminalCommand',
    'runTerminalCommand',
  ]);
  const result = await definitions[1]!.invoke({ command: 'printf hello' });
  expect(result).toContain('sent Enter after the complete command');
});
