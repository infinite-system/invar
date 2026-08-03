import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import { KeybindingDefaults } from '../keybindings/KeybindingDefaults';
import type { StatusSnapshot } from '../system/StatusChannel';
import type { Workspace } from '../workspace/Workspace';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
} from '../workspace/WorkspaceContributor.interface';
import { DatabaseConsumerWorkspace } from './DatabaseConsumerWorkspace';
import { DatabasePaneContent } from './DatabasePaneContent';
import type { PaneContent } from '../ui/PaneContent.interface';
import type { PanelContentFactory } from '../ui/PanelContentFactory.interface';

// invariant: Provider rendezvous is host carried (src/modules/plugins/plugins.invariants.md)
// invariant: Database files are user selected (src/modules/database/database.invariants.md)
// invariant: Plugin boundaries grant one authority (project.invariants.md)
class $DatabaseConsumerPlugin
  implements ApplicationContributor, WorkspaceContributor, PanelContentFactory
{
  readonly identifier = 'database-consumer';
  readonly name = 'Database Explorer';
  readonly primaryDockContentIdentifiers = [] as const;
  readonly kind = 'database';
  readonly instanceLabel = 'Database';
  readonly panelSpace = { kind: 'database', label: 'Database' } as const;
  readonly paneAddMenuEntries = [
    {
      identifier: 'database-instance',
      label: 'Database',
      instanceLabel: 'Database',
      spaceKind: 'database',
    },
  ] as const;
  readonly workspaceContributor: WorkspaceContributor = this;
  protected readonly workspaces = new WeakMap<
    Workspace.Model,
    DatabaseConsumerWorkspace.Model
  >();
  protected application: ApplicationContributionContext | null = null;
  protected disposeCommands: (() => void) | null = null;
  protected disposeStatusProjection: (() => void) | null = null;

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    context.registerKeybindings([
      {
        chord: { key: 'y', ctrl: true, shift: true },
        action: 'view.showDatabase',
      },
      { chord: { key: 'tab' }, action: 'focus.toggle', context: 'database' },
      {
        chord: { key: 'return' },
        action: 'database.submitOrActivate',
        context: 'database',
      },
      {
        chord: { key: 'escape' },
        action: 'database.cancelInput',
        context: 'database',
      },
      {
        chord: { key: 'up' },
        action: 'database.previousSchemaItem',
        context: 'database',
      },
      {
        chord: { key: 'down' },
        action: 'database.nextSchemaItem',
        context: 'database',
      },
      {
        chord: { key: 'pageup' },
        action: 'database.previousPage',
        context: 'database',
      },
      {
        chord: { key: 'pagedown' },
        action: 'database.nextPage',
        context: 'database',
      },
      ...KeybindingDefaults.Class.textInputBindings('database'),
    ]);
    context.registerPanelContentFactory(this);
    this.disposeCommands = context.commands.registerAll([
      {
        id: 'view.showDatabase',
        title: 'View: Show Database',
        category: 'View',
        run: () => this.showDatabase(),
      },
      {
        id: 'database.connect',
        title: 'Database: Connect',
        category: 'Database',
        run: () => {
          this.showDatabase();
          this.focusedPaneContent()?.beginConnectionInput();
        },
      },
      {
        id: 'database.disconnect',
        title: 'Database: Disconnect',
        category: 'Database',
        run: () => this.activeWorkspace().disconnect(),
        when: () => this.activeWorkspace().filePath.value !== null,
      },
      {
        id: 'database.reconnect',
        title: 'Database: Reconnect',
        category: 'Database',
        run: () => {
          this.showDatabase();
          void this.activeWorkspace().reconnect();
        },
        when: () => this.activeWorkspace().filePath.value !== null,
      },
      {
        id: 'database.submitOrActivate',
        title: 'Database: Open Selected Schema Item',
        category: 'Database',
        run: () => this.focusedPaneContent()?.submitOrActivate(),
        when: () => this.databaseOwnsFocus(),
      },
      {
        id: 'database.cancelInput',
        title: 'Database: Cancel Path Input',
        category: 'Database',
        run: () => this.focusedPaneContent()?.cancelConnectionInput(),
        when: () =>
          this.databaseOwnsFocus() &&
          (this.focusedPaneContent()?.inputActive.value ?? false),
      },
      {
        id: 'database.previousSchemaItem',
        title: 'Database: Select Previous Schema Item',
        category: 'Database',
        run: () => this.activeWorkspace().moveSelection(-1),
        when: () => this.databaseOwnsFocus(),
      },
      {
        id: 'database.nextSchemaItem',
        title: 'Database: Select Next Schema Item',
        category: 'Database',
        run: () => this.activeWorkspace().moveSelection(1),
        when: () => this.databaseOwnsFocus(),
      },
      {
        id: 'database.previousPage',
        title: 'Database: Previous Row Page',
        category: 'Database',
        run: () => void this.activeWorkspace().previousPreviewPage(),
        when: () => this.databaseOwnsFocus(),
      },
      {
        id: 'database.nextPage',
        title: 'Database: Next Row Page',
        category: 'Database',
        run: () => void this.activeWorkspace().nextPreviewPage(),
        when: () => this.databaseOwnsFocus(),
      },
    ]);
    this.disposeStatusProjection =
      context.statusProjectionContributions.register({
        snapshot: () => this.statusSnapshot(),
      });
  }

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    const contribution = new DatabaseConsumerWorkspace.Class(workspace, () =>
      this.paneIsObserved(workspace),
    );
    this.workspaces.set(workspace, contribution);
    return {
      opened(root: string): void {
        contribution.opened(root);
      },
      suspended(): void {
        contribution.suspended();
      },
      resumed(): void {
        contribution.resumed();
      },
      disposed: () => {
        this.workspaces.delete(workspace);
        contribution.disposed();
      },
    };
  }

  disposeApplication(): void {
    this.disposeCommands?.();
    this.disposeCommands = null;
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    this.application = null;
  }

  protected showDatabase(): void {
    const application = this.application;
    if (!application) return;
    const content = application.bottomPanelHost.contentsOfKind(this.kind)[0];
    if (content) application.bottomPanelHost.showContent(content.id);
    else application.openPanelContent(this.kind);
  }

  protected databaseOwnsFocus(): boolean {
    const application = this.application;
    return Boolean(
      application &&
      application.bottomPanelHost.focused.value &&
      application.bottomPanelHost.focusedContent?.kind === 'database',
    );
  }

  protected focusedPaneContent(): DatabasePaneContent.Model | null {
    const content = this.application?.bottomPanelHost.focusedContent;
    return content instanceof DatabasePaneContent.Class
      ? (content as DatabasePaneContent.Model)
      : null;
  }

  protected activeWorkspace(): DatabaseConsumerWorkspace.Model {
    const application = this.application;
    if (!application) {
      throw new Error(
        'Database consumer application contribution is not active',
      );
    }
    const workspace = this.workspaces.get(application.workspaceSet.active);
    if (!workspace) {
      throw new Error(
        'Database consumer workspace contribution is not attached',
      );
    }
    return workspace;
  }

  protected paneIsObserved(workspace: Workspace.Model): boolean {
    const application = this.application;
    if (!application) return false;
    return (
      application.bottomPanelHost.visibleContentsOfKind(this.kind).length > 0 &&
      application.workspaceSet.active === workspace
    );
  }

  createPane(identifier: string, label: string): PaneContent {
    const application = this.application;
    if (!application) {
      throw new Error('The database content factory is not activated');
    }
    return new DatabasePaneContent.Class(
      application,
      () => this.activeWorkspace(),
      identifier,
      label,
    );
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const application = this.application;
    if (!application) return {};
    const workspace = this.activeWorkspace();
    return {
      databaseConsumerStatus: workspace.status.value,
      databaseConsumerVersion: workspace.version.value,
      databaseProviderIdentifier: workspace.providerIdentifier.value,
      databaseFilePath: workspace.filePath.value,
      databasePathInputActive:
        this.focusedPaneContent()?.inputActive.value ?? false,
      databasePathInputValue: this.focusedPaneContent()?.inputActive.value
        ? (this.focusedPaneContent()?.pathInputValue ?? '')
        : '',
      databaseSchemaObjectNames: workspace.descriptions.value.map(
        (row) => row.description.name,
      ),
      databaseSchemaObjectKinds: workspace.descriptions.value.map(
        (row) => row.description.kind,
      ),
      databaseSelectedSchemaIndex: workspace.selectedDescriptionIndex.value,
      databasePreviewTableName: workspace.previewTableName.value,
      databasePreviewPageIndex: workspace.previewPageIndex.value,
      databasePreviewRowCount: workspace.previewRows.value.length,
      databasePreviewHasMoreRows: workspace.previewHasMoreRows.value,
      databasePreviewFirstRow: workspace.previewRows.value[0] ?? null,
      databaseConsumerFailure: workspace.failure.value,
    };
  }
}

export namespace DatabaseConsumerPlugin {
  export const $Class = $DatabaseConsumerPlugin;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
