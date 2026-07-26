import { expect, test } from 'bun:test';
import { GitPlugin } from './GitPlugin';

test('plugin publishes workspace and application contribution seams', () => {
  const plugin = new GitPlugin.Class();
  expect(plugin.primaryDockContentIdentifiers).toEqual(['git']);
  expect(plugin.workspaceContributor).toBe(plugin);
  expect(plugin.attachWorkspace).toBeFunction();
  expect(plugin.activateApplication).toBeFunction();
});
