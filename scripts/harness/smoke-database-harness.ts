#!/usr/bin/env bun
// This smoke connects the Database pane to a real SQLite file through the Command Palette and
// path field. Run `bun scripts/harness/smoke-database-harness.ts`. PASS lines mean the user
// gesture, schema walk, 20-row pages, reconnect, disconnect, and file errors all held.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Database answers can exceed the view (src/modules/database/database.invariants.md)
// invariant: Database connection cost tracks observation (src/modules/database/database.invariants.md)
import { Database as BunSqliteDatabase } from 'bun:sqlite';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'invar-database-smoke-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-database-smoke-home-'));
const statusPath = join(homeDirectory, 'status.json');
const databasePath = join(fixtureRoot, 'catalog.sqlite');
const lockedDatabasePath = join(fixtureRoot, 'locked.sqlite');
const missingDatabasePath = join(fixtureRoot, 'missing.sqlite');
const corruptDatabasePath = join(fixtureRoot, 'corrupt.sqlite');
mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
writeFileSync(join(fixtureRoot, 'readme.txt'), 'database smoke workspace\n');
writeFileSync(
  corruptDatabasePath,
  'This file is a positive control. It is not a SQLite database.\n',
);

const database = new BunSqliteDatabase(databasePath);
database.run(
  'CREATE TABLE orders (identifier INTEGER PRIMARY KEY, total INTEGER)',
);
database.run('INSERT INTO orders VALUES (1, 125)');
database.run('CREATE TABLE products (identifier INTEGER, name TEXT)');
database.run('CREATE INDEX products_name_index ON products(name)');
for (let identifier = 1; identifier <= 45; identifier++) {
  database.run('INSERT INTO products VALUES (?, ?)', [
    identifier,
    `product-${identifier}`,
  ]);
}
const fixtureRowCount =
  database
    .query<{ count: number }, []>('SELECT COUNT(*) AS count FROM products')
    .get()?.count ?? 0;
database.close();
const lockedDatabase = new BunSqliteDatabase(lockedDatabasePath);
lockedDatabase.run('CREATE TABLE locked_probe (identifier INTEGER)');
lockedDatabase.run('BEGIN EXCLUSIVE');

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 150,
  rows: 44,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath, COLORTERM: 'truecolor' },
  command: [process.execPath, 'src/main.ts', fixtureRoot],
});

