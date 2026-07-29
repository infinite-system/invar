import { describe, expect, it } from 'bun:test';
import { MarkdownPlugin } from './MarkdownPlugin';
import { EditorSurfaceClaims } from '../workspace/EditorSurfaceClaims';
import { EditorSurfaceContents } from '../ui/EditorSurfaceContents';
import { CommandRegistry } from '../commands/CommandRegistry';
import { ProviderRegistry } from '../plugins/ProviderRegistry';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type { Workspace } from '../workspace/Workspace';
import { ref } from 'vue';

function createHostWorkspace(path: string) {
  const workspace = {
    editorSurfaces: new EditorSurfaceClaims.Class(),
    providers: new ProviderRegistry.Class(),
    root: '/project',
    activeDocumentHandle: { path },
    editor: { hasDocument: { value: true }, document: { path } },
    focusEditor() {},
  };
  return workspace as unknown as Workspace.Model & typeof workspace;
}

function activate(path = '/project/notes.md') {
  const plugin = new MarkdownPlugin.Class();
  const workspace = createHostWorkspace(path);
  plugin.attachWorkspace(workspace);
  const commands = new CommandRegistry.Class();
  const editorSurfaceContents = new EditorSurfaceContents.Class();
  const context = {
    workspaceSet: { active: workspace },
    commands,
    editorSurfaceContents,
    settings: { markdownSplitRatio: { value: 0.5 } },
    statusProjectionContributions: { register: () => {} },
    registerKeybindings: () => {},
    registerSetting: (contribution: { defaultValue: number }) => ({
      value: ref(contribution.defaultValue),
      save() {},
      dispose() {},
    }),
  } as unknown as ApplicationContributionContext;
  plugin.activateApplication(context);
  return { plugin, workspace, commands, editorSurfaceContents };
}

describe('MarkdownPlugin', () => {
  it('registers its preview surface with the editor-column registry', () => {
    const { editorSurfaceContents } = activate();
    // Nothing is showing a preview yet, so it claims nothing.
    expect(editorSurfaceContents.claimingProvider).toBeNull();
  });

  it('claims the editor column once a tab turns its preview on', () => {
    const { plugin, workspace, editorSurfaceContents } = activate();
    plugin.controllerFor(workspace).togglePreview();
    expect(editorSurfaceContents.claimingProvider?.identifier).toBe(
      'markdown.preview',
    );
  });

  // Gap D: the toggle reaches the tab strip as a FIELD on the one command contract, not through a
  // markdown-shaped port. The tab bar renders whatever declares an icon.
  it('offers its toggle as an icon-bearing command whose guard follows the active tab', () => {
    const { commands } = activate();
    const actions = commands.editorTitleActions();
    expect(actions.map((command) => command.id)).toEqual([
      'markdown.togglePreview',
    ]);
    expect(actions[0]?.editorTitleIcon).toBe('preview');
    expect(actions[0]?.toggled?.()).toBe(false);
  });

  it('reports the toggle as ON once the preview is showing', () => {
    const { plugin, workspace, commands } = activate();
    plugin.controllerFor(workspace).togglePreview();
    expect(commands.editorTitleActions()[0]?.toggled?.()).toBe(true);
  });

  it('withdraws the toggle affordance for a non-Markdown tab', () => {
    const { commands } = activate('/project/main.ts');
    expect(commands.editorTitleActions()).toEqual([]);
  });

  it('runs the toggle through the one registry, by command id', () => {
    const { plugin, workspace, commands } = activate();
    commands.run('markdown.togglePreview');
    expect(plugin.controllerFor(workspace).showingPreview).toBe(true);
  });

  it('projects its own status fields, with no host involvement', () => {
    const { plugin, workspace } = activate();
    plugin.controllerFor(workspace).togglePreview();
    const snapshot = (
      plugin as unknown as { statusSnapshot: () => Record<string, unknown> }
    ).statusSnapshot();
    expect(snapshot.markdownPreviewOpen).toBe(true);
    expect(snapshot.markdownPaneFocus).toBe('source');
    expect(snapshot.markdownSplitRatio).toBe(0.5);
  });

  it('unregisters its surface on application disposal', () => {
    const { plugin, workspace, editorSurfaceContents } = activate();
    plugin.controllerFor(workspace).togglePreview();
    plugin.disposeApplication();
    expect(editorSurfaceContents.claimingProvider).toBeNull();
  });

  it('refuses to answer for a workspace it was never attached to', () => {
    const plugin = new MarkdownPlugin.Class();
    expect(() => plugin.controllerFor(createHostWorkspace('/x.md'))).toThrow(
      'Markdown workspace contribution is not attached',
    );
  });
});
