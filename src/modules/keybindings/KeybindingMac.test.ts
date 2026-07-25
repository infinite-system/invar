import { expect, test } from 'bun:test';
import { KeybindingMac } from './KeybindingMac';

test('mac bindings are cached aliases over super-capable actions', () => {
  expect(KeybindingMac.Class.overlayBindings).toBe(
    KeybindingMac.Class.overlayBindings,
  );
  expect(
    KeybindingMac.Class.overlayBindings.some(
      (binding) => binding.action === 'editor.copy' && binding.chord?.super,
    ),
  ).toBe(true);
});
