import { expect, test } from 'bun:test';
import { DefaultPlugins } from './DefaultPlugins';

test('the shipped application registers its built in contributions', () => {
  const contributors = DefaultPlugins.Class.create();
  expect(
    contributors.flatMap(
      (contributor) => contributor.primaryDockContentIdentifiers ?? [],
    ),
  ).toEqual(['git', 'extensions']);
  expect(
    contributors.map(
      (contributor) => contributor.workspaceContributor !== undefined,
    ),
  ).toEqual([true, true, false]);
});
