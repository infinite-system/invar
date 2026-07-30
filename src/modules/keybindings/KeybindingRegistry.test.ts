import { test, expect, describe } from 'bun:test';
import { KeybindingRegistry, type ChordEvent } from './KeybindingRegistry';
import { KeybindingDefaults } from './KeybindingDefaults';
import { KeybindingMac } from './KeybindingMac';
import { parseKeypress } from '@opentui/core';

function chord(name: string, modifiers: Partial<ChordEvent> = {}): ChordEvent {
  return { name, ctrl: false, shift: false, option: false, ...modifiers };
}

function registryWithDefaults(): KeybindingRegistry.Instance {
  const registry = new KeybindingRegistry.Class();
  registry.registerLayer(
    'canonical',
    KeybindingDefaults.Class.canonicalBindings,
  );
  registry.registerLayer('mac', KeybindingMac.Class.overlayBindings);
  return registry;
}

describe('resolution precedence', () => {
  test('a later layer shadows an earlier one for the same chord', () => {
    const registry = new KeybindingRegistry.Class();
    registry.registerLayer('canonical', [
      { chord: { key: 'k' }, action: 'first' },
    ]);
    registry.registerLayer('user', [{ chord: { key: 'k' }, action: 'second' }]);
    expect(registry.resolve(chord('k'), 'editor', 0).action).toBe('second');
  });

  test('input-overlay opening chords resolve from every input-overlay context', () => {
    const registry = registryWithDefaults();
    const inputOverlayContexts = [
      'find',
      'quickopen',
      'palette',
      'settings',
      'menu',
    ];
    for (const inputOverlayContext of inputOverlayContexts) {
      expect(
        registry.resolve(chord('f', { ctrl: true }), inputOverlayContext, 0)
          .action,
      ).toBe('find.open');
      expect(
        registry.resolve(chord('h', { ctrl: true }), inputOverlayContext, 0)
          .action,
      ).toBe('find.replace');
      expect(
        registry.resolve(chord('p', { ctrl: true }), inputOverlayContext, 0)
          .action,
      ).toBe('quickopen.open');
      expect(registry.resolve(chord('f1'), inputOverlayContext, 0).action).toBe(
        'palette.open',
      );
      expect(
        registry.resolve(chord(',', { ctrl: true }), inputOverlayContext, 0)
          .action,
      ).toBe('settings.toggle');
    }
  });

  test('context bindings apply only in their context; global applies everywhere', () => {
    const registry = registryWithDefaults();
    registry.registerPluginLayer('plugin:sample', [
      { chord: { key: 'o' }, action: 'sample.open', context: 'sample' },
    ]);
    expect(registry.resolve(chord('o'), 'sample', 0).action).toBe(
      'sample.open',
    );
    expect(registry.resolve(chord('o'), 'editor', 0).action).toBeNull(); // typed char, no binding
    expect(
      registry.resolve(chord('q', { ctrl: true }), 'files', 0).action,
    ).toBe('app.quit');
  });

  test('plugin defaults shadow the floor but stay below user rebinds', () => {
    const registry = new KeybindingRegistry.Class();
    registry.registerUserLayer('user', [
      { chord: { key: 'k' }, action: 'user.action' },
    ]);
    registry.registerLayer('canonical', [
      { chord: { key: 'k' }, action: 'host.action' },
      { chord: { key: 'p' }, action: 'host.action' },
    ]);
    registry.registerPluginLayer('plugin:sample', [
      { chord: { key: 'k' }, action: 'plugin.action' },
      { chord: { key: 'p' }, action: 'plugin.action' },
    ]);
    expect(registry.resolve(chord('k'), 'editor', 0).action).toBe(
      'user.action',
    );
    expect(registry.resolve(chord('p'), 'editor', 0).action).toBe(
      'plugin.action',
    );
  });

  test('plugin layers refuse reserved claims and unregister symmetrically', () => {
    const registry = new KeybindingRegistry.Class();
    expect(() =>
      registry.registerPluginLayer('plugin:sample', [
        {
          chord: { key: 'q', ctrl: true },
          action: 'sample.quit',
          reserved: true,
          reservedBecause: 'sample warrant',
        },
      ]),
    ).toThrow('Plugin keybinding cannot reserve sample.quit');
    const unregister = registry.registerPluginLayer('plugin:sample', [
      { chord: { key: 'k' }, action: 'sample.action' },
    ]);
    expect(registry.resolve(chord('k'), 'editor', 0).action).toBe(
      'sample.action',
    );
    unregister();
    expect(registry.resolve(chord('k'), 'editor', 0).action).toBeNull();
  });

  test('guarded single outranks chord start; failed guard lets the chord start', () => {
    const registry = registryWithDefaults();
    let hasSelection = true;
    registry.registerGuard('editorHasSelection', () => hasSelection);
    // With a selection: Ctrl+X = cut (single wins, no chord pending).
    let resolution = registry.resolve(chord('x', { ctrl: true }), 'editor', 0);
    expect(resolution.action).toBe('editor.cut');
    expect(resolution.chordPending).toBe(false);
    // Without: the quit chord arms.
    hasSelection = false;
    resolution = registry.resolve(chord('x', { ctrl: true }), 'editor', 0);
    expect(resolution.action).toBeNull();
    expect(resolution.chordPending).toBe(true);
    registry.cancelChord();
  });
});

