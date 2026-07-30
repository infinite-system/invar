import { expect, test } from 'bun:test';
import { CommandRegistry } from './CommandRegistry';

test('registry filters by query and runs the selected command', () => {
  const registry = new CommandRegistry.Class();
  let ran = '';
  registry.registerAll([
    {
      id: 'a',
      title: 'File: Save',
      run: () => {
        ran = 'save';
      },
    },
    {
      id: 'b',
      title: 'Edit: Undo',
      run: () => {
        ran = 'undo';
      },
    },
    {
      id: 'c',
      title: 'View: Toggle Theme',
      run: () => {
        ran = 'theme';
      },
    },
  ]);
  registry.openPalette();
  expect(registry.filtered.length).toBe(3);
  registry.setQuery('undo');
  expect(registry.filtered.map((command) => command.id)).toEqual(['b']);
  registry.runSelected();
  expect(ran).toBe('undo');
  expect(registry.open.value).toBe(false);
});

test('palette word deletion uses the shared text boundary', () => {
  const registry = new CommandRegistry.Class();
  registry.setQuery('open file');
  registry.applyQueryInputAction('deletePreviousWord');
  expect(registry.query.value).toBe('open ');
});

test('when() gates command availability', () => {
  const registry = new CommandRegistry.Class();
  let enabled = false;
  registry.register({
    id: 'x',
    title: 'Gated',
    when: () => enabled,
    run: () => {},
  });
  registry.openPalette();
  expect(registry.filtered.length).toBe(0);
  enabled = true;
  registry.setQuery('');
  expect(registry.filtered.length).toBe(1);
});

test('selection wraps around the filtered list', () => {
  const registry = new CommandRegistry.Class();
  registry.registerAll([
    { id: 'a', title: 'Aaa', run: () => {} },
    { id: 'b', title: 'Bbb', run: () => {} },
  ]);
  registry.openPalette();
  expect(registry.selectedIndex.value).toBe(0);
  registry.moveSelection(-1);
  expect(registry.selectedIndex.value).toBe(1);
  registry.moveSelection(1);
  expect(registry.selectedIndex.value).toBe(0);
});

test('named action surfaces share command guards without leaking into each other', () => {
  const registry = new CommandRegistry.Class();
  let guarded = false;
  registry.registerAll([
    {
      id: 'editor-title',
      title: 'Editor title',
      actionIcons: { editorTitle: 'preview' },
      run: () => {},
    },
    {
      id: 'panel-separator',
      title: 'Panel separator',
      actionIcons: { panelSeparator: 'wordWrap' },
      when: () => guarded,
      run: () => {},
    },
  ]);

  expect(
    registry.actionsForSurface('editorTitle').map((command) => command.id),
  ).toEqual(['editor-title']);
  expect(registry.actionsForSurface('panelSeparator')).toEqual([]);
  guarded = true;
  expect(
    registry.actionsForSurface('panelSeparator').map((command) => command.id),
  ).toEqual(['panel-separator']);
});
