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

test('the SQLite provider rejects a missing file instead of creating an empty database', async () => {
  await expect(
    SqliteDatabaseProvider.Class.connect({
      identifier: 'missing',
      filePath: '/tmp/invar-database-file-that-does-not-exist.sqlite',
    }),
  ).rejects.toThrow('SQLite database file does not exist');
});
