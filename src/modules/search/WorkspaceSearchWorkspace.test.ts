import { describe, expect, test } from 'bun:test';
import { WorkspaceSearchWorkspace } from './WorkspaceSearchWorkspace';

describe('WorkspaceSearchWorkspace', () => {
  test('one workspace owns four independent input models and an empty-query lifecycle', async () => {
    const workspaceSearch = new WorkspaceSearchWorkspace.Class({
      workspaceRoot: () => '/workspace',
      openDocumentHandles: () => [],
    });
    workspaceSearch.queryInput.setValue('query');
    workspaceSearch.replacementInput.setValue('replacement');
    workspaceSearch.includeInput.setValue('src/**');
    workspaceSearch.excludeInput.setValue('src/generated/**');

    expect(workspaceSearch.queryInput.value).toBe('query');
    expect(workspaceSearch.replacementInput.value).toBe('replacement');
    expect(workspaceSearch.includeInput.value).toBe('src/**');
    expect(workspaceSearch.excludeInput.value).toBe('src/generated/**');

    workspaceSearch.queryInput.clear();
    expect(await workspaceSearch.search()).toEqual([]);
    expect(workspaceSearch.flowState.value).toBe('ready');
    expect(workspaceSearch.resultCount).toBe(0);
    expect(workspaceSearch.fileCount.value).toBe(0);
    workspaceSearch.dispose();
  });

  test('search without an open workspace fails visibly', async () => {
    const workspaceSearch = new WorkspaceSearchWorkspace.Class({
      workspaceRoot: () => '',
      openDocumentHandles: () => [],
    });
    workspaceSearch.queryInput.setValue('query');

    expect(await workspaceSearch.search()).toEqual([]);
    expect(workspaceSearch.flowState.value).toBe('failed');
    expect(workspaceSearch.errorMessage.value).toContain('open workspace');
    workspaceSearch.dispose();
  });
});
