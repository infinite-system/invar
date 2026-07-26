import { expect, test } from 'bun:test';
import { DefaultPlugins } from './DefaultPlugins';

test('the shipped application registers its built in contributions', () => {
  expect(DefaultPlugins.Class.create()).toHaveLength(1);
});
