import { expect, test } from 'bun:test';
import { Workspace } from '../workspace/Workspace';
import { FileTreePlugin } from './FileTreePlugin';

test('publishes the default dock content and attaches one controller per workspace', () => {
  const plugin = new FileTreePlugin.Class();
  const workspace = new Workspace.Class();

  const contribution = plugin.attachWorkspace(workspace);

  expect(plugin.primaryDockContentIdentifiers).toEqual(['files']);
  expect(plugin.primaryDockFallbackContentIdentifier).toBe('files');
  expect(contribution).toBe(plugin.controllerFor(workspace));
});
