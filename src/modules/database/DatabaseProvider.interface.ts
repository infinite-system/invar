// invariant: Database providers meet through the host registry (src/modules/database/database.invariants.md)
export interface DatabaseProvider {
  readonly capabilityIdentifier: 'database';
  readonly implementationIdentifier: string;
  connect(
    descriptor: DatabaseConnectionDescriptor,
  ): Promise<DatabaseConnection>;
}

export interface DatabaseConnectionDescriptor {
  readonly identifier: string;
  readonly filePath: string;
}

export interface DatabaseConnection {
  query(
    statementText: string,
    maximumRowCount: number,
  ): Promise<DatabaseQueryResult>;
  describe(
    parentReference: string | null,
  ): Promise<readonly DatabaseObjectDescription[]>;
  dispose(): void;
}

export interface DatabaseQueryResult {
  readonly columns: readonly string[];
  readonly rows: readonly Readonly<Record<string, DatabaseValue>>[];
  readonly hasMoreRows: boolean;
  readonly affectedRowCount: number | null;
}

export interface DatabaseObjectDescription {
  readonly reference: string;
  readonly name: string;
  readonly kind: 'table' | 'view' | 'column';
  readonly detail: string | null;
  readonly mayHaveChildren: boolean;
}

export type DatabaseValue =
  string | number | bigint | boolean | Uint8Array | null;
