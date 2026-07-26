import { expect, test } from 'bun:test';
import { ExtensionsPlugin } from './ExtensionsPlugin';

test('extensions plugin declares and activates its primary dock contribution', () => {
  const plugin = new ExtensionsPlugin.Class();
  expect(plugin.primaryDockContentIdentifiers).toEqual(['extensions']);
  expect(plugin.activateApplication).toBeFunction();
});
