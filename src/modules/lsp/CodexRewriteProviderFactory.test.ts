import { expect, test } from 'bun:test';
import { CodexRewriteProviderFactory } from './CodexRewriteProviderFactory';

test('the factory creates independent rewrite provider lifetimes', () => {
  const firstProvider = CodexRewriteProviderFactory.Class.create();
  const secondProvider = CodexRewriteProviderFactory.Class.create();

  expect(firstProvider).not.toBe(secondProvider);

  firstProvider.dispose();
  secondProvider.dispose();
});
