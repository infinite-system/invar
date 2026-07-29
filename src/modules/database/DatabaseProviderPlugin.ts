import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import type { Workspace } from '../workspace/Workspace';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
} from '../workspace/WorkspaceContributor.interface';
import { SqliteDatabaseProvider } from './SqliteDatabaseProvider';

// invariant: Provider rendezvous is host carried (src/modules/plugins/plugins.invariants.md)
// invariant: Database providers meet through the host registry (src/modules/database/database.invariants.md)
class $DatabaseProviderPlugin
  implements ApplicationContributor, WorkspaceContributor
{
  readonly identifier = 'database-provider';
  readonly name = 'SQLite Provider';
  readonly workspaceContributor: WorkspaceContributor = this;
  protected disposeStatusProjection: (() => void) | null = null;

  activateApplication(context: ApplicationContributionContext): void {
    this.disposeStatusProjection =
      context.statusProjectionContributions.register({
        snapshot: () => ({ databaseProviderPluginActive: true }),
      });
  }

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    const provider = SqliteDatabaseProvider.Class;
    const disposeProvider = workspace.providers.register(
      provider.capabilityIdentifier,
      provider,
    );
    return {
      opened(_root: string): void {},
      suspended(): void {},
      resumed(): void {},
      disposed(): void {
        disposeProvider();
      },
    };
  }

  disposeApplication(): void {
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
  }
}

export namespace DatabaseProviderPlugin {
  export const $Class = $DatabaseProviderPlugin;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
