// The structure navigator plugin: an ordinary contribution — a manifest row, a right-dock pane,
// keybindings, commands, contributed settings, and a status projection — registered through the
// same seams every other citizen uses. It consumes a StructureSource another plugin registers; it
// starts no process and owns no protocol. The pane sits in the RIGHT dock beside the file it
// outlines, and its default-visibility policy shows it unbidden for documents a source answers.
//
// Uninstall symmetry from day one: disposing the application contribution withdraws the commands,
// the status projection, and the pane reference; the host unregisters the pane, settings, and
// keybindings scoped to the activation; each workspace contribution disposes its outline. A
// reinstall rebuilds all of it from the same context — nothing is retained between lives.
//
// invariant: The structure navigator is a pane content citizen (src/modules/structure/structure.invariants.md)
// invariant: The outline projection has one depth and filter policy (src/modules/structure/structure.invariants.md)
// invariant: The host canvas is complete without plugins (project.invariants.md)
// invariant: Plugin boundaries grant one authority (project.invariants.md)
import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import type { StatusSnapshot } from '../system/StatusChannel';
import { KeybindingDefaults } from '../keybindings/KeybindingDefaults';
import type { RegisteredSetting } from '../settings/SettingContribution.interface';
import type { Workspace } from '../workspace/Workspace';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
} from '../workspace/WorkspaceContributor.interface';
import { StructureDefaultVisibility } from './StructureDefaultVisibility';
import { StructurePaneContent } from './StructurePaneContent';
import { StructureWorkspace } from './StructureWorkspace';

