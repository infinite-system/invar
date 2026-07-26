import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import type { StatusSnapshot } from '../system/StatusChannel';
import type { Workspace } from '../workspace/Workspace';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
} from '../workspace/WorkspaceContributor.interface';
import { FileTreePaneContent } from './FileTreePaneContent';
import { FileTreeWorkspace } from './FileTreeWorkspace';
import type { RegisteredSetting } from '../settings/SettingContribution.interface';

// invariant: The host canvas is complete without plugins (project.invariants.md)
// invariant: Plugin boundaries grant one authority (project.invariants.md)
// invariant: The file tree is a pane content citizen (src/modules/ui/ui.invariants.md)
class $FileTreeContributor
  implements ApplicationContributor, WorkspaceContributor
{
  readonly identifier = 'file-tree';
  readonly name = 'File Tree';
  readonly primaryDockContentIdentifiers = ['files'] as const;
  readonly primaryDockFallbackContentIdentifier = 'files';
  readonly workspaceContributor: WorkspaceContributor = this;
  protected readonly workspaces = new WeakMap<
    Workspace.Model,
    FileTreeWorkspace.Model
  >();
  protected application: ApplicationContributionContext | null = null;
  protected paneContent: FileTreePaneContent.Model | null = null;
  protected disposeStatusProjection: (() => void) | null = null;
  protected disposeCommands: (() => void) | null = null;
  protected showHiddenFilesSetting: RegisteredSetting<boolean> | null = null;

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    const fileTreeWorkspace = this.createWorkspaceContribution(workspace);
    this.workspaces.set(workspace, fileTreeWorkspace);
    return fileTreeWorkspace;
  }

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    this.showHiddenFilesSetting = context.registerSetting({
      identifier: 'fileTreeShowHiddenFiles',
      label: 'Show hidden files',
      section: this.name,
      defaultValue: true,
      spec: { kind: 'boolean' },
    });
    context.registerKeybindings([
      {
        chord: { key: 'e', ctrl: true, shift: true },
        action: 'view.showFiles',
      },
      { chord: { key: 'tab' }, action: 'focus.toggle', context: 'files' },
      { chord: { key: 'up' }, action: 'tree.up', context: 'files' },
      { chord: { key: 'down' }, action: 'tree.down', context: 'files' },
      {
        chord: { key: 'return' },
        action: 'tree.activate',
        context: 'files',
      },
      {
        chord: { key: 'space' },
        action: 'tree.activate',
        context: 'files',
      },
      {
        chord: { key: 'right' },
        action: 'tree.rightExpandOrOpen',
        context: 'files',
      },
      {
        chord: { key: 'left' },
        action: 'tree.leftCollapse',
        context: 'files',
      },
    ]);
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
    return new FileTreeWorkspace.Class(
      workspace,
      this.showHiddenFilesSetting?.value,
    );
  }

  protected createPaneContent(
    context: ApplicationContributionContext,
  ): FileTreePaneContent.Model {
    return new FileTreePaneContent.Class(context, () => this.activeWorkspace());
  }

  disposeApplication(): void {
    this.paneContent = null;
    this.disposeCommands?.();
    this.disposeCommands = null;
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    this.showHiddenFilesSetting = null;
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

  protected registerCommands(context: ApplicationContributionContext): void {
    const active = () => this.activeWorkspace();
    const show = (): void => {
      context.primaryDockHost.showContent('files');
      context.workspaceSet.active.focusPrimaryPane('files');
    };
    this.disposeCommands = context.commands.registerAll([
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

export namespace FileTreeContributor {
  export const $Class = $FileTreeContributor;
  export let Class = $FileTreeContributor;
  export type Model = InstanceType<typeof Class>;
}
