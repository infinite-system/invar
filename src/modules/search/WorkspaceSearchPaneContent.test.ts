import { expect, test } from 'bun:test';
import { ref } from 'vue';
import type { Workspace } from '../workspace/Workspace';
import { WorkspaceSearchPaneContent } from './WorkspaceSearchPaneContent';
import { WorkspaceSearchWorkspace } from './WorkspaceSearchWorkspace';

test('the Search pane keeps one focus cycle and reruns toggled queries', () => {
  const workspaceSearch = new WorkspaceSearchWorkspace.Class({
    workspaceRoot: () => '/workspace',
    openDocumentHandles: () => [],
  });
  const focused = ref(false);
  const workspace = {
    workspaceSearch,
    focusPrimaryPane: () => {
      focused.value = true;
    },
    focusEditor: () => {},
  } as unknown as Workspace.Model;
  const pane = new WorkspaceSearchPaneContent.Class(
    {
      workspaceSet: { activeWorkspaceIndex: ref(0), active: workspace },
      settings: { scrollbarThickness: ref(1) },
      requestRender: () => {},
    } as never,
    () => workspace,
  );

  expect(pane.activeFocus.value).toBe('query');
  pane.focusNext(1);
  expect(pane.activeFocus.value).toBe('replacement');
  pane.focusNext(-1);
  expect(pane.activeFocus.value).toBe('query');
  pane.focusResults();
  expect(pane.activeFocus.value).toBe('results');
  expect(focused.value).toBe(true);
  pane.toggleCase();
  expect(workspaceSearch.caseSensitive.value).toBe(true);
  expect(workspaceSearch.flowState.value).toBe('queued');
  pane.cancelSearch();
  expect(workspaceSearch.flowState.value).toBe('idle');
});
