import { expect, test } from 'bun:test';
import { parseKeypress } from '@opentui/core';
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

test('shared chord prefixes retain every continuation and cancel unmatched input', () => {
  const registry = registryWithCanonicalLayer();
  const modifiedBracket = {
    ctrl: true,
    shift: true,
    option: false,
    super: false,
  };
  expect(
    registry.resolve({ ...modifiedBracket, name: '[' }, 'editor', 0).action,
  ).toBe('workspace.previous');
  expect(
    registry.resolve({ ...modifiedBracket, name: ']' }, 'editor', 0).action,
  ).toBe('workspace.next');

  const controlK = {
    name: 'k',
    ctrl: true,
    shift: false,
    option: false,
    super: false,
  };
  const controlG = { ...controlK, name: 'g' };
  expect(registry.resolve(controlK, 'editor', 1).chordPending).toBe(true);
  expect(registry.resolve(controlG, 'editor', 2).action).toBe(
    'editor.goToLine',
  );

  const plainBracket = {
    name: '[',
    ctrl: false,
    shift: false,
    option: false,
    super: false,
  };
  expect(registry.resolve(controlK, 'editor', 3).chordPending).toBe(true);
  expect(registry.resolve(plainBracket, 'editor', 4).action).toBe(
    'editor.fold',
  );
  const controlL = { ...controlK, name: 'l' };
  expect(registry.resolve(controlL, 'editor', 5).chordPending).toBe(true);
  expect(
    registry.resolve({ ...plainBracket, name: ']' }, 'editor', 6).action,
  ).toBe('editor.unfold');

  expect(registry.resolve(controlK, 'editor', 7).chordPending).toBe(true);
  expect(registry.resolve({ ...plainBracket, name: 'z' }, 'editor', 8)).toEqual(
    { action: null, chordPending: false, context: null },
  );
});

test('fold chord bytes arrive through both OpenTUI parsers', () => {
  const decodedSteps = (
    inputBytes: readonly string[],
    useKittyKeyboard: boolean,
  ) =>
    inputBytes.map((input) => {
      const event = parseKeypress(input, { useKittyKeyboard });
      if (!event) throw new Error(`Parser rejected ${JSON.stringify(input)}`);
      return {
        name: event.name,
        ctrl: event.ctrl,
        shift: event.shift,
        option: event.option,
      };
    });
  for (const useKittyKeyboard of [false, true]) {
    expect(decodedSteps(['\x0b', '['], useKittyKeyboard)).toEqual([
      { name: 'k', ctrl: true, shift: false, option: false },
      { name: '[', ctrl: false, shift: false, option: false },
    ]);
    expect(decodedSteps(['\x0c', ']'], useKittyKeyboard)).toEqual([
      { name: 'l', ctrl: true, shift: false, option: false },
      { name: ']', ctrl: false, shift: false, option: false },
    ]);
  }
});

test('navigation history binds Alt arrows and the Ctrl Alt bracket fallback', () => {
  const registry = registryWithCanonicalLayer();
  const altEvent = {
    ctrl: false,
    shift: false,
    option: true,
    super: false,
  };
  expect(
    registry.resolve({ ...altEvent, name: 'left' }, 'editor', 0).action,
  ).toBe('navigation.back');
  expect(
    registry.resolve({ ...altEvent, name: 'right' }, 'editor', 0).action,
  ).toBe('navigation.forward');
  expect(
    registry.resolve({ ...altEvent, name: '[', ctrl: true }, 'editor', 0)
      .action,
  ).toBe('navigation.back');
  expect(
    registry.resolve({ ...altEvent, name: ']', ctrl: true }, 'editor', 0)
      .action,
  ).toBe('navigation.forward');
});

// --- focus owns the keystroke -------------------------------------------------------------------
// invariant: Focus owns the keystroke (src/modules/keybindings/keybindings.invariants.md)

function registryWithCanonicalLayer(): KeybindingRegistry.Instance {
  const registry = new KeybindingRegistry.Class();
  registry.registerLayer(
    'canonical',
    KeybindingDefaults.Class.canonicalBindings,
  );
  return registry;
}

const unmodifiedEvent = {
  ctrl: false,
  shift: false,
  option: false,
  super: false,
};

