import { expect, test } from 'bun:test';
import { ApplicationContributions } from '../app/ApplicationContributions';
import { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import { Settings } from '../settings/Settings';
import { WorkspaceSet } from '../workspace/WorkspaceSet';
import { LspPlugin } from './LspPlugin';

function keyboardEvent(name: string, ctrl = false) {
  return {
    name,
    ctrl,
    shift: false,
    option: false,
    super: false,
  };
}

test('disable withdraws the language provider manifest symmetrically', () => {
  const settings = new Settings.Class();
  const keybindings = new KeybindingRegistry.Class();
  const workspaceSet = new WorkspaceSet.Class(settings);
  workspaceSet.open('/tmp');
  const plugin = new LspPlugin.Class();
  const manager = new ApplicationContributions.Class([plugin], {
    settings,
    keybindings,
    workspaceSet,
    primaryDockHost: {
      register() {},
      removeContent() {},
    },
    dismissEditorSuggestions() {},
    requestRender() {},
  } as never);

  manager.activateAll();

  expect(
    settings
      .contributedSettingDescriptors()
      .map((descriptor) => descriptor.identifier),
  ).toEqual(['typescriptServer', 'lspFileSizeLimitKb']);
  expect(
    keybindings.resolve(keyboardEvent('space', true), 'editor', 0).action,
  ).toBe('editor.completion');
  expect(
    keybindings.resolve(keyboardEvent(']', true), 'editor', 0).action,
  ).toBe('go.definition');

  manager.setEnabled('language', false);

  expect(settings.contributedSettingDescriptors()).toEqual([]);
  expect(
    keybindings.resolve(keyboardEvent('space', true), 'editor', 0).action,
  ).toBeNull();
  expect(
    keybindings.resolve(keyboardEvent(']', true), 'editor', 0).action,
  ).toBeNull();

  manager.dispose();
  workspaceSet.dispose();
});
