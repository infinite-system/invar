import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import type { Workspace } from '../workspace/Workspace';
import type { WorkspaceContribution } from '../workspace/WorkspaceContributor.interface';
import type {
  DatabaseConnection,
  DatabaseObjectDescription,
  DatabaseProvider,
} from './DatabaseProvider.interface';

// invariant: Provider rendezvous is host carried (src/modules/plugins/plugins.invariants.md)
// invariant: Database providers meet through the host registry (src/modules/database/database.invariants.md)
// invariant: Database connection cost tracks observation (src/modules/database/database.invariants.md)
class $DatabaseConsumerWorkspace implements WorkspaceContribution {
  declare $watch: typeof import('vue').watch;
  declare $stopEffects: () => void;
  protected connection: DatabaseConnection | null = null;
  protected refreshGeneration = 0;

  constructor(
    protected readonly workspace: Workspace.Model,
    protected readonly isObserved: () => boolean,
  ) {
    this.$watch(
      () => this.workspace.providers.revision.value,
      () => this.providerRegistryChanged(),
    );
    this.$watch(
      () => this.isObserved(),
      (isObserved) => this.observationChanged(isObserved),
      { immediate: true },
    );
  }

  get status() {
    return ref<DatabaseConsumerStatus>('idle');
  }

  get providerIdentifier() {
    return ref<string | null>(null);
  }

  get queryValue() {
    return ref<string | null>(null);
  }

  get descriptions() {
    return shallowRef<readonly DatabaseObjectDescription[]>([]);
  }

  get failure() {
    return ref<string | null>(null);
  }

  get version() {
    return ref(0);
  }

  opened(_root: string): void {
    void this.refresh();
  }

  suspended(): void {
    this.refreshGeneration++;
    this.releaseConnection();
    this.applyState('idle', null, null, [], null);
  }

  resumed(): void {
    void this.refresh();
  }

  disposed(): void {
    this.refreshGeneration++;
    this.releaseConnection();
    this.$stopEffects();
  }

  async refresh(): Promise<void> {
    const generation = ++this.refreshGeneration;
    this.releaseConnection();
    if (!this.isObserved()) {
      this.applyState('idle', null, null, [], null);
      return;
    }
    const provider =
      this.workspace.providers.resolve<DatabaseProvider>('database');
    if (!provider) {
      this.applyState('unavailable', null, null, [], null);
      return;
    }

    this.applyState(
      'loading',
      provider.implementationIdentifier,
      null,
      [],
      null,
    );
    let connection: DatabaseConnection | null = null;
    try {
      connection = await provider.connect({
        identifier: 'provider-seam-proof',
        filePath: ':memory:',
      });
      await connection.query(
        'CREATE TABLE provider_seam_probe (value INTEGER)',
        0,
      );
      await connection.query('INSERT INTO provider_seam_probe VALUES (42)', 0);
      const queryResult = await connection.query(
        'SELECT value FROM provider_seam_probe',
        1,
      );
      const descriptions = await connection.describe(null);
      if (
        generation !== this.refreshGeneration ||
        !this.isObserved() ||
        this.workspace.providers.resolve<DatabaseProvider>('database') !==
          provider
      ) {
        connection.dispose();
        return;
      }
      this.connection = connection;
      connection = null;
      const queryValue = queryResult.rows[0]?.value;
      this.applyState(
        'ready',
        provider.implementationIdentifier,
        queryValue === undefined || queryValue === null
          ? null
          : String(queryValue),
        descriptions,
        null,
      );
    } catch (error) {
      connection?.dispose();
      if (generation !== this.refreshGeneration) return;
      this.applyState(
        'error',
        provider.implementationIdentifier,
        null,
        [],
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  protected providerRegistryChanged(): void {
    if (this.isObserved()) void this.refresh();
    else this.releaseConnection();
  }

  protected observationChanged(isObserved: boolean): void {
    if (isObserved) void this.refresh();
    else {
      this.refreshGeneration++;
      this.releaseConnection();
      this.applyState('idle', null, null, [], null);
    }
  }

  protected releaseConnection(): void {
    this.connection?.dispose();
    this.connection = null;
  }

  protected applyState(
    status: DatabaseConsumerStatus,
    providerIdentifier: string | null,
    queryValue: string | null,
    descriptions: readonly DatabaseObjectDescription[],
    failure: string | null,
  ): void {
    this.status.value = status;
    this.providerIdentifier.value = providerIdentifier;
    this.queryValue.value = queryValue;
    this.descriptions.value = descriptions;
    this.failure.value = failure;
    this.version.value++;
  }
}

export namespace DatabaseConsumerWorkspace {
  export const $Class = $DatabaseConsumerWorkspace;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

export type DatabaseConsumerStatus =
  'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
