import type {
  ApplicationPlugin,
  ApplicationPluginContext,
} from '../app/ApplicationPlugin.interface';
import type { StatusSnapshot } from '../system/StatusChannel';
import type { Workspace } from '../workspace/Workspace';
import type { WorkspaceContribution } from '../workspace/WorkspacePlugin.interface';
import { FileTreePaneContent } from './FileTreePaneContent';
import { FileTreeWorkspace } from './FileTreeWorkspace';

// invariant: The host canvas is complete without plugins (project.invariants.md)
// invariant: The file tree is a pane content citizen (src/modules/ui/ui.invariants.md)
class $FileTreePlugin implements ApplicationPlugin {
  readonly primaryDockContentIdentifiers = ['files'] as const;
  readonly primaryDockFallbackContentIdentifier = 'files';
  protected readonly workspaces = new WeakMap<
    Workspace.Model,
    FileTreeWorkspace.Model
  >();
  protected application: ApplicationPluginContext | null = null;
  protected paneContent: FileTreePaneContent.Model | null = null;
  protected disposeStatusProjection: (() => void) | null = null;

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    const fileTreeWorkspace = this.createWorkspaceContribution(workspace);
    this.workspaces.set(workspace, fileTreeWorkspace);
    return fileTreeWorkspace;
  }

  activateApplication(context: ApplicationPluginContext): void {
    this.application = context;
    this.paneContent = this.createPaneContent(context);
    context.registerPrimaryDockContent(this.paneContent);
    this.disposeStatusProjection =
      context.statusProjectionContributions.register({
        snapshot: () => this.statusSnapshot(),
      });
    this.registerCommands(context);
  }

  // invariant: Construction goes through overridable seams (project.invariants.md)
  protected createWorkspaceContribution(
    workspace: Workspace.Model,
  ): FileTreeWorkspace.Model {
    return new FileTreeWorkspace.Class(workspace);
  }

  protected createPaneContent(
    context: ApplicationPluginContext,
  ): FileTreePaneContent.Model {
    return new FileTreePaneContent.Class(context, () => this.activeWorkspace());
  }

  disposeApplication(): void {
    this.paneContent?.dispose();
    this.paneContent = null;
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    this.application = null;
  }

  controllerFor(workspace: Workspace.Model): FileTreeWorkspace.Model {
    const controller = this.workspaces.get(workspace);
    if (!controller) {
      throw new Error('File-tree workspace contribution is not attached');
    }
    return controller;
  }

  protected activeWorkspace(): FileTreeWorkspace.Model {
    const application = this.application;
    if (!application) {
      throw new Error('File-tree application contribution is not active');
    }
    return this.controllerFor(application.workspaceSet.active);
  }

  protected registerCommands(context: ApplicationPluginContext): void {
    const active = () => this.activeWorkspace();
    const show = (): void => {
      context.primaryDockHost.showContent('files');
      context.workspaceSet.active.focusPrimaryPane('files');
    };
    context.commands.registerAll([
      {
        id: 'view.focusFiles',
        title: 'View: Focus File Explorer',
        category: 'View',
        run: show,
      },
      {
        id: 'view.showFiles',
        title: 'View: Show Explorer',
        category: 'View',
        run: show,
      },
      {
        id: 'files.refresh',
        title: 'Files: Refresh Tree',
        category: 'Files',
        run: () => active().tree.refresh(),
      },
      {
        id: 'tree.up',
        title: 'Files: Move Up',
        category: 'Files',
        run: () => {
          active().haltVerticalScroll();
          active().tree.moveSelection(-1);
        },
      },
      {
        id: 'tree.down',
        title: 'Files: Move Down',
        category: 'Files',
        run: () => {
          active().haltVerticalScroll();
          active().tree.moveSelection(1);
        },
      },
      {
        id: 'tree.activate',
        title: 'Files: Open or Toggle',
        category: 'Files',
        run: () => void active().activateSelected(),
      },
      {
        id: 'tree.rightExpandOrOpen',
        title: 'Files: Expand or Open',
        category: 'Files',
        run: () => {
          const workspace = active();
          workspace.haltVerticalScroll();
          if (
            workspace.tree.selected?.isDir &&
            workspace.tree.selected.expanded
          ) {
            workspace.tree.moveSelection(1);
          } else {
            workspace.activateSelected();
          }
        },
      },
      {
        id: 'tree.leftCollapse',
        title: 'Files: Collapse',
        category: 'Files',
        run: () => {
          const workspace = active();
          if (
            workspace.tree.selected?.isDir &&
            workspace.tree.selected.expanded
          ) {
            workspace.activateSelected();
          }
        },
      },
    ]);
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const application = this.application;
    if (!application) return {};
    const tree = this.activeWorkspace().tree;
    return {
      treeRows: tree.rows.length,
      treeSelected: tree.selectedIndex.value,
      treeScrollTop: tree.scrollTop.value,
      treeHovered: tree.hoveredIndex.value,
    };
  }
}

export namespace FileTreePlugin {
  export const $Class = $FileTreePlugin;
  export let Class = $FileTreePlugin;
  export type Model = InstanceType<typeof Class>;
}
