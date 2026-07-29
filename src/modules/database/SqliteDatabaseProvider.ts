import { Static } from 'ivue/extras';
import type {
  DatabaseConnection,
  DatabaseConnectionDescriptor,
  DatabaseProvider,
} from './DatabaseProvider.interface';
import { SqliteDatabaseConnection } from './SqliteDatabaseConnection';

class $SqliteDatabaseProvider {
  static readonly capabilityIdentifier = 'database' as const;
  static readonly implementationIdentifier = 'sqlite';

  static async connect(
    descriptor: DatabaseConnectionDescriptor,
  ): Promise<DatabaseConnection> {
    return new SqliteDatabaseConnection.Class(descriptor.filePath);
  }
}

export namespace SqliteDatabaseProvider {
  export const $Class = Static($SqliteDatabaseProvider);
  export let Class: typeof $Class & DatabaseProvider = $Class;
}
