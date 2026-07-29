import { describe, expect, test } from 'bun:test';
import type { Keybinding } from '../keybindings/KeybindingRegistry';
import { DARK } from '../theme/ThemePalettes';
import { ShortcutsView, type EffectiveBindings } from './ShortcutsView';

function effectiveBindings(bindings: readonly Keybinding[]): EffectiveBindings {
  return new Map(bindings.map((binding) => [binding.action, binding]));
}

describe('ShortcutsView chord formatting', () => {
  test('formats modifiers with readable platform names', () => {
    expect(
      ShortcutsView.formatChord({ key: 'f', ctrl: true, shift: true }),
    ).toBe('Ctrl+Shift+F');
    expect(ShortcutsView.formatChord({ key: 'p', super: true })).toBe('Cmd+P');
    expect(ShortcutsView.formatChord({ key: 'z', alt: true })).toBe(
      'Alt/Option+Z',
    );
  });

  test('formats named keys and capitalizes longer key names', () => {
    expect(ShortcutsView.formatChord({ key: 'left' })).toBe('←');
    expect(ShortcutsView.formatChord({ key: 'pagedown', ctrl: true })).toBe(
      'Ctrl+PageDown',
    );
    expect(ShortcutsView.formatChord({ key: 'escape' })).toBe('Esc');
    expect(ShortcutsView.formatChord({ key: 'f10' })).toBe('F10');
  });
});

describe('ShortcutsView rows', () => {
  const fakeEffectiveBindings = effectiveBindings([
    { chord: { key: 'down' }, action: 'settings.down', context: 'settings' },
    { chord: { key: 'd' }, action: 'git.discard', context: 'git' },
    { chord: { key: 'return' }, action: 'tree.activate', context: 'files' },
    {
      chord: { key: 's', ctrl: true },
      action: 'editor.save',
      context: 'editor',
    },
    { chord: { key: 'q', ctrl: true }, action: 'app.quit' },
    {
      chord: { key: 'a', ctrl: true },
      action: 'editor.selectAll',
      context: 'editor',
    },
    {
      steps: [
        { key: 'x', ctrl: true },
        { key: 'c', ctrl: true },
      ],
      action: 'app.quitChord',
    },
  ]);
  const actionLabels = new Map([
    ['settings.down', 'Select Next Setting'],
    ['git.discard', 'Discard Changes'],
    ['tree.activate', 'Open File or Folder'],
    ['editor.save', 'Save File'],
    ['app.quit', 'Quit Application'],
    ['editor.selectAll', 'Select All'],
    ['app.quitChord', 'Quit with Chord'],
  ]);

  test('groups every effective binding by context in stable context and label order', () => {
    const shortcutRows = ShortcutsView.buildShortcutRows(
      fakeEffectiveBindings,
      actionLabels,
    );
    expect(shortcutRows).toEqual([
      { kind: 'context', context: 'global', label: 'Global' },
      {
        kind: 'binding',
        context: 'global',
        chord: 'Ctrl+Q',
        action: 'app.quit',
        actionLabel: 'Quit Application',
      },
      {
        kind: 'binding',
        context: 'global',
        chord: 'Ctrl+X then Ctrl+C',
        action: 'app.quitChord',
        actionLabel: 'Quit with Chord',
      },
      { kind: 'context', context: 'editor', label: 'Editor' },
      {
        kind: 'binding',
        context: 'editor',
        chord: 'Ctrl+S',
        action: 'editor.save',
        actionLabel: 'Save File',
      },
      {
        kind: 'binding',
        context: 'editor',
        chord: 'Ctrl+A',
        action: 'editor.selectAll',
        actionLabel: 'Select All',
      },
      { kind: 'context', context: 'files', label: 'Files' },
      {
        kind: 'binding',
        context: 'files',
        chord: 'Enter',
        action: 'tree.activate',
        actionLabel: 'Open File or Folder',
      },
      { kind: 'context', context: 'git', label: 'Git' },
      {
        kind: 'binding',
        context: 'git',
        chord: 'D',
        action: 'git.discard',
        actionLabel: 'Discard Changes',
      },
      { kind: 'context', context: 'settings', label: 'Settings' },
      {
        kind: 'binding',
        context: 'settings',
        chord: '↓',
        action: 'settings.down',
        actionLabel: 'Select Next Setting',
      },
    ]);
  });

  test('renders formatted chords and supplied human-readable action labels', () => {
    const shortcutRows = ShortcutsView.buildShortcutRows(
      fakeEffectiveBindings,
      actionLabels,
    );
    const renderedShortcuts = ShortcutsView.renderShortcutRows(
      shortcutRows,
      60,
      DARK,
    );
    const renderedText = renderedShortcuts.chunks
      .map((textChunk) => textChunk.text)
      .join('');

    expect(renderedText).toContain('Global');
    expect(renderedText).toContain('Ctrl+X then Ctrl+C');
    expect(renderedText).toContain('Quit with Chord');
    expect(renderedText).toContain('Open File or Folder');
    expect(renderedText).toContain('Select Next Setting');
  });

  test('falls back to a readable label derived from an unknown action id', () => {
    const shortcutRows = ShortcutsView.buildShortcutRows(
      effectiveBindings([
        {
          chord: { key: 'right' },
          action: 'extension.openSidePanel',
          context: 'editor',
        },
      ]),
    );
    expect(shortcutRows[1]).toEqual({
      kind: 'binding',
      context: 'editor',
      chord: '→',
      action: 'extension.openSidePanel',
      actionLabel: 'Open Side Panel',
    });
  });
});
