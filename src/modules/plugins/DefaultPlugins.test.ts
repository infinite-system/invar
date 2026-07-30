import { expect, test } from 'bun:test';
import { DefaultPlugins } from './DefaultPlugins';

test('the shipped application registers its built in contributions', () => {
  const contributors = DefaultPlugins.Class.create();
  expect(
    contributors.map((contributor) => [
      contributor.identifier,
      contributor.name,
    ]),
  ).toEqual([
    ['file-tree', 'File Tree'],
    ['git', 'Git'],
    ['markdown', 'Markdown'],
    ['language', 'Language Intelligence'],
    ['vue', 'Vue'],
    ['database-provider', 'SQLite Provider'],
    ['media', 'Animated Media'],
    ['terminal', 'Terminal'],
    ['inline-rewrite', 'Inline Rewrite'],
    ['source-text-editor', 'Source Text Editor'],
    ['structure-navigator', 'Structure Navigator'],
    ['tasks-dashboard', 'Tasks Dashboard'],
    ['database-consumer', 'Database Explorer'],
    ['monitoring', 'Invar Monitoring'],
    ['extensions', 'Extensions'],
  ]);
  expect(
    contributors.flatMap(
      (contributor) => contributor.primaryDockContentIdentifiers ?? [],
    ),
  ).toEqual(['files', 'git', 'extensions']);
  expect(
    contributors.map(
      (contributor) => contributor.workspaceContributor !== undefined,
    ),
  ).toEqual([
    true,
    true,
    true,
    true,
    true,
    true,
    false,
    false,
    true,
    false,
    true,
    false,
    true,
    // Monitoring is application scope: one process, however many workspaces are open.
    false,
    false,
  ]);
});