async function runPaletteCommand(commandTitle: string): Promise<void> {
  driver.sendKeys('Control+Shift+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `the Command Palette opens for ${commandTitle}`,
    (status) => status.paletteOpen === true,
  );
  const previousPaletteQuery = String(
    HarnessSmoke.Class.readStatus(statusPath).paletteQuery ?? '',
  );
  if (previousPaletteQuery.length > 0) {
    driver.sendKeys(
      ...Array.from({ length: previousPaletteQuery.length }, () => 'Backspace'),
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `the Command Palette clears its previous query for ${commandTitle}`,
      (status) => status.paletteQuery === '',
    );
  }
  driver.sendText(commandTitle);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${commandTitle} is available in the filtered commands`,
    (status) =>
      status.paletteQuery === commandTitle &&
      Number(status.paletteMatches) >= 1,
  );
  driver.sendKeys('Enter');
}

async function connectThroughUserGesture(filePath: string): Promise<void> {
  await runPaletteCommand('Database: Connect');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the shared database path field owns input',
    (status) => status.databasePathInputActive === true,
  );
  const previousDatabasePath = String(
    HarnessSmoke.Class.readStatus(statusPath).databasePathInputValue ?? '',
  );
  if (previousDatabasePath.length > 0) {
    driver.sendKeys(
      ...Array.from({ length: previousDatabasePath.length }, () => 'Backspace'),
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the shared database path field clears the previous path',
      (status) => status.databasePathInputValue === '',
    );
  }
  driver.sendText(filePath);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the database path field contains the user path',
    (status) => status.databasePathInputValue === filePath,
  );
  driver.sendKeys('Enter');
}

try {
  console.log(
    '== database: connect to a real file, browse schema, and page rows ==',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'boot publishes the database provider',
    (status) => status.databaseProviderPluginActive === true,
  );
  await connectThroughUserGesture(databasePath);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the user-selected SQLite file connects',
    (status) =>
      status.databaseConsumerStatus === 'ready' &&
      status.databaseFilePath === databasePath &&
      (status.databaseSchemaObjectNames as string[]).join(',') ===
        'orders,products',
  );
  await driver.awaitGridCondition(
    'the connected database and root schema paint in the pane',
    (snapshot) =>
      snapshot.findText('SQLite connected') !== null &&
      snapshot.findText('orders [table]') !== null &&
      snapshot.findText('products [table]') !== null,
  );
  HarnessSmoke.Class.pass(
    'the Command Palette and shared path field connect a real SQLite file',
  );

  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the one-row orders table uses the same bounded preview path',
    (status) =>
      status.databasePreviewTableName === 'orders' &&
      status.databasePreviewRowCount === 1 &&
      status.databasePreviewHasMoreRows === false,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the orders table collapses back to the two root schema rows',
    (status) =>
      (status.databaseSchemaObjectNames as string[]).join(',') ===
      'orders,products',
  );
  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the products table is selected through the schema walk',
    (status) => status.databaseSelectedSchemaIndex === 1,
  );
  driver.sendKeys('Enter');
  const firstPageStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the products schema and first bounded page load',
    (status) =>
      status.databasePreviewTableName === 'products' &&
      status.databasePreviewPageIndex === 0 &&
      status.databasePreviewRowCount === 20 &&
      status.databasePreviewHasMoreRows === true &&
      (status.databaseSchemaObjectKinds as string[]).includes('column') &&
      (status.databaseSchemaObjectKinds as string[]).includes('index') &&
      (status.databaseSchemaObjectNames as string[]).includes(
        'products_name_index',
      ),
  );
  HarnessSmoke.Class.requireCondition(
    fixtureRowCount === 45 &&
      Number(firstPageStatus.databasePreviewRowCount) === 20,
    'positive control: a 45-row table never publishes more than the 20-row page bound',
  );

  driver.sendKeys('PageDown');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the second bounded page starts at row 21',
    (status) =>
      status.databasePreviewPageIndex === 1 &&
      status.databasePreviewRowCount === 20 &&
      (
        status.databasePreviewFirstRow as {
          identifier?: number;
        } | null
      )?.identifier === 21,
  );
  driver.sendKeys('PageDown');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the final page contains only the remaining five rows',
    (status) =>
      status.databasePreviewPageIndex === 2 &&
      status.databasePreviewRowCount === 5 &&
      status.databasePreviewHasMoreRows === false &&
      (
        status.databasePreviewFirstRow as {
          identifier?: number;
        } | null
      )?.identifier === 41,
  );
  HarnessSmoke.Class.pass(
    'small and large tables, columns, indexes, and all row pages are walkable',
  );

  const versionBeforeReconnect = Number(
    HarnessSmoke.Class.readStatus(statusPath).databaseConsumerVersion,
  );
  await runPaletteCommand('Database: Reconnect');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'reconnect opens the same file through a new lifecycle generation',
    (status) =>
      status.databaseConsumerStatus === 'ready' &&
      status.databaseFilePath === databasePath &&
      Number(status.databaseConsumerVersion) > versionBeforeReconnect,
  );
  HarnessSmoke.Class.pass('reconnect reopens the selected database file');

  await runPaletteCommand('Database: Disconnect');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'disconnect releases the file and returns to the stated empty state',
    (status) =>
      status.databaseConsumerStatus === 'disconnected' &&
      status.databaseFilePath === null &&
      status.databasePreviewRowCount === 0,
  );
  await driver.awaitGridCondition(
    'the disconnected pane states how to connect again',
    (snapshot) => snapshot.findText('No database is connected.') !== null,
  );
  HarnessSmoke.Class.pass('disconnect releases the connection and clears it');

  console.log('== database errors: missing, locked, and corrupt files ==');
  await connectThroughUserGesture(missingDatabasePath);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the missing SQLite path publishes its exact failure',
    (status) =>
      status.databaseConsumerStatus === 'error' &&
      status.databaseFilePath === missingDatabasePath &&
      String(status.databaseConsumerFailure).includes('does not exist'),
  );
  await driver.awaitGridCondition(
    'the missing-file failure is visible in the database pane',
    (snapshot) => snapshot.findText('Connection error') !== null,
  );
  HarnessSmoke.Class.pass('a missing path states that the file does not exist');

  await connectThroughUserGesture(lockedDatabasePath);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the locked SQLite file publishes its exact failure',
    (status) =>
      status.databaseConsumerStatus === 'error' &&
      status.databaseFilePath === lockedDatabasePath &&
      String(status.databaseConsumerFailure).includes('database is locked'),
  );
  await driver.awaitGridCondition(
    'the locked-file failure is visible in the database pane',
    (snapshot) => snapshot.findText('Connection error') !== null,
  );
  HarnessSmoke.Class.pass('a locked database states that it is locked');

  console.log(
    '== database positive control: corrupt bytes state their error ==',
  );
  await connectThroughUserGesture(corruptDatabasePath);
  const corruptStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the corrupt SQLite file publishes its exact failure',
    (status) =>
      status.databaseConsumerStatus === 'error' &&
      status.databaseFilePath === corruptDatabasePath &&
      String(status.databaseConsumerFailure).includes('not a database'),
  );
  await driver.awaitGridCondition(
    'the corrupt-file failure is visible in the database pane',
    (snapshot) => snapshot.findText('Connection error') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    String(corruptStatus.databaseConsumerFailure).includes('not a database'),
    'positive control: corrupt bytes produce a stated not-a-database error',
  );
} finally {
  await driver.dispose();
  lockedDatabase.run('ROLLBACK');
  lockedDatabase.close();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
