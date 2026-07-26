import { expect, test } from 'bun:test';
import { KeybindingDefaults } from './KeybindingDefaults';
import { KeybindingRegistry } from './KeybindingRegistry';

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

test('the popup search field gets the same table minus the keys the popup owns', () => {
  const listPopupTextInputBindings =
    KeybindingDefaults.Class.canonicalBindings.filter(
      (binding) =>
        binding.context === 'listPopup' &&
        binding.action.startsWith('textInput.'),
    );
  const paletteTextInputBindings =
    KeybindingDefaults.Class.canonicalBindings.filter(
      (binding) =>
        binding.context === 'palette' &&
        binding.action.startsWith('textInput.'),
    );
  const unmodifiedHostKeys = new Set(['left', 'right', 'backspace']);
  expect(
    listPopupTextInputBindings.map((binding) =>
      JSON.stringify({ action: binding.action, chord: binding.chord }),
    ),
  ).toEqual(
    paletteTextInputBindings
      .filter((binding) => {
        const chord = binding.chord;
        if (!chord) return true;
        const unmodified = !chord.ctrl && !chord.alt && !chord.super;
        return !(unmodified && unmodifiedHostKeys.has(chord.key));
      })
      .map((binding) =>
        JSON.stringify({ action: binding.action, chord: binding.chord }),
      ),
  );
  // Every word-scale primitive the model implements is reachable in the popup search field.
  const listPopupActions = new Set(
    listPopupTextInputBindings.map((binding) => binding.action),
  );
  expect([...listPopupActions].sort()).toEqual([
    'textInput.deleteForward',
    'textInput.deleteLine',
    'textInput.deleteNextWord',
    'textInput.deletePreviousWord',
    'textInput.moveEnd',
    'textInput.moveHome',
    'textInput.moveWordLeft',
    'textInput.moveWordRight',
  ]);
});

test('popup navigation keys win over the text field while modified chords reach it', () => {
  const registry = new KeybindingRegistry.Class();
  registry.registerLayer(
    'canonical',
    KeybindingDefaults.Class.canonicalBindings,
  );
  const resolveInPopup = (
    event: Parameters<typeof registry.resolve>[0],
  ): string | null => registry.resolve(event, 'listPopup', Date.now()).action;

  const unmodified = { ctrl: false, shift: false, option: false, super: false };
  expect(resolveInPopup({ ...unmodified, name: 'left' })).toBe(
    'listPopup.navigateBackward',
  );
  expect(resolveInPopup({ ...unmodified, name: 'right' })).toBe(
    'listPopup.drill',
  );
  expect(resolveInPopup({ ...unmodified, name: 'backspace' })).toBe(
    'listPopup.erase',
  );
  expect(resolveInPopup({ ...unmodified, name: 'up' })).toBe(
    'listPopup.previous',
  );
  expect(resolveInPopup({ ...unmodified, name: 'return' })).toBe(
    'listPopup.run',
  );
  expect(resolveInPopup({ ...unmodified, name: 'escape' })).toBe(
    'listPopup.close',
  );
  expect(resolveInPopup({ ...unmodified, name: 'left', option: true })).toBe(
    'textInput.moveWordLeft',
  );
  expect(resolveInPopup({ ...unmodified, name: 'right', option: true })).toBe(
    'textInput.moveWordRight',
  );
  expect(resolveInPopup({ ...unmodified, name: 'left', ctrl: true })).toBe(
    'textInput.moveWordLeft',
  );
  expect(
    resolveInPopup({ ...unmodified, name: 'backspace', option: true }),
  ).toBe('textInput.deletePreviousWord');
  expect(resolveInPopup({ ...unmodified, name: 'delete', option: true })).toBe(
    'textInput.deleteNextWord',
  );
  expect(resolveInPopup({ ...unmodified, name: 'delete' })).toBe(
    'textInput.deleteForward',
  );
  expect(resolveInPopup({ ...unmodified, name: 'home' })).toBe(
    'textInput.moveHome',
  );
  expect(resolveInPopup({ ...unmodified, name: 'end' })).toBe(
    'textInput.moveEnd',
  );
  // A field chord the popup shadows is never ADVERTISED for the popup either.
  expect(
    registry.effectiveBindings('listPopup').has('textInput.moveLeft'),
  ).toBe(false);
});
