import { expect, test } from 'bun:test';
import { KeybindingDefaults } from './KeybindingDefaults';

test('canonical bindings are cached and contain the universal quit floor', () => {
  expect(KeybindingDefaults.Class.canonicalBindings).toBe(
    KeybindingDefaults.Class.canonicalBindings,
  );
  expect(
    KeybindingDefaults.Class.canonicalBindings.some(
      (binding) => binding.action === 'app.quit' && binding.chord?.ctrl,
    ),
  ).toBe(true);
});