describe('reserved global bindings', () => {
  test('quit resolves without a context and does not disturb chord state', () => {
    const registry = registryWithDefaults();
    registry.registerGuard('editorHasSelection', () => false);
    expect(
      registry.resolve(chord('x', { ctrl: true }), 'editor', 0).chordPending,
    ).toBe(true);

    expect(registry.resolveReservedGlobal(chord('q', { ctrl: true }))).toBe(
      'app.quit',
    );
    expect(registry.resolveReservedGlobal(chord('f10'))).toBe('app.quit');
    expect(
      registry.resolveReservedGlobal(chord('p', { ctrl: true })),
    ).toBeNull();

    expect(
      registry.resolve(chord('c', { ctrl: true }), 'editor', 100).action,
    ).toBe('app.quit');
  });
});

describe('multi-step chords', () => {
  test('completes on the second step and reports the action', () => {
    const registry = registryWithDefaults();
    registry.registerGuard('editorHasSelection', () => false);
    expect(
      registry.resolve(chord('x', { ctrl: true }), 'editor', 0).chordPending,
    ).toBe(true);
    const done = registry.resolve(chord('c', { ctrl: true }), 'editor', 100);
    expect(done.action).toBe('app.quit');
    expect(done.chordPending).toBe(false);
  });

  test('shared prefixes retain distinct continuations across layers', () => {
    const registry = new KeybindingRegistry.Class();
    registry.registerLayer('canonical', [
      {
        steps: [
          { key: 'k', ctrl: true },
          { key: 'a', ctrl: true },
        ],
        action: 'canonical.a',
      },
      {
        steps: [
          { key: 'k', ctrl: true },
          { key: 'b', ctrl: true },
        ],
        action: 'canonical.b',
      },
    ]);
    registry.registerUserLayer('user', [
      {
        steps: [
          { key: 'k', ctrl: true },
          { key: 'a', ctrl: true },
        ],
        action: 'user.a',
      },
    ]);

    expect(
      registry.resolve(chord('k', { ctrl: true }), 'editor', 0).chordPending,
    ).toBe(true);
    expect(
      registry.resolve(chord('a', { ctrl: true }), 'editor', 100).action,
    ).toBe('user.a');

    expect(
      registry.resolve(chord('k', { ctrl: true }), 'editor', 200).chordPending,
    ).toBe(true);
    expect(
      registry.resolve(chord('b', { ctrl: true }), 'editor', 300).action,
    ).toBe('canonical.b');
  });

  test('a wrong key breaks the chord and resolves normally', () => {
    const registry = registryWithDefaults();
    registry.registerGuard('editorHasSelection', () => false);
    registry.resolve(chord('x', { ctrl: true }), 'editor', 0);
    const broken = registry.resolve(chord('s', { ctrl: true }), 'editor', 100);
    expect(broken.chordPending).toBe(false);
    expect(broken.action).toBe('editor.save'); // the breaking key still does its own job
  });

  test('the chord times out', () => {
    const registry = registryWithDefaults();
    registry.registerGuard('editorHasSelection', () => false);
    registry.resolve(chord('x', { ctrl: true }), 'editor', 0);
    const late = registry.resolve(chord('c', { ctrl: true }), 'editor', 5000);
    expect(late.action).toBe('editor.copy'); // expired -> plain Ctrl+C = copy
  });
});