class $StructurePlugin implements ApplicationContributor, WorkspaceContributor {
  readonly identifier = 'structure-navigator';
  readonly name = 'Structure Navigator';
  readonly workspaceContributor: WorkspaceContributor = this;
  protected readonly workspaces = new WeakMap<
    Workspace.Model,
    StructureWorkspace.Model
  >();
  protected readonly activeWorkspaces = new Set<StructureWorkspace.Model>();
  protected application: ApplicationContributionContext | null = null;
  protected paneContent: StructurePaneContent.Model | null = null;
  protected defaultVisibility: StructureDefaultVisibility.Model | null = null;
  protected disposeStatusProjection: (() => void) | null = null;
  protected disposeCommands: (() => void) | null = null;
  protected defaultDepthSetting: RegisteredSetting<number> | null = null;

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    const structureWorkspace = this.createWorkspaceContribution(workspace);
    this.workspaces.set(workspace, structureWorkspace);
    this.activeWorkspaces.add(structureWorkspace);
    return structureWorkspace;
  }

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    context.registerKeybindings([
      {
        chord: { key: 'u', ctrl: true, shift: true },
        action: 'view.showStructure',
      },
      {
        chord: { key: 'tab' },
        action: 'structure.focusEditor',
        context: 'structure',
      },
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
        chord: { key: 'left' },
        action: 'structure.fold',
        context: 'structure',
      },
      {
        chord: { key: 'right' },
        action: 'structure.unfold',
        context: 'structure',
      },
      {
        chord: { key: 'up', ctrl: true },
        action: 'structure.decreaseDepth',
        context: 'structure',
      },
      {
        chord: { key: 'down', ctrl: true },
        action: 'structure.increaseDepth',
        context: 'structure',
      },
      {
        chord: { key: '0', ctrl: true },
        action: 'structure.resetDepth',
        context: 'structure',
      },
      {
        chord: { key: 'escape' },
        action: 'structure.clearFilter',
        context: 'structure',
      },
      ...KeybindingDefaults.Class.textInputBindings('structure', {
        hostOwnedPlainKeys: ['left', 'right'],
      }),
    ]);
    this.paneContent = this.createPaneContent(context);
    context.registerRightDockContent(this.paneContent);
    const showByDefaultSetting = context.registerSetting({
      identifier: 'structureShowByDefault',
      label: 'Show structure for supported files',
      section: this.name,
      defaultValue: true,
      spec: { kind: 'boolean' },
    });
    this.defaultDepthSetting = context.registerSetting({
      identifier: 'structureDefaultDepth',
      label: 'Default symbol depth',
      section: this.name,
      defaultValue: 1,
      spec: {
        kind: 'number',
        step: 1,
        minimum: 0,
        maximum: 8,
        decimals: 0,
      },
      changed: () => this.refreshDepthProjection(),
    });
    this.defaultVisibility = this.createDefaultVisibility(
      context,
      () => showByDefaultSetting.value.value,
    );
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
    let structureWorkspace: StructureWorkspace.Model;
    structureWorkspace = new StructureWorkspace.Class(
      workspace,
      () => this.paneIsObserved(workspace),
      () => this.defaultDepthSetting?.value.value ?? 1,
      () => this.activeWorkspaces.delete(structureWorkspace),
    );
    return structureWorkspace;
  }

  protected refreshDepthProjection(): void {
    for (const workspace of this.activeWorkspaces) {
      workspace.outline.refreshProjection();
    }
  }

  protected createPaneContent(
    context: ApplicationContributionContext,
  ): StructurePaneContent.Model {
    return new StructurePaneContent.Class(context, () =>
      this.activeWorkspace(),
    );
  }

  protected createDefaultVisibility(
    context: ApplicationContributionContext,
    showByDefault: () => boolean,
  ): StructureDefaultVisibility.Model {
    return new StructureDefaultVisibility.Class({
      rightDockHost: context.rightDockHost,
      workspaceSet: context.workspaceSet,
      showByDefault,
      requestRender: () => context.requestRender(),
    });
  }

  /** True while THIS workspace's outline is on screen: the right dock is visible, the structure
   *  pane is its active content, and the workspace is the active one. The outline gates every
   *  source request on this, so a hidden pane costs zero requests. */
  protected paneIsObserved(workspace: Workspace.Model): boolean {
    const application = this.application;
    if (!application) return false;
    return (
      application.rightDockHost.visible.value &&
      application.rightDockHost.activeContent?.id === 'structure' &&
      application.workspaceSet.active === workspace
    );
  }

  disposeApplication(): void {
    this.paneContent = null;
    this.defaultVisibility?.dispose();
    this.defaultVisibility = null;
    this.disposeCommands?.();
    this.disposeCommands = null;
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    this.defaultDepthSetting = null;
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
      // The explicit gesture re-endorses the pane for this document before it shows and focuses.
      this.defaultVisibility?.noteManualShow();
      // The keyboard moves WITH the gesture: pull workspace focus off the primary pane and blur
      // that dock, or the input ladder would keep routing keys there ahead of the right dock.
      context.workspaceSet.active.focusEditor();
      context.primaryDockHost.blur();
      context.rightDockHost.showContent('structure');
    };
    this.disposeCommands = context.commands.registerAll([
      {
        id: 'view.showStructure',
        title: 'View: Show Structure',
        category: 'View',
        run: show,
      },
      {
        id: 'structure.focusEditor',
        title: 'Structure: Focus Editor',
        category: 'Structure',
        run: () => {
          context.rightDockHost.blur();
          context.workspaceSet.active.focusEditor();
        },
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
        run: () => {
          // The jump lands IN the editor, so the keyboard follows it out of the dock.
          if (active().activateSelected()) context.rightDockHost.blur();
        },
      },
      {
        id: 'structure.fold',
        title: 'Structure: Fold Symbol',
        category: 'Structure',
        run: () => {
          active().haltVerticalScroll();
          const outline = active().outline;
          if (
            outline.rows.value[outline.selectedIndex.value]?.childrenVisible
          ) {
            outline.toggleSelectedFold();
          }
        },
      },
      {
        id: 'structure.unfold',
        title: 'Structure: Unfold Symbol',
        category: 'Structure',
        run: () => {
          active().haltVerticalScroll();
          const outline = active().outline;
          if (
            !outline.rows.value[outline.selectedIndex.value]?.childrenVisible
          ) {
            outline.toggleSelectedFold();
          }
        },
      },
      {
        id: 'structure.decreaseDepth',
        title: 'Structure: Decrease Depth for This File',
        category: 'Structure',
        run: () => active().outline.adjustDepthForActiveFile(-1),
      },
      {
        id: 'structure.increaseDepth',
        title: 'Structure: Increase Depth for This File',
        category: 'Structure',
        run: () => active().outline.adjustDepthForActiveFile(1),
      },
      {
        id: 'structure.resetDepth',
        title: 'Structure: Reset Depth for This File',
        category: 'Structure',
        run: () => active().outline.resetDepthForActiveFile(),
      },
      {
        id: 'structure.clearFilter',
        title: 'Structure: Clear Filter',
        category: 'Structure',
        run: () => active().outline.clearFilter(),
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
      structureDepth: outline.depth,
      structureDepthIsOverridden: outline.depthIsOverridden,
      structureFilter: outline.filterInput.value,
    };
  }
}

export namespace StructurePlugin {
  export const $Class = $StructurePlugin;
  export let Class = $StructurePlugin;
  export type Model = InstanceType<typeof Class>;
}
