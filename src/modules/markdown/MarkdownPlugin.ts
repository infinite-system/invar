import type {
  ApplicationPlugin,
  ApplicationPluginContext,
} from '../app/ApplicationPlugin.interface';
import type { StatusSnapshot } from '../system/StatusChannel';
import type { Workspace } from '../workspace/Workspace';
import type { WorkspaceContribution } from '../workspace/WorkspacePlugin.interface';
import { MarkdownPreviewSurface } from './MarkdownPreviewSurface';
import { MarkdownWorkspace } from './MarkdownWorkspace';

// Markdown as a default-composed plugin. It owns the per-tab preview mode, the split that occupies
// the editor column, its two commands, its chord-reachable affordance in the editor title row, and
// its own status projection. The host keeps only `resolveFileReference` — which is generic path
// confinement inside the workspace root, with no markdown in it.
//
// invariant: The host canvas is complete without plugins (project.invariants.md)
// invariant: A Markdown file offers a live source preview split (src/modules/markdown/markdown.invariants.md)
class $MarkdownPlugin implements ApplicationPlugin {
  protected readonly workspaces = new WeakMap<
    Workspace.Model,
    MarkdownWorkspace.Model
  >();
  protected application: ApplicationPluginContext | null = null;
  protected surface: MarkdownPreviewSurface.Model | null = null;
  protected disposeSurface: (() => void) | null = null;

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    const markdownWorkspace = new MarkdownWorkspace.Class(
      workspace,
      () => this.surface?.previewContent?.previewFocused ?? false,
    );
    this.workspaces.set(workspace, markdownWorkspace);
    return markdownWorkspace;
  }

  activateApplication(context: ApplicationPluginContext): void {
    this.application = context;
    this.surface = new MarkdownPreviewSurface.Class(
      () => this.workspaces.get(context.workspaceSet.active) ?? null,
      context.settings,
    );
    this.disposeSurface = context.editorSurfaceContents.register(this.surface);
    context.statusProjectionContributions.register({
      snapshot: () => this.statusSnapshot(),
    });
    this.registerCommands(context);
  }

  disposeApplication(): void {
    this.disposeSurface?.();
    this.disposeSurface = null;
    this.surface = null;
    this.application = null;
  }

  controllerFor(workspace: Workspace.Model): MarkdownWorkspace.Model {
    const controller = this.workspaces.get(workspace);
    if (!controller) {
      throw new Error('Markdown workspace contribution is not attached');
    }
    return controller;
  }

  protected activeWorkspace(): MarkdownWorkspace.Model {
    const application = this.application;
    if (!application) {
      throw new Error('Markdown application contribution is not active');
    }
    return this.controllerFor(application.workspaceSet.active);
  }

  protected registerCommands(context: ApplicationPluginContext): void {
    context.commands.registerAll([
      {
        id: 'markdown.togglePreview',
        title: 'Markdown: Toggle Preview',
        category: 'Markdown',
        // The tab strip's action cluster renders exactly this: an icon-bearing command whose guard
        // holds. No host file names markdown to draw it.
        editorTitleIcon: 'preview',
        when: () => this.activeWorkspace().previewToggleAvailable,
        toggled: () => this.activeWorkspace().showingPreview,
        run: () => this.activeWorkspace().togglePreview(),
      },
      {
        id: 'markdown.openHoveredReference',
        title: 'Markdown: Open Hovered Reference',
        category: 'Markdown',
        when: () =>
          Boolean(
            this.surface?.previewContent?.splitView.hoveredReferencePath.value,
          ),
        run: () =>
          this.surface?.previewContent?.splitView.openHoveredReference(),
      },
    ]);
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const application = this.application;
    if (!application) return {};
    const markdownWorkspace = this.activeWorkspace();
    const previewContent = this.surface?.previewContent ?? null;
    const splitView = previewContent?.splitView ?? null;
    return {
      markdownPreviewOpen: markdownWorkspace.showingPreview,
      markdownPaneFocus: splitView?.focusedPane.value ?? 'source',
      markdownSplitRatio: application.settings.markdownSplitRatio.value,
      markdownPreviewScrollTop: splitView?.preview.scrollTop.value ?? 0,
      markdownPreviewSelectionChars: splitView?.selectionCharacterCount() ?? 0,
      markdownHoveredReference: splitView?.hoveredReferencePath.value ?? null,
      markdownPreviewFindQuery: previewContent?.previewFindQuery() ?? '',
    };
  }
}

export namespace MarkdownPlugin {
  export const $Class = $MarkdownPlugin;
  export let Class = $MarkdownPlugin;
  export type Model = InstanceType<typeof Class>;
}
