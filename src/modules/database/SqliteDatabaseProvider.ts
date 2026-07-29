import { Static } from 'ivue/extras';
import type {
  DatabaseConnection,
  DatabaseConnectionDescriptor,
  DatabaseProvider,
} from './DatabaseProvider.interface';
import { Files } from '../system/Files';
import { SqliteDatabaseConnection } from './SqliteDatabaseConnection';

class $SqliteDatabaseProvider {
  static readonly capabilityIdentifier = 'database' as const;
  static readonly implementationIdentifier = 'sqlite';

  static async connect(
    descriptor: DatabaseConnectionDescriptor,
  ): Promise<DatabaseConnection> {
    if (
      descriptor.filePath !== ':memory:' &&
      !Files.Class.exists(descriptor.filePath)
    ) {
      throw new Error(
        `SQLite database file does not exist: ${descriptor.filePath}`,
      );
    }
    if (Files.Class.isDir(descriptor.filePath)) {
      throw new Error(
        `SQLite database path is a directory: ${descriptor.filePath}`,
      );
    }
    return new SqliteDatabaseConnection.Class(descriptor.filePath);
  }
}

export namespace SqliteDatabaseProvider {
  export const $Class = Static($SqliteDatabaseProvider);
  export let Class: typeof $Class & DatabaseProvider = $Class;
}
