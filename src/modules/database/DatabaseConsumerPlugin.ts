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
import { DatabaseConsumerWorkspace } from './DatabaseConsumerWorkspace';
import { DatabasePaneContent } from './DatabasePaneContent';

// invariant: Provider rendezvous is host carried (src/modules/plugins/plugins.invariants.md)
class $DatabaseConsumerPlugin
  implements ApplicationContributor, WorkspaceContributor
{
  readonly identifier = 'database-consumer';
  readonly name = 'Database Explorer';
  readonly primaryDockContentIdentifiers = ['database'] as const;
  readonly workspaceContributor: WorkspaceContributor = this;
  protected readonly workspaces = new WeakMap<
    Workspace.Model,
    DatabaseConsumerWorkspace.Model
  >();
  protected application: ApplicationContributionContext | null = null;
  protected paneContent: DatabasePaneContent.Model | null = null;
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
    ]);
    this.paneContent = new DatabasePaneContent.Class(context, () =>
      this.activeWorkspace(),
    );
    context.registerPrimaryDockContent(this.paneContent);
    this.disposeCommands = context.commands.register({
      id: 'view.showDatabase',
      title: 'View: Show Database',
      category: 'View',
      run: () => {
        context.primaryDockHost.showContent('database');
        context.workspaceSet.active.focusPrimaryPane('database');
        void this.activeWorkspace().refresh();
      },
    });
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
    return contribution;
  }

  disposeApplication(): void {
    this.paneContent = null;
    this.disposeCommands?.();
    this.disposeCommands = null;
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    this.application = null;
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
      application.primaryDockHost.visible.value &&
      application.primaryDockHost.activeContent?.id === 'database' &&
      application.workspaceSet.active === workspace
    );
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const application = this.application;
    if (!application) return {};
    const workspace = this.activeWorkspace();
    return {
      databaseConsumerStatus: workspace.status.value,
      databaseProviderIdentifier: workspace.providerIdentifier.value,
      databaseQueryValue: workspace.queryValue.value,
      databaseSchemaObjectNames: workspace.descriptions.value.map(
        (entry) => entry.name,
      ),
      databaseConsumerFailure: workspace.failure.value,
    };
  }
}

export namespace DatabaseConsumerPlugin {
  export const $Class = $DatabaseConsumerPlugin;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
