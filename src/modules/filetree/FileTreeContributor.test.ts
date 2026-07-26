import { expect, test } from 'bun:test';
import { Workspace } from '../workspace/Workspace';
import { FileTreeContributor } from './FileTreeContributor';

test('publishes the default dock content and attaches one controller per workspace', () => {
  const contributor = new FileTreeContributor.Class();
  const workspace = new Workspace.Class();

  const contribution = contributor.attachWorkspace(workspace);

  expect(contributor.primaryDockContentIdentifiers).toEqual(['files']);
  expect(contributor.primaryDockFallbackContentIdentifier).toBe('files');
  expect(contributor.workspaceContributor).toBe(contributor);
  expect(contribution).toBe(contributor.controllerFor(workspace));
});
