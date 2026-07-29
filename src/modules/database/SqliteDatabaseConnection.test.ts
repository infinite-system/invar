import { expect, test } from 'bun:test';
import { SqliteDatabaseConnection } from './SqliteDatabaseConnection';

test('SQLite queries stay row-bounded and schema descriptions load by parent', async () => {
  const connection = new SqliteDatabaseConnection.Class(':memory:');
  try {
    await connection.query(
      'CREATE TABLE items (identifier INTEGER, label TEXT)',
      0,
    );
    await connection.query(
      "INSERT INTO items VALUES (1, 'one'), (2, 'two'), (3, 'three')",
      0,
    );

    const result = await connection.query(
      'SELECT identifier, label FROM items ORDER BY identifier',
      2,
    );
    expect(result.columns).toEqual(['identifier', 'label']);
    expect(result.rows).toEqual([
      { identifier: 1, label: 'one' },
      { identifier: 2, label: 'two' },
    ]);
    expect(result.hasMoreRows).toBe(true);

    const roots = await connection.describe(null);
    expect(roots).toEqual([
      {
        reference: 'table:items',
        name: 'items',
        kind: 'table',
        detail: null,
        mayHaveChildren: true,
      },
    ]);
    expect(await connection.describe('table:items')).toEqual([
      {
        reference: 'column:items:identifier',
        name: 'identifier',
        kind: 'column',
        detail: 'INTEGER',
        mayHaveChildren: false,
      },
      {
        reference: 'column:items:label',
        name: 'label',
        kind: 'column',
        detail: 'TEXT',
        mayHaveChildren: false,
      },
    ]);
  } finally {
    connection.dispose();
  }
});
