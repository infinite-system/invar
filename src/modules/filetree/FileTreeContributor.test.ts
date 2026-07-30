import { expect, test } from 'bun:test';
import { ref } from 'vue';
import { Workspace } from '../workspace/Workspace';
import { FileTreeContributor } from './FileTreeContributor';

test('publishes the default dock content and attaches one controller per workspace', () => {
  const contributor = new FileTreeContributor.Class();
  const workspace = new Workspace.Class();

  const contribution = contributor.attachWorkspace(workspace);

  expect(contributor.primaryDockContentIdentifiers).toEqual(['files']);
  expect(contributor.primaryDockFallbackContentIdentifier).toBe('files');
  expect(contributor.workspaceContributor).toBe(contributor);
  expect(contribution).toBe(contributor.controllerFor(workspace));
});

test('registers the default-on reveal setting in the file-tree schema', () => {
  const contributor = new FileTreeContributor.Class();
  const registeredSettings: Array<{
    identifier: string;
    label: string;
    section: string;
    defaultValue: unknown;
    spec: unknown;
  }> = [];
  contributor.activateApplication({
    registerSetting: (setting: {
      identifier: string;
      label: string;
      section: string;
      defaultValue: unknown;
      spec: unknown;
    }) => {
      registeredSettings.push(setting);
      return {
        value: ref(setting.defaultValue),
        save: () => {},
        dispose: () => {},
      };
    },
    registerKeybindings: () => {},
    registerPrimaryDockContent: () => {},
    statusProjectionContributions: { register: () => () => {} },
    commands: { registerAll: () => () => {} },
  } as never);

  expect(
    registeredSettings.find(
      (setting) => setting.identifier === 'fileTreeRevealOpenFile',
    ),
  ).toEqual({
    identifier: 'fileTreeRevealOpenFile',
    label: 'Reveal open file',
    section: 'File Tree',
    defaultValue: true,
    spec: { kind: 'boolean' },
  });
});
