import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import { Files } from '../system/Files';
import type { Workspace } from '../workspace/Workspace';
import type { WorkspaceContribution } from '../workspace/WorkspaceContributor.interface';
import type {
  DatabaseConnection,
  DatabaseObjectDescription,
  DatabaseProvider,
  DatabaseValue,
} from './DatabaseProvider.interface';

// invariant: Provider rendezvous is host carried (src/modules/plugins/plugins.invariants.md)
// invariant: Database providers meet through the host registry (src/modules/database/database.invariants.md)
// invariant: Database connection cost tracks observation (src/modules/database/database.invariants.md)
// invariant: Database answers can exceed the view (src/modules/database/database.invariants.md)
// invariant: Database files are user selected (src/modules/database/database.invariants.md)
class $DatabaseConsumerWorkspace implements WorkspaceContribution {
  declare $watch: typeof import('vue').watch;
  declare $stopEffects: () => void;
  protected connection: DatabaseConnection | null = null;
  protected refreshGeneration = 0;
  protected browseGeneration = 0;

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
  get filePath() {
    return ref<string | null>(null);
  }
  get descriptions() {
    return shallowRef<readonly DatabaseTreeRow[]>([]);
  }
  get selectedDescriptionIndex() {
    return ref(-1);
  }
  get previewTableName() {
    return ref<string | null>(null);
  }
  get previewColumns() {
    return shallowRef<readonly string[]>([]);
  }
  get previewRows() {
    return shallowRef<readonly Readonly<Record<string, DatabaseValue>>[]>([]);
  }
  get previewPageIndex() {
    return ref(0);
  }
  get previewHasMoreRows() {
    return ref(false);
  }
  get failure() {
    return ref<string | null>(null);
  }
  get version() {
    return ref(0);
  }

  get selectedDescription(): DatabaseTreeRow | null {
    return this.descriptions.value[this.selectedDescriptionIndex.value] ?? null;
  }

  opened(_root: string): void {
    void this.refresh();
  }

  suspended(): void {
    this.invalidateRequests();
    this.releaseConnection();
    this.applyDisconnectedState('idle', null);
  }

  resumed(): void {
    void this.refresh();
  }

  disposed(): void {
    this.invalidateRequests();
    this.releaseConnection();
    this.$stopEffects();
  }

  async connect(filePath: string): Promise<void> {
    const trimmedPath = filePath.trim();
    if (trimmedPath.length === 0) {
      this.applyFailure('Database file path is required.');
      return;
    }
    this.filePath.value = Files.Class.resolveFrom(
      this.workspace.root,
      trimmedPath,
    );
    await this.refresh();
  }

  disconnect(): void {
    this.invalidateRequests();
    this.releaseConnection();
    this.filePath.value = null;
    const provider =
      this.workspace.providers.resolve<DatabaseProvider>('database');
    this.applyDisconnectedState(
      provider ? 'disconnected' : 'unavailable',
      provider?.implementationIdentifier ?? null,
    );
  }

  async reconnect(): Promise<void> {
    if (!this.filePath.value) {
      this.applyFailure('Choose a database file before reconnecting.');
      return;
    }
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const generation = ++this.refreshGeneration;
    this.browseGeneration++;
    this.releaseConnection();
    if (!this.isObserved()) {
      this.applyDisconnectedState('idle', null);
      return;
    }
    const provider =
      this.workspace.providers.resolve<DatabaseProvider>('database');
    if (!provider) {
      this.applyDisconnectedState('unavailable', null);
      return;
    }
    const filePath = this.filePath.value;
    if (!filePath) {
      this.applyDisconnectedState(
        'disconnected',
        provider.implementationIdentifier,
      );
      return;
    }

    this.applyLoadingState(provider.implementationIdentifier);
    let connection: DatabaseConnection | null = null;
    try {
      connection = await provider.connect({
        identifier: filePath,
        filePath,
      });
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
      this.applyReadyState(
        provider.implementationIdentifier,
        descriptions.map((description) => ({
          description,
          depth: 0,
          expanded: false,
        })),
      );
    } catch (error) {
      connection?.dispose();
      if (generation !== this.refreshGeneration) return;
      this.applyFailure(
        error instanceof Error ? error.message : String(error),
        provider.implementationIdentifier,
      );
    }
  }

  moveSelection(delta: number): void {
    if (this.descriptions.value.length === 0) return;
    const currentIndex = Math.max(0, this.selectedDescriptionIndex.value);
    this.selectedDescriptionIndex.value = Math.max(
      0,
      Math.min(this.descriptions.value.length - 1, currentIndex + delta),
    );
    this.version.value++;
  }

  async activateSelectedDescription(): Promise<void> {
    const selected = this.selectedDescription;
    if (!selected || selected.depth !== 0) return;
    if (
      selected.description.kind !== 'table' &&
      selected.description.kind !== 'view'
    ) {
      return;
    }
    if (selected.expanded) {
      this.collapseDescription(selected.description.reference);
      return;
    }
    await this.expandDescription(selected);
  }

  async nextPreviewPage(): Promise<void> {
    if (!this.previewTableName.value || !this.previewHasMoreRows.value) return;
    await this.loadPreview(
      this.previewTableName.value,
      this.previewPageIndex.value + 1,
    );
  }

  async previousPreviewPage(): Promise<void> {
    if (!this.previewTableName.value || this.previewPageIndex.value === 0)
      return;
    await this.loadPreview(
      this.previewTableName.value,
      this.previewPageIndex.value - 1,
    );
  }