test('every RESERVED binding carries a warrant and a modifier (or is a fallback F-key)', () => {
  const registry = registryWithCanonicalLayer();
  expect(registry.reservedSetProblems()).toEqual([]);
});

test('the reserved set is SMALL and holds only frame-scoped actions', () => {
  const reservedActions = new Set(
    KeybindingDefaults.Class.canonicalBindings
      .filter((binding) => binding.reserved)
      .map((binding) => binding.action),
  );
  expect([...reservedActions].sort()).toEqual([
    'app.quit',
    'panel.toggleAgent',
    'panel.toggleSplit',
    'panel.toggleTerminal',
    'view.toggleRightDock',
  ]);
});

test('the host claims no unmodified key globally — that is what freed Tab', () => {
  const unmodifiedGlobalClaims = KeybindingDefaults.Class.canonicalBindings
    .filter((binding) => (binding.context ?? 'global') === 'global')
    .filter((binding) => {
      const chord = binding.chord;
      if (!chord) return false;
      const hasModifier =
        chord.ctrl || chord.alt || chord.super || chord.shift === true;
      const isFunctionKey = /^f[0-9]{1,2}$/.test(chord.key);
      return !hasModifier && !isFunctionKey;
    })
    .map((binding) => `${binding.chord?.key} -> ${binding.action}`);
  expect(unmodifiedGlobalClaims).toEqual([]);
});

test('Tab and Shift+Tab are the EDITOR surface s indentation, not a focus move', () => {
  const registry = registryWithCanonicalLayer();
  expect(
    registry.resolve({ ...unmodifiedEvent, name: 'tab' }, 'editor', 0).action,
  ).toBe('editor.indent');
  expect(
    registry.resolve(
      { ...unmodifiedEvent, name: 'tab', shift: true },
      'editor',
      0,
    ).action,
  ).toBe('editor.outdent');
  // The tree surfaces spend Tab on leaving themselves — a SURFACE choice, not a host claim.
  expect(
    registry.resolve({ ...unmodifiedEvent, name: 'tab' }, 'files', 0).action,
  ).toBeNull();
  // In a focused terminal or agent pane nothing resolves Tab, so it reaches the child.
  expect(
    registry.resolve({ ...unmodifiedEvent, name: 'tab' }, 'terminal', 0).action,
  ).toBe(null);
  expect(
    registry.resolve({ ...unmodifiedEvent, name: 'tab' }, 'agent', 0).action,
  ).toBe(null);
});

test('activity and panel lists share Alt arrow reorder gestures', () => {
  const registry = registryWithCanonicalLayer();
  const altUp = {
    ...unmodifiedEvent,
    name: 'up',
    option: true,
  };
  const altDown = {
    ...unmodifiedEvent,
    name: 'down',
    option: true,
  };

  expect(registry.resolve(altUp, 'panel', 0).action).toBe(
    'panel.contentsMoveUp',
  );
  expect(registry.resolve(altDown, 'panel', 0).action).toBe(
    'panel.contentsMoveDown',
  );
  expect(registry.resolve(altUp, 'activity', 0).action).toBe(
    'activity.moveItemUp',
  );
  expect(registry.resolve(altDown, 'activity', 0).action).toBe(
    'activity.moveItemDown',
  );
});

test('Settings uses the editor copy chord through its own context', () => {
  const registry = registryWithCanonicalLayer();
  const controlC = {
    ...unmodifiedEvent,
    name: 'c',
    ctrl: true,
  };
  expect(registry.resolve(controlC, 'editor', 0).action).toBe('editor.copy');
  expect(registry.resolve(controlC, 'settings', 0).action).toBe(
    'settings.copy',
  );
});

