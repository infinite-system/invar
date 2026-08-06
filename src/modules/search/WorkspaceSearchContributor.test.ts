import { describe, expect, test } from 'bun:test';
import { WorkspaceSearchContributor } from './WorkspaceSearchContributor';

describe('WorkspaceSearchContributor', () => {
  test('declares the Search plugin and primary dock identity', () => {
    const contributor = new WorkspaceSearchContributor.Class();
    expect(contributor.identifier).toBe('workspace-search');
    expect(contributor.name).toBe('Search');
    expect(contributor.primaryDockContentIdentifiers).toEqual(['search']);
    expect(contributor.workspaceContributor).toBe(contributor);
  });

  test('inserts an unseen Search slot after Files and preserves later positions', () => {
    expect(
      WorkspaceSearchContributor.Class.activityOrderWithSearchSlot([
        'extensions',
        'files',
        'git',
      ]),
    ).toEqual(['extensions', 'files', 'search', 'git']);
    expect(
      WorkspaceSearchContributor.Class.activityOrderWithSearchSlot([
        'search',
        'git',
        'files',
      ]),
    ).toEqual(['search', 'git', 'files']);
  });
});