describe('shift semantics', () => {
  test("unspecified shift is DON'T-CARE (movement extends via the event, one binding)", () => {
    const registry = registryWithDefaults();
    expect(registry.resolve(chord('up'), 'editor', 0).action).toBe(
      'editor.moveUp',
    );
    expect(
      registry.resolve(chord('up', { shift: true }), 'editor', 0).action,
    ).toBe('editor.moveUp');
  });

  test('explicit shift distinguishes undo from redo', () => {
    const registry = registryWithDefaults();
    expect(
      registry.resolve(chord('z', { ctrl: true }), 'editor', 0).action,
    ).toBe('editor.undo');
    expect(
      registry.resolve(chord('z', { ctrl: true, shift: true }), 'editor', 0)
        .action,
    ).toBe('editor.redo');
  });
});

describe('the canonical floor', () => {
  test('every super-bound action is also reachable without super', () => {
    const registry = registryWithDefaults();
    expect(registry.actionsMissingCanonicalFloor()).toEqual([]);
  });

  test('mac alt word-jumps alias actions the floor also binds', () => {
    const registry = registryWithDefaults();
    expect(
      registry.resolve(chord('left', { option: true }), 'editor', 0).action,
    ).toBe('editor.wordLeft');
    expect(
      registry.resolve(chord('b', { option: true }), 'editor', 0).action,
    ).toBe('editor.wordLeft');
    expect(
      registry.resolve(chord('left', { ctrl: true }), 'editor', 0).action,
    ).toBe('editor.wordLeft');
  });

  test('super chords resolve under kitty fidelity', () => {
    const registry = registryWithDefaults();
    expect(
      registry.resolve(chord('c', { super: true }), 'editor', 0).action,
    ).toBe('editor.copy');
    expect(
      registry.resolve(chord('left', { super: true }), 'editor', 0).action,
    ).toBe('editor.lineStart');
  });

  test('actual Option Backspace and modified Delete sequences resolve to word deletion never close', () => {
    const registry = registryWithDefaults();
    const sequences = [
      parseKeypress('\x1b\x7f'),
      parseKeypress('\x1b[3;3~'),
      parseKeypress('\x1b[127;3u', { useKittyKeyboard: true }),
      parseKeypress('\x1b[57349;3u', { useKittyKeyboard: true }),
    ];

    for (const key of sequences) {
      expect(key).not.toBeNull();
      const resolution = registry.resolve(
        {
          name: key!.name,
          ctrl: key!.ctrl,
          shift: key!.shift,
          option: key!.option || key!.meta,
          super: key!.super,
        },
        'editor',
        0,
      );
      expect(resolution.action).toBe('edit.deletePreviousWord');
      expect(resolution.action).not.toBe('buffer.close');
    }
  });

  test('Alt Backspace and Alt Delete resolve in every present text-input context', () => {
    const registry = registryWithDefaults();
    expect(
      registry.resolve(chord('backspace', { option: true }), 'editor', 0)
        .action,
    ).toBe('edit.deletePreviousWord');
    expect(
      registry.resolve(chord('delete', { option: true }), 'editor', 0).action,
    ).toBe('edit.deletePreviousWord');

    for (const context of ['palette', 'quickopen', 'find', 'agent'] as const) {
      expect(
        registry.resolve(chord('backspace', { option: true }), context, 0)
          .action,
      ).toBe('textInput.deletePreviousWord');
      expect(
        registry.resolve(chord('delete', { option: true }), context, 0).action,
      ).toBe('textInput.deleteNextWord');
    }
  });
});