test('inline rewrite modified chords arrive through both OpenTUI parsers', () => {
  const encodedChords = [
    '\x1b[27;6;114~',
    '\x1b[1;7C',
    '\x1b[1;7B',
    '\x1b[1;7A',
  ];
  const expectedEvents = [
    { name: 'r', ctrl: true, shift: true, option: false },
    { name: 'right', ctrl: true, shift: false, option: true },
    { name: 'down', ctrl: true, shift: false, option: true },
    { name: 'up', ctrl: true, shift: false, option: true },
  ];
  for (const useKittyKeyboard of [false, true]) {
    expect(
      encodedChords.map((encodedChord) => {
        const event = parseKeypress(encodedChord, { useKittyKeyboard });
        if (!event) throw new Error('OpenTUI rejected a rewrite chord');
        return {
          name: event.name,
          ctrl: event.ctrl,
          shift: event.shift,
          option: event.option,
        };
      }),
    ).toEqual(expectedEvents);
  }
});

test('no F-key is the PRIMARY (last-listed) binding of any action', () => {
  const registry = registryWithCanonicalLayer();
  const functionKeyPrimaries: string[] = [];
  for (const context of [
    'global',
    'editor',
    'agent',
    'files',
    'git',
  ] as const) {
    for (const [action, binding] of registry.effectiveBindings(context)) {
      if (binding.chord && /^f[0-9]{1,2}$/.test(binding.chord.key)) {
        functionKeyPrimaries.push(`${action} (${context})`);
      }
    }
  }
  expect(functionKeyPrimaries).toEqual([]);
});

test('exactly two F-keys survive, both as retained fallback ALIASES', () => {
  const functionKeyBindings = KeybindingDefaults.Class.canonicalBindings
    .filter(
      (binding) => binding.chord && /^f[0-9]{1,2}$/.test(binding.chord.key),
    )
    .map((binding) => `${binding.chord?.key} -> ${binding.action}`);
  expect(functionKeyBindings.sort()).toEqual([
    'f1 -> palette.open',
    'f10 -> app.quit',
  ]);
});

test('every retired F-key chord resolves to the replacement it was given', () => {
  const registry = registryWithCanonicalLayer();
  const resolveIn = (
    context: string,
    event: Partial<Parameters<typeof registry.resolve>[0]> & { name: string },
  ): string | null =>
    registry.resolve({ ...unmodifiedEvent, ...event }, context, 0).action;

  expect(resolveIn('editor', { name: 'p', ctrl: true, shift: true })).toBe(
    'palette.open',
  );
  expect(resolveIn('editor', { name: 'h', ctrl: true, shift: true })).toBe(
    'help.shortcuts',
  );
  expect(resolveIn('agent', { name: 'm', ctrl: true, shift: true })).toBe(
    'agent.cycleTerminalFollowMode',
  );
  expect(resolveIn('editor', { name: 'j', ctrl: true, shift: true })).toBe(
    'focus.toggle',
  );
  // Reserved chords are matched statelessly ahead of every mode.
  expect(
    registry.resolveReservedGlobal({
      ...unmodifiedEvent,
      name: 's',
      ctrl: true,
      shift: true,
    }),
  ).toBe('panel.toggleSplit');
  expect(
    registry.resolveReservedGlobal({
      ...unmodifiedEvent,
      name: 'j',
      ctrl: true,
    }),
  ).toBe('panel.toggleTerminal');
  // Ctrl+J delivered as the bare C0 byte arrives named `linefeed`; the registry normalizes it back
  // to the CHORD, which is what the panel toggle is addressed by.
  expect(
    registry.resolveReservedGlobal({ ...unmodifiedEvent, name: 'linefeed' }),
  ).toBe('panel.toggleTerminal');
  // Ctrl+Shift+J must NOT be swallowed by the reserved panel toggle.
  expect(
    registry.resolveReservedGlobal({
      ...unmodifiedEvent,
      name: 'j',
      ctrl: true,
      shift: true,
    }),
  ).toBe(null);
});

test('the host floor names NO contributed-surface action — the surface owns its keys', () => {
  // Ctrl+Shift+Up/Down are the comparison surface's change-navigation chords (GitComparisonContent),
  // and a contributed surface consumes editor keys BEFORE this table is consulted. In the host's
  // floor the same chords must therefore keep their editor meaning, and no plugin action may appear.
  const registry = registryWithCanonicalLayer();
  const resolveArrow = (name: 'up' | 'down'): string | null =>
    registry.resolve(
      { ...unmodifiedEvent, name, ctrl: true, shift: true },
      'editor',
      0,
    ).action;
  expect(resolveArrow('up')).toBe('editor.jumpUp');
  expect(resolveArrow('down')).toBe('editor.jumpDown');
  const floorActions = KeybindingDefaults.Class.canonicalBindings.map(
    (binding) => binding.action,
  );
  expect(floorActions.filter((action) => action.startsWith('diff.'))).toEqual(
    [],
  );
});

