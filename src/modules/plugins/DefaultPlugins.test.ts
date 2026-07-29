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
    ['terminal', 'Terminal'],
    ['inline-rewrite', 'Inline Rewrite'],
    ['source-text-editor', 'Source Text Editor'],
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
  ).toEqual([true, true, true, true, false, true, false, false]);
});