describe('effective bindings (deliverability honesty)', () => {
  test('a user rebind changes the effective binding for the hint layer', () => {
    const registry = registryWithDefaults();
    const before = registry.effectiveBindings('editor').get('editor.save');
    expect(before?.chord?.key).toBe('s');
    registry.registerLayer('user', [
      {
        chord: { key: 'w', ctrl: true },
        action: 'editor.save',
        context: 'editor',
      },
    ]);
    const after = registry.effectiveBindings('editor').get('editor.save');
    expect(after?.chord?.key).toBe('w');
  });

  test('the hint formats the post-shadowing chord rather than a hard-coded default', () => {
    const registry = new KeybindingRegistry.Class();
    registry.registerLayer('canonical', [
      {
        chord: { key: 'v', ctrl: true, shift: true },
        action: 'markdown.togglePreview',
      },
    ]);
    expect(registry.bindingHint('markdown.togglePreview', 'editor')).toBe(
      'Ctrl+Shift+V',
    );

    registry.registerLayer('user', [
      {
        chord: { key: 'm', alt: true },
        action: 'markdown.togglePreview',
        context: 'editor',
      },
    ]);
    expect(registry.bindingHint('markdown.togglePreview', 'editor')).toBe(
      'Alt+M',
    );
  });
});

// --- hints never advertise an undeliverable chord ------------------------------------------------
// invariant: Advertised bindings are deliverable bindings (src/modules/keybindings/keybindings.invariants.md)

test('a super (Cmd) alias never displaces the floor chord in the hint map', () => {
  const registry = new KeybindingRegistry.Class();
  registry.registerLayer('canonical', [
    { chord: { key: 'p', ctrl: true, shift: false }, action: 'quickopen.open' },
  ]);
  registry.registerLayer('mac', [
    { chord: { key: 'p', super: true }, action: 'quickopen.open' },
  ]);
  expect(registry.bindingHint('quickopen.open', 'global')).toBe('Ctrl+P');
});

test('a user rebind DOES displace the floor chord in the hint map', () => {
  const registry = new KeybindingRegistry.Class();
  registry.registerLayer('canonical', [
    { chord: { key: 'p', ctrl: true, shift: false }, action: 'quickopen.open' },
  ]);
  registry.registerLayer('user', [
    { chord: { key: 'o', ctrl: true }, action: 'quickopen.open' },
  ]);
  expect(registry.bindingHint('quickopen.open', 'global')).toBe('Ctrl+O');
});

describe('the context a resolution came from', () => {
  // A global binding deliberately matches inside every context, so a caller that owns a real
  // surface (a focused terminal receiving raw bytes) cannot tell "mine" from "everyone's" by the
  // action alone. The reported context is how it tells them apart.
  test('a resolution reports whether its binding was scoped or global', () => {
    const registry = new KeybindingRegistry.Class();
    registry.registerLayer('canonical', [
      { chord: { key: 'p', ctrl: true }, action: 'quickopen.open' },
      {
        chord: { key: 'c', ctrl: true },
        action: 'terminal.copy',
        context: 'terminal',
      },
    ]);

    const scoped = registry.resolve(chord('c', { ctrl: true }), 'terminal', 0);
    expect(scoped.action).toBe('terminal.copy');
    expect(scoped.context).toBe('terminal');

    // Matches inside the terminal context, but it belongs to everyone — a surface must let it pass.
    const global = registry.resolve(chord('p', { ctrl: true }), 'terminal', 0);
    expect(global.action).toBe('quickopen.open');
    expect(global.context).toBe('global');

    const unmatched = registry.resolve(
      chord('j', { ctrl: true }),
      'terminal',
      0,
    );
    expect(unmatched.action).toBeNull();
    expect(unmatched.context).toBeNull();
  });

  test('the shipped floor keeps terminal pass-through chords out of the terminal context', () => {
    const registry = registryWithDefaults();
    // Every chord the driven pass-through sweep requires to reach the child must resolve as global
    // (or not at all) when a terminal pane is focused, never as a terminal-scoped binding.
    for (const passThrough of [
      'p',
      'f',
      's',
      'r',
      'u',
      'w',
      'k',
      'l',
      'e',
      'd',
      'a',
    ]) {
      const resolution = registry.resolve(
        chord(passThrough, { ctrl: true }),
        'terminal',
        0,
      );
      expect(resolution.context).not.toBe('terminal');
    }
    expect(
      registry.resolve(chord(',', { ctrl: true }), 'terminal', 0).context,
    ).not.toBe('terminal');
    // The canonical floor declares NO terminal-scoped binding at all — the terminal runtime
    // contributes its own. `TerminalPlugin.test.ts` owns the other half of this pair.
    expect(
      KeybindingDefaults.Class.canonicalBindings.some(
        (binding) => binding.context === 'terminal',
      ),
    ).toBe(false);
  });
});
