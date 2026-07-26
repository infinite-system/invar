import { expect, test } from 'bun:test';
import { DefaultPlugins } from './DefaultPlugins';

test('the shipped application registers its built in contributions', () => {
  expect(
    DefaultPlugins.Class.create().flatMap(
      (plugin) => plugin.primaryDockContentIdentifiers ?? [],
    ),
  ).toEqual(['files', 'git', 'extensions']);
});
