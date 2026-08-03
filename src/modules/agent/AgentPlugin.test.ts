import { expect, test } from 'bun:test';
import { AgentPlugin } from './AgentPlugin';

test('Agent panes declare the shared Terminal panel space and lead its default split', () => {
  const plugin = new AgentPlugin.Class();

  expect(plugin.panelSpace).toEqual({ kind: 'terminal', label: 'Terminal' });
  expect(plugin.defaultSplitPriority).toBe(0);
  expect(plugin.paneAddMenuEntries).toEqual([
    {
      identifier: 'invar-agent',
      label: 'Terminal (Invar agent)',
      instanceLabel: 'Terminal (Invar agent)',
      spaceKind: 'terminal',
    },
  ]);
});
