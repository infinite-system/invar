import { expect, test } from 'bun:test';
import { SqliteDatabaseProvider } from './SqliteDatabaseProvider';

test('the SQLite provider opens an independent connection', async () => {
  const connection = await SqliteDatabaseProvider.Class.connect({
    identifier: 'test',
    filePath: ':memory:',
  });
  try {
    const result = await connection.query('SELECT 42 AS value', 1);
    expect(result.rows).toEqual([{ value: 42 }]);
    expect(SqliteDatabaseProvider.Class.implementationIdentifier).toBe(
      'sqlite',
    );
  } finally {
    connection.dispose();
  }
});