  protected async expandDescription(selected: DatabaseTreeRow): Promise<void> {
    const connection = this.connection;
    if (!connection) return;
    const generation = ++this.browseGeneration;
    try {
      const children = selected.description.mayHaveChildren
        ? await connection.describe(selected.description.reference)
        : [];
      if (
        generation !== this.browseGeneration ||
        connection !== this.connection
      )
        return;
      const selectedIndex = this.descriptions.value.indexOf(selected);
      if (selectedIndex < 0) return;
      const expanded = { ...selected, expanded: true };
      this.descriptions.value = [
        ...this.descriptions.value.slice(0, selectedIndex),
        expanded,
        ...children.map((description) => ({
          description,
          depth: 1,
          expanded: false,
        })),
        ...this.descriptions.value.slice(selectedIndex + 1),
      ];
      await this.loadPreview(selected.description.name, 0);
      this.version.value++;
    } catch (error) {
      if (generation !== this.browseGeneration) return;
      this.applyFailure(error instanceof Error ? error.message : String(error));
    }
  }

  protected collapseDescription(reference: string): void {
    const selectedIndex = this.descriptions.value.findIndex(
      (row) => row.description.reference === reference,
    );
    if (selectedIndex < 0) return;
    const selected = this.descriptions.value[selectedIndex];
    if (!selected) return;
    let followingIndex = selectedIndex + 1;
    while (
      followingIndex < this.descriptions.value.length &&
      (this.descriptions.value[followingIndex]?.depth ?? 0) > selected.depth
    ) {
      followingIndex++;
    }
    this.descriptions.value = [
      ...this.descriptions.value.slice(0, selectedIndex),
      { ...selected, expanded: false },
      ...this.descriptions.value.slice(followingIndex),
    ];
    this.version.value++;
  }

  protected async loadPreview(
    tableName: string,
    pageIndex: number,
  ): Promise<void> {
    const connection = this.connection;
    if (!connection) return;
    const generation = ++this.browseGeneration;
    try {
      const escapedTableName = tableName.replaceAll('"', '""');
      const result = await connection.query(
        `SELECT * FROM "${escapedTableName}" ` +
          `LIMIT ${this.previewPageSize + 1} ` +
          `OFFSET ${pageIndex * this.previewPageSize}`,
        this.previewPageSize,
      );
      if (
        generation !== this.browseGeneration ||
        connection !== this.connection
      )
        return;
      this.previewTableName.value = tableName;
      this.previewColumns.value = result.columns;
      this.previewRows.value = result.rows;
      this.previewPageIndex.value = pageIndex;
      this.previewHasMoreRows.value = result.hasMoreRows;
      this.version.value++;
    } catch (error) {
      if (
        generation !== this.browseGeneration ||
        connection !== this.connection
      )
        return;
      this.releaseConnection();
      this.applyFailure(error instanceof Error ? error.message : String(error));
    }
  }

  protected get previewPageSize(): number {
    return 20;
  }

  protected providerRegistryChanged(): void {
    if (this.isObserved()) void this.refresh();
    else {
      this.invalidateRequests();
      this.releaseConnection();
    }
  }

  protected observationChanged(isObserved: boolean): void {
    if (isObserved) void this.refresh();
    else {
      this.invalidateRequests();
      this.releaseConnection();
      this.applyDisconnectedState('idle', null);
    }
  }

  protected invalidateRequests(): void {
    this.refreshGeneration++;
    this.browseGeneration++;
  }

  protected releaseConnection(): void {
    this.connection?.dispose();
    this.connection = null;
  }

  protected applyDisconnectedState(
    status: 'idle' | 'disconnected' | 'unavailable',
    providerIdentifier: string | null,
  ): void {
    this.status.value = status;
    this.providerIdentifier.value = providerIdentifier;
    this.clearBrowseState();
    this.failure.value = null;
    this.version.value++;
  }

  protected applyLoadingState(providerIdentifier: string): void {
    this.status.value = 'loading';
    this.providerIdentifier.value = providerIdentifier;
    this.clearBrowseState();
    this.failure.value = null;
    this.version.value++;
  }

  protected applyReadyState(
    providerIdentifier: string,
    descriptions: readonly DatabaseTreeRow[],
  ): void {
    this.status.value = 'ready';
    this.providerIdentifier.value = providerIdentifier;
    this.descriptions.value = descriptions;
    this.selectedDescriptionIndex.value = descriptions.length > 0 ? 0 : -1;
    this.clearPreviewState();
    this.failure.value = null;
    this.version.value++;
  }

  protected applyFailure(
    failure: string,
    providerIdentifier = this.providerIdentifier.value,
  ): void {
    this.status.value = 'error';
    this.providerIdentifier.value = providerIdentifier;
    this.clearBrowseState();
    this.failure.value = failure;
    this.version.value++;
  }

  protected clearBrowseState(): void {
    this.descriptions.value = [];
    this.selectedDescriptionIndex.value = -1;
    this.clearPreviewState();
  }

  protected clearPreviewState(): void {
    this.previewTableName.value = null;
    this.previewColumns.value = [];
    this.previewRows.value = [];
    this.previewPageIndex.value = 0;
    this.previewHasMoreRows.value = false;
  }
}

export namespace DatabaseConsumerWorkspace {
  export const $Class = $DatabaseConsumerWorkspace;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

export type DatabaseConsumerStatus =
  'idle' | 'disconnected' | 'loading' | 'ready' | 'unavailable' | 'error';

export interface DatabaseTreeRow {
  readonly description: DatabaseObjectDescription;
  readonly depth: number;
  readonly expanded: boolean;
}
