import { expect, test } from 'bun:test';
import { AgentPlugin } from './AgentPlugin';

test('Agent panes declare the shared Terminal panel space', () => {
  const plugin = new AgentPlugin.Class();

  expect(plugin.panelSpace).toEqual({ kind: 'terminal', label: 'Terminal' });
});
