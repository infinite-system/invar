import { expect, test } from 'bun:test';
import { Workspace } from '../workspace/Workspace';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
} from '../workspace/WorkspaceContributor.interface';
import type {
  DatabaseConnection,
  DatabaseObjectDescription,
  DatabaseProvider,
  DatabaseQueryResult,
} from './DatabaseProvider.interface';
import { DatabaseConsumerWorkspace } from './DatabaseConsumerWorkspace';
import { DatabaseProviderPlugin } from './DatabaseProviderPlugin';

class FakeDatabaseConnection implements DatabaseConnection {
  disposed = false;

  constructor(
    protected readonly queryValue: number,
    protected readonly objectName: string,
  ) {}

  async query(
    statementText: string,
    _maximumRowCount: number,
  ): Promise<DatabaseQueryResult> {
    return statementText.startsWith('SELECT')
      ? {
          columns: ['value'],
          rows: [{ value: this.queryValue }],
          hasMoreRows: false,
          affectedRowCount: null,
        }
      : {
          columns: [],
          rows: [],
          hasMoreRows: false,
          affectedRowCount: 1,
        };
  }

  async describe(
    _parentReference: string | null,
  ): Promise<readonly DatabaseObjectDescription[]> {
    return [
      {
        reference: `table:${this.objectName}`,
        name: this.objectName,
        kind: 'table',
        detail: null,
        mayHaveChildren: true,
      },
    ];
  }

  dispose(): void {
    this.disposed = true;
  }
}

class FakeDatabaseProvider implements DatabaseProvider {
  readonly capabilityIdentifier = 'database' as const;
  readonly connections: FakeDatabaseConnection[] = [];

  constructor(
    readonly implementationIdentifier: string,
    protected readonly queryValue: number,
  ) {}

  async connect(): Promise<DatabaseConnection> {
    const connection = new FakeDatabaseConnection(
      this.queryValue,
      this.implementationIdentifier,
    );
    this.connections.push(connection);
    return connection;
  }
}

class FakeDatabaseProviderPlugin implements WorkspaceContributor {
  constructor(protected readonly provider: DatabaseProvider) {}

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    const disposeProvider = workspace.providers.register(
      this.provider.capabilityIdentifier,
      this.provider,
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
}

test('the consumer swaps SQLite for a fake by plugin substitution alone', async () => {
  const workspace = new Workspace.Class();
  const alternateProvider = new FakeDatabaseProvider('fake-alternate', 84);
  const disposeSqliteProviderPlugin = workspace.registerContributor(
    new DatabaseProviderPlugin.Class(),
  );
  const consumer = new DatabaseConsumerWorkspace.Class(workspace, () => true);

  await consumer.refresh();
  expect(consumer.status.value).toBe('ready');
  expect(consumer.providerIdentifier.value).toBe('sqlite');
  expect(consumer.queryValue.value).toBe('42');
  expect(consumer.descriptions.value[0]?.name).toBe('provider_seam_probe');

  disposeSqliteProviderPlugin();
  await consumer.refresh();
  expect(consumer.status.value).toBe('unavailable');

  const disposeAlternateProviderPlugin = workspace.registerContributor(
    new FakeDatabaseProviderPlugin(alternateProvider),
  );
  await consumer.refresh();
  expect(consumer.providerIdentifier.value).toBe('fake-alternate');
  expect(consumer.queryValue.value).toBe('84');
  expect(consumer.descriptions.value[0]?.name).toBe('fake-alternate');

  disposeAlternateProviderPlugin();
  await consumer.refresh();
  expect(alternateProvider.connections.every((entry) => entry.disposed)).toBe(
    true,
  );
  consumer.disposed();
  workspace.dispose();
});