test('every adopted text input receives the same complete binding table', () => {
  const contexts = [
    'palette',
    'quickopen',
    'goToLine',
    'find',
    'agent',
  ] as const;
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

  expect(signaturesByContext[0]).toHaveLength(30);
  for (const signatures of signaturesByContext.slice(1)) {
    expect(signatures).toEqual(signaturesByContext[0]!);
  }
  expect(signaturesByContext[0]).toContain(
    JSON.stringify({
      action: 'textInput.deleteNextWord',
      chord: { key: 'delete', alt: true },
    }),
  );
  expect(signaturesByContext[0]).toContain(
    JSON.stringify({
      action: 'textInput.selectLeft',
      chord: { key: 'left', shift: true },
    }),
  );
  expect(signaturesByContext[0]).toContain(
    JSON.stringify({
      action: 'textInput.copy',
      chord: { key: 'c', ctrl: true },
    }),
  );
});

test('agent copy keeps transcript ownership while Shift arrows reach the composer input', () => {
  const registry = registryWithCanonicalLayer();
  expect(
    registry.resolve({ ...unmodifiedEvent, name: 'c', ctrl: true }, 'agent', 0)
      .action,
  ).toBe('agent.copy');
  expect(
    registry.resolve(
      { ...unmodifiedEvent, name: 'left', shift: true },
      'agent',
      0,
    ).action,
  ).toBe('textInput.selectLeft');
});

test('Alt+G opens go-to-line without taking the Git chords', () => {
  const registry = new KeybindingRegistry.Class();
  registry.registerLayer(
    'canonical',
    KeybindingDefaults.Class.canonicalBindings,
  );
  expect(
    registry.resolve(
      {
        name: 'g',
        ctrl: false,
        shift: false,
        option: true,
        super: false,
      },
      'editor',
      0,
    ).action,
  ).toBe('editor.goToLine');
  expect(
    KeybindingDefaults.Class.canonicalBindings.some(
      (binding) =>
        binding.action === 'editor.goToLine' && binding.chord?.ctrl === true,
    ),
  ).toBe(false);
  expect(registry.bindingHint('editor.goToLine', 'editor')).toBe('Alt+G');
});

test('Alt+Z toggles word wrap through the panel command action', () => {
  const registry = new KeybindingRegistry.Class();
  registry.registerLayer(
    'canonical',
    KeybindingDefaults.Class.canonicalBindings,
  );
  expect(
    registry.resolve(
      {
        name: 'z',
        ctrl: false,
        shift: false,
        option: true,
        super: false,
      },
      'editor',
      0,
    ).action,
  ).toBe('view.toggleWordWrap');
  expect(registry.bindingHint('view.toggleWordWrap', 'editor')).toBe('Alt+Z');
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
        const unmodified =
          !chord.ctrl && !chord.alt && !chord.super && chord.shift !== true;
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
    'textInput.copy',
    'textInput.deleteForward',
    'textInput.deleteLine',
    'textInput.deleteNextWord',
    'textInput.deletePreviousWord',
    'textInput.moveEnd',
    'textInput.moveHome',
    'textInput.moveWordLeft',
    'textInput.moveWordRight',
    'textInput.selectAll',
    'textInput.selectEnd',
    'textInput.selectHome',
    'textInput.selectLeft',
    'textInput.selectRight',
    'textInput.selectWordLeft',
    'textInput.selectWordRight',
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
  expect(resolveInPopup({ ...unmodified, name: 'left', shift: true })).toBe(
    'textInput.selectLeft',
  );
  expect(
    resolveInPopup({
      ...unmodified,
      name: 'right',
      option: true,
      shift: true,
    }),
  ).toBe('textInput.selectWordRight');
  expect(resolveInPopup({ ...unmodified, name: 'c', ctrl: true })).toBe(
    'textInput.copy',
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
