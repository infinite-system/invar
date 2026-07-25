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

test('every adopted text input receives the same complete binding table', () => {
  const contexts = ['palette', 'quickopen', 'find', 'agent'] as const;
  const signaturesByContext = contexts.map((context) =>
    KeybindingDefaults.Class.canonicalBindings
      .filter(
        (binding) =>
          binding.context === context &&
          binding.action.startsWith('textInput.'),
      )
      .map((binding) =>
        JSON.stringify({
          action: binding.action,
          chord: binding.chord,
        }),
      ),
  );

  expect(signaturesByContext[0]).toHaveLength(18);
  for (const signatures of signaturesByContext.slice(1)) {
    expect(signatures).toEqual(signaturesByContext[0]!);
  }
  expect(signaturesByContext[0]).toContain(
    JSON.stringify({
      action: 'textInput.deleteNextWord',
      chord: { key: 'delete', alt: true },
    }),
  );
});
