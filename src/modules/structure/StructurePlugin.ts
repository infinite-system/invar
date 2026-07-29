// The structure navigator plugin: an ordinary contribution — a manifest row, a primary-dock pane,
// keybindings, commands, and a status projection — registered through the same seams every other
// citizen uses. It consumes a StructureSource another plugin registers; it starts no process and
// owns no protocol.
//
// Uninstall symmetry from day one: disposing the application contribution withdraws the commands,
// the status projection, and the pane reference; the host unregisters the pane, settings, and
// keybindings scoped to the activation; each workspace contribution disposes its outline. A
// reinstall rebuilds all of it from the same context — nothing is retained between lives.
//
// invariant: The structure navigator is a pane content citizen (src/modules/structure/structure.invariants.md)
// invariant: The host canvas is complete without plugins (project.invariants.md)
// invariant: Plugin boundaries grant one authority (project.invariants.md)
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
import { StructurePaneContent } from './StructurePaneContent';
import { StructureWorkspace } from './StructureWorkspace';

class $StructurePlugin implements ApplicationContributor, WorkspaceContributor {
  readonly identifier = 'structure-navigator';
  readonly name = 'Structure Navigator';
  readonly primaryDockContentIdentifiers = ['structure'] as const;
  readonly workspaceContributor: WorkspaceContributor = this;
  protected readonly workspaces = new WeakMap<
    Workspace.Model,
    StructureWorkspace.Model
  >();
  protected application: ApplicationContributionContext | null = null;
  protected paneContent: StructurePaneContent.Model | null = null;
  protected disposeStatusProjection: (() => void) | null = null;
  protected disposeCommands: (() => void) | null = null;

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    const structureWorkspace = this.createWorkspaceContribution(workspace);
    this.workspaces.set(workspace, structureWorkspace);
    return structureWorkspace;
  }

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    context.registerKeybindings([
      {
        chord: { key: 'u', ctrl: true, shift: true },
        action: 'view.showStructure',
      },
      { chord: { key: 'tab' }, action: 'focus.toggle', context: 'structure' },
      { chord: { key: 'up' }, action: 'structure.up', context: 'structure' },
      {
        chord: { key: 'down' },
        action: 'structure.down',
        context: 'structure',
      },
      {
        chord: { key: 'return' },
        action: 'structure.activate',
        context: 'structure',
      },
      {
        chord: { key: 'space' },
        action: 'structure.activate',
        context: 'structure',
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
  ): StructureWorkspace.Model {
    return new StructureWorkspace.Class(workspace, () =>
      this.paneIsObserved(workspace),
    );
  }

  protected createPaneContent(
    context: ApplicationContributionContext,
  ): StructurePaneContent.Model {
    return new StructurePaneContent.Class(context, () =>
      this.activeWorkspace(),
    );
  }

  /** True while THIS workspace's outline is on screen: the dock is visible, the structure pane is
   *  its active content, and the workspace is the active one. The outline gates every source
   *  request on this, so a hidden pane costs zero requests. */
  protected paneIsObserved(workspace: Workspace.Model): boolean {
    const application = this.application;
    if (!application) return false;
    return (
      application.primaryDockHost.visible.value &&
      application.primaryDockHost.activeContent?.id === 'structure' &&
      application.workspaceSet.active === workspace
    );
  }

  disposeApplication(): void {
    this.paneContent = null;
    this.disposeCommands?.();
    this.disposeCommands = null;
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    this.application = null;
  }

  controllerFor(workspace: Workspace.Model): StructureWorkspace.Model {
    const controller = this.workspaces.get(workspace);
    if (!controller) {
      throw new Error('Structure workspace contribution is not attached');
    }
    return controller;
  }

  protected activeWorkspace(): StructureWorkspace.Model {
    const application = this.application;
    if (!application) {
      throw new Error('Structure application contribution is not active');
    }
    return this.controllerFor(application.workspaceSet.active);
  }

  protected registerCommands(context: ApplicationContributionContext): void {
    const active = () => this.activeWorkspace();
    const show = (): void => {
      context.primaryDockHost.showContent('structure');
      context.workspaceSet.active.focusPrimaryPane('structure');
    };
    this.disposeCommands = context.commands.registerAll([
      {
        id: 'view.showStructure',
        title: 'View: Show Structure',
        category: 'View',
        run: show,
      },
      {
        id: 'structure.up',
        title: 'Structure: Move Up',
        category: 'Structure',
        run: () => {
          active().haltVerticalScroll();
          active().outline.moveSelection(-1);
        },
      },
      {
        id: 'structure.down',
        title: 'Structure: Move Down',
        category: 'Structure',
        run: () => {
          active().haltVerticalScroll();
          active().outline.moveSelection(1);
        },
      },
      {
        id: 'structure.activate',
        title: 'Structure: Go to Symbol',
        category: 'Structure',
        run: () => void active().activateSelected(),
      },
      {
        id: 'structure.refresh',
        title: 'Structure: Refresh Outline',
        category: 'Structure',
        run: () => void active().outline.refresh(),
      },
    ]);
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const application = this.application;
    if (!application) return {};
    const outline = this.activeWorkspace().outline;
    return {
      structureStatus: outline.status.value,
      structureRows: outline.rows.value.length,
      structureSelected: outline.selectedIndex.value,
      structureScrollTop: outline.scrollTop.value,
      structureNotice: outline.notice.value,
      structureTruncated: outline.truncated.value,
      structureRequests: outline.requestCount.value,
    };
  }
}

export namespace StructurePlugin {
  export const $Class = $StructurePlugin;
  export let Class = $StructurePlugin;
  export type Model = InstanceType<typeof Class>;
}
