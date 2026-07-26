// The platform substitution: ONE modifier differs, nothing else may. These tests are the mechanism
// that makes the mac layer unable to DRIFT from the canonical floor.
import { expect, test } from 'bun:test';
import { KeybindingDefaults } from './KeybindingDefaults';
import { KeybindingPlatform } from './KeybindingPlatform';
import { KeybindingMac } from './KeybindingMac';
import { KeybindingRegistry } from './KeybindingRegistry';

const canonicalBindings = KeybindingDefaults.Class.canonicalBindings;

test('every generated alias is the SAME binding with super in place of ctrl', () => {
  const aliases =
    KeybindingPlatform.Class.primaryModifierAliases(canonicalBindings);
  expect(aliases.length).toBeGreaterThan(0);
  for (const alias of aliases) {
    expect(alias.chord?.super).toBe(true);
    expect(alias.chord?.ctrl).toBeUndefined();
    // The floor must carry the identical chord with ctrl, the identical action, context and guard —
    // i.e. the alias cannot mean anything the floor does not already mean.
    const floorTwin = canonicalBindings.find(
      (binding) =>
        binding.action === alias.action &&
        binding.context === alias.context &&
        binding.when === alias.when &&
        binding.chord?.key === alias.chord?.key &&
        binding.chord?.ctrl === true &&
        (binding.chord?.shift ?? undefined) ===
          (alias.chord?.shift ?? undefined) &&
        (binding.chord?.alt ?? undefined) === (alias.chord?.alt ?? undefined),
    );
    expect(floorTwin).toBeDefined();
  }
});

test('a reserved chord keeps its reservation and warrant across the substitution', () => {
  const quitAlias = KeybindingPlatform.Class.primaryModifierAliases(
    canonicalBindings,
  ).find((binding) => binding.action === 'app.quit');
  expect(quitAlias?.chord).toEqual({ key: 'q', super: true });
  expect(quitAlias?.reserved).toBe(true);
  expect(quitAlias?.reservedBecause).toBeTruthy();
});

test('a chord MEANS the same thing on macOS as on Linux (no parallel-table drift)', () => {
  const registry = new KeybindingRegistry.Class();
  registry.registerLayer('canonical', canonicalBindings);
  registry.registerLayer('mac', KeybindingMac.Class.overlayBindings);
  const resolveGlobally = (
    event: Parameters<typeof registry.resolve>[0],
  ): string | null => registry.resolve(event, 'editor', Date.now()).action;
  const base = { ctrl: false, shift: false, option: false, super: false };
  // Ctrl+P and Cmd+P are the SAME intent; the pre-generator overlay had Cmd+P = palette.open while
  // the floor had Ctrl+P = quickopen.open — exactly the drift the generator makes unrepresentable.
  expect(resolveGlobally({ ...base, name: 'p', ctrl: true })).toBe(
    'quickopen.open',
  );
  expect(resolveGlobally({ ...base, name: 'p', super: true })).toBe(
    'quickopen.open',
  );
  expect(resolveGlobally({ ...base, name: 'p', ctrl: true, shift: true })).toBe(
    'palette.open',
  );
  expect(
    resolveGlobally({ ...base, name: 'p', super: true, shift: true }),
  ).toBe('palette.open');
});

test('no action is reachable only with super (the canonical floor holds)', () => {
  const registry = new KeybindingRegistry.Class();
  registry.registerLayer('canonical', canonicalBindings);
  registry.registerLayer('mac', KeybindingMac.Class.overlayBindings);
  expect(registry.actionsMissingCanonicalFloor()).toEqual([]);
});

test('the hand-written mac residue is only what no substitution can derive', () => {
  const generatedSignatures = new Set(
    KeybindingPlatform.Class.primaryModifierAliases(canonicalBindings).map(
      (binding) => JSON.stringify([binding.action, binding.chord]),
    ),
  );
  const residue = KeybindingMac.Class.overlayBindings.filter(
    (binding) =>
      !generatedSignatures.has(JSON.stringify([binding.action, binding.chord])),
  );
  // Option word/paragraph jumps and the four Cmd+arrow document motions — meanings the Ctrl forms do
  // NOT carry, so they can only be hand-written.
  expect(residue.map((binding) => binding.action).sort()).toEqual([
    'editor.documentEnd',
    'editor.documentStart',
    'editor.jumpDown',
    'editor.jumpUp',
    'editor.lineEnd',
    'editor.lineStart',
    'editor.wordLeft',
    'editor.wordLeft',
    'editor.wordRight',
    'editor.wordRight',
  ]);
});
