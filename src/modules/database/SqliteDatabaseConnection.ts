import { Database as BunSqliteDatabase } from 'bun:sqlite';
import type {
  DatabaseConnection,
  DatabaseObjectDescription,
  DatabaseQueryResult,
  DatabaseValue,
} from './DatabaseProvider.interface';

// invariant: Database answers can exceed the view (src/modules/database/database.invariants.md)
class $SqliteDatabaseConnection implements DatabaseConnection {
  constructor(filePath: string) {
    this.database = new BunSqliteDatabase(filePath);
  }

  protected database: BunSqliteDatabase | null;

  async query(
    statementText: string,
    maximumRowCount: number,
  ): Promise<DatabaseQueryResult> {
    if (!Number.isInteger(maximumRowCount) || maximumRowCount < 0) {
      throw new Error('maximumRowCount must be a non-negative integer');
    }
    const database = this.openDatabase;
    const statement = database.query<Record<string, DatabaseValue>, never[]>(
      statementText,
    );
    if (statement.columnNames.length === 0) {
      const changes = statement.run();
      return {
        columns: [],
        rows: [],
        hasMoreRows: false,
        affectedRowCount: changes.changes,
      };
    }

    const rows: Readonly<Record<string, DatabaseValue>>[] = [];
    let hasMoreRows = false;
    for (const row of statement.iterate()) {
      if (rows.length === maximumRowCount) {
        hasMoreRows = true;
        break;
      }
      rows.push(row);
    }
    return {
      columns: statement.columnNames,
      rows,
      hasMoreRows,
      affectedRowCount: null,
    };
  }

  async describe(
    parentReference: string | null,
  ): Promise<readonly DatabaseObjectDescription[]> {
    const database = this.openDatabase;
    if (parentReference === null) {
      const schemaRows = database
        .query<SqliteSchemaRow, []>(
          "SELECT name, type FROM sqlite_schema WHERE type IN ('table', 'view') " +
            "AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all();
      return schemaRows.map((row) => ({
        reference: `${row.type}:${row.name}`,
        name: row.name,
        kind: row.type,
        detail: null,
        mayHaveChildren: row.type === 'table',
      }));
    }

    const separatorIndex = parentReference.indexOf(':');
    const parentKind = parentReference.slice(0, separatorIndex);
    const parentName = parentReference.slice(separatorIndex + 1);
    if (parentKind !== 'table' || !parentName) return [];
    const escapedTableName = parentName.replaceAll('"', '""');
    const columnRows = database
      .query<SqliteColumnRow, []>(`PRAGMA table_info("${escapedTableName}")`)
      .all();
    const indexRows = database
      .query<SqliteIndexRow, []>(`PRAGMA index_list("${escapedTableName}")`)
      .all();
    return [
      ...columnRows.map((row) => ({
        reference: `column:${parentName}:${row.name}`,
        name: row.name,
        kind: 'column' as const,
        detail: row.type || null,
        mayHaveChildren: false,
      })),
      ...indexRows.map((row) => ({
        reference: `index:${parentName}:${row.name}`,
        name: row.name,
        kind: 'index' as const,
        detail: row.unique === 1 ? 'UNIQUE' : null,
        mayHaveChildren: false,
      })),
    ];
  }

  dispose(): void {
    this.database?.close();
    this.database = null;
  }

  protected get openDatabase(): BunSqliteDatabase {
    if (!this.database) {
      throw new Error('The SQLite database connection is disposed');
    }
    return this.database;
  }
}

export namespace SqliteDatabaseConnection {
  export const $Class = $SqliteDatabaseConnection;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

interface SqliteSchemaRow {
  name: string;
  type: 'table' | 'view';
}

interface SqliteColumnRow {
  name: string;
  type: string;
}

interface SqliteIndexRow {
  name: string;
  unique: number;
}
