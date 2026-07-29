import { expect, test } from 'bun:test';
import { ApplicationContributions } from '../app/ApplicationContributions';
import { StatusProjectionContributions } from '../app/StatusProjectionContributions';
import { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import { Settings } from '../settings/Settings';
import { Theme } from '../theme/Theme';
import { EditorColumnDefault } from '../ui/EditorColumnDefault';
import type { EditorColumnDefaultContext } from '../ui/EditorColumnDefault';
import type { PaneContent } from '../ui/PaneContent.interface';
import { WorkspaceSet } from '../workspace/WorkspaceSet';
import { EditorSourceTextViews } from './EditorSourceTextViews';
import { EditorPlugin } from './EditorPlugin';

/** The contribution with its ONE construction seam pointed at a recording stub. The pane content it
 *  normally builds needs a live renderer and a laid-out slot; what this file measures is the
 *  registration, the release, and the projection — not the painting. */
class RecordingEditorPlugin extends EditorPlugin.$Class {
  readonly builtIdentifiers: string[] = [];
  readonly releasedViewCounts: number[] = [];
  readonly disposedContentIdentifiers: string[] = [];

  protected override buildSourceTextPaneContent(
    context: EditorColumnDefaultContext,
  ): PaneContent {
    const identifier = `source-text-${this.builtIdentifiers.length}`;
    this.builtIdentifiers.push(identifier);
    return {
      id: identifier,
      kind: 'source-text',
      title: '',
      capability: () => null,
      render: () => '' as never,
      handleKey: () => false,
      onResize: () => {},
      onFocus: () => {},
      onBlur: () => {},
      dispose: () => {
        this.disposedContentIdentifiers.push(identifier);
        let releasedWorkspaceCount = 0;
        for (const workspace of context.workspaceSet.entries.value) {
          workspace.releaseSourceTextViews();
          releasedWorkspaceCount += 1;
        }
        this.releasedViewCounts.push(releasedWorkspaceCount);
      },
    } as unknown as PaneContent;
  }
}

function hostContext(
  workspaceSet: WorkspaceSet.Instance,
): EditorColumnDefaultContext {
  return {
    workspaceSet,
    hostCapability: (identifier: string) =>
      identifier === 'frame-attribution' ? ({} as never) : null,
  } as unknown as EditorColumnDefaultContext;
}

function activatedEditorPlugin() {
  const settings = new Settings.Class();
  const workspaceSet = new WorkspaceSet.Class(settings, {
    createSourceTextViews: () => new EditorSourceTextViews.Class(),
  });
  workspaceSet.open('/tmp');
  const editorColumnDefault = new EditorColumnDefault.Class();
  const statusProjectionContributions =
    new StatusProjectionContributions.Class();
  const plugin = new RecordingEditorPlugin();
  const manager = new ApplicationContributions.Class([plugin], {
    settings,
    keybindings: new KeybindingRegistry.Class(),
    workspaceSet,
    theme: new Theme.Class(),
    editorColumnDefault,
    statusProjectionContributions,
    primaryDockHost: { register() {}, removeContent() {} },
    dismissEditorSuggestions() {},
    requestRender() {},
  } as never);
  manager.activateAll();
  editorColumnDefault.attachHost(hostContext(workspaceSet));
  return {
    manager,
    plugin,
    editorColumnDefault,
    statusProjectionContributions,
    workspaceSet,
  };
}

// invariant: The editor column's default occupant is a contribution (src/modules/ui/ui.invariants.md)
test('the editor registers as the column default and names itself in the manifest', () => {
  const { plugin, editorColumnDefault } = activatedEditorPlugin();

  expect(plugin.identifier).toBe('source-text-editor');
  expect(plugin.name).toBe('Source Text Editor');
  expect(editorColumnDefault.providerIdentifier).toBe('source-text-editor');
  expect(editorColumnDefault.content?.kind).toBe('source-text');
  expect(plugin.builtIdentifiers).toEqual(['source-text-0']);
});

// invariant: The editor column's default occupant is a contribution (src/modules/ui/ui.invariants.md)
test('uninstall releases the column content before withdrawing the provider', () => {
  const { manager, plugin, editorColumnDefault } = activatedEditorPlugin();
  void editorColumnDefault.content;

  manager.setEnabled('source-text-editor', false);

  // The content is disposed, and the release ran while the provider was still registered — a
  // withdrawal that ran first would leave the content mounted with nothing left to release it.
  expect(plugin.disposedContentIdentifiers).toEqual(['source-text-0']);
  expect(plugin.releasedViewCounts).toEqual([1]);
  expect(editorColumnDefault.providerIdentifier).toBeNull();
  expect(editorColumnDefault.content).toBeNull();
});

// invariant: The editor column's default occupant is a contribution (src/modules/ui/ui.invariants.md)
test('reinstall puts a fresh content back in the column', () => {
  const { manager, plugin, editorColumnDefault } = activatedEditorPlugin();
  void editorColumnDefault.content;
  manager.setEnabled('source-text-editor', false);

  manager.setEnabled('source-text-editor', true);

  expect(editorColumnDefault.providerIdentifier).toBe('source-text-editor');
  expect(editorColumnDefault.content?.id).toBe('source-text-1');
  expect(plugin.builtIdentifiers).toEqual(['source-text-0', 'source-text-1']);
});

// invariant: Plugin boundaries grant one authority (project.invariants.md)
test('the bracket-match projection arrives with the editor and leaves with it', () => {
  const { manager, statusProjectionContributions } = activatedEditorPlugin();

  const installed = statusProjectionContributions.snapshot();
  expect(installed.matchingBracketLine).toBe(-1);
  expect(installed.matchingBracketColumn).toBe(-1);

  manager.setEnabled('source-text-editor', false);

  // Withdrawn, not stale: the keys are actively cleared rather than left reporting a match nobody
  // can see, because no editor is painting one.
  const uninstalled = statusProjectionContributions.snapshot();
  expect(uninstalled.matchingBracketLine).toBeUndefined();
  expect(uninstalled.matchingBracketColumn).toBeUndefined();
});
