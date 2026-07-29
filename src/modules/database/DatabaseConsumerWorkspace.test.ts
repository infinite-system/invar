import { expect, test } from 'bun:test';
import { Database as BunSqliteDatabase } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), 'invar-database-consumer-'),
  );
  const databasePath = join(temporaryDirectory, 'real.sqlite');
  const database = new BunSqliteDatabase(databasePath);
  database.run('CREATE TABLE provider_seam_probe (value INTEGER)');
  database.run('INSERT INTO provider_seam_probe VALUES (42)');
  database.close();
  const workspace = new Workspace.Class();
  const alternateProvider = new FakeDatabaseProvider('fake-alternate', 84);
  const disposeSqliteProviderPlugin = workspace.registerContributor(
    new DatabaseProviderPlugin.Class(),
  );
  const consumer = new DatabaseConsumerWorkspace.Class(workspace, () => true);

  try {
    await consumer.connect(databasePath);
    expect(consumer.status.value).toBe('ready');
    expect(consumer.providerIdentifier.value).toBe('sqlite');
    expect(consumer.descriptions.value[0]?.description.name).toBe(
      'provider_seam_probe',
    );
    await consumer.activateSelectedDescription();
    expect(consumer.previewRows.value[0]?.value).toBe(42);

    disposeSqliteProviderPlugin();
    await consumer.refresh();
    expect(consumer.status.value).toBe('unavailable');

    const disposeAlternateProviderPlugin = workspace.registerContributor(
      new FakeDatabaseProviderPlugin(alternateProvider),
    );
    await consumer.refresh();
    expect(consumer.providerIdentifier.value).toBe('fake-alternate');
    expect(consumer.descriptions.value[0]?.description.name).toBe(
      'fake-alternate',
    );
    await consumer.activateSelectedDescription();
    expect(consumer.previewRows.value[0]?.value).toBe(84);

    disposeAlternateProviderPlugin();
    await consumer.refresh();
    expect(alternateProvider.connections.every((entry) => entry.disposed)).toBe(
      true,
    );
  } finally {
    consumer.disposed();
    workspace.dispose();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
