import { expect, test } from 'bun:test';
import { Workspace } from '../workspace/Workspace';
import type { DatabaseProvider } from './DatabaseProvider.interface';
import { DatabaseProviderPlugin } from './DatabaseProviderPlugin';

test('the provider plugin registers per workspace and withdraws on dispose', () => {
  const workspace = new Workspace.Class();
  const plugin = new DatabaseProviderPlugin.Class();
  const contribution = plugin.attachWorkspace(workspace);

  expect(
    workspace.providers.resolve<DatabaseProvider>('database')
      ?.implementationIdentifier,
  ).toBe('sqlite');

  contribution.disposed();
  expect(workspace.providers.resolve<DatabaseProvider>('database')).toBeNull();

  const reinstalled = plugin.attachWorkspace(workspace);
  expect(
    workspace.providers.resolve<DatabaseProvider>('database')
      ?.implementationIdentifier,
  ).toBe('sqlite');
  reinstalled.disposed();
  workspace.dispose();
});
