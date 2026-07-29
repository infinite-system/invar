import { expect, test } from 'bun:test';
import { ref } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type { PaneContent } from '../ui/PaneContent.interface';
import { Workspace } from '../workspace/Workspace';
import { DatabaseConsumerPlugin } from './DatabaseConsumerPlugin';

test('the consumer plugin registers and withdraws its pane and status projection', () => {
  const workspace = new Workspace.Class();
  const plugin = new DatabaseConsumerPlugin.Class();
  const contribution = plugin.attachWorkspace(workspace);
  const panes: PaneContent[] = [];
  const commandIdentifiers: string[] = [];
  let commandDisposals = 0;
  let statusDisposals = 0;
  let snapshotProvider: (() => Record<string, unknown>) | null = null;
  const readSnapshot = (): Record<string, unknown> =>
    snapshotProvider ? snapshotProvider() : {};
  const context = {
    workspaceSet: {
      active: workspace,
      activeWorkspaceIndex: ref(0),
    },
    primaryDockHost: {
      visible: ref(true),
      activeContent: null,
      focused: ref(false),
      showContent() {},
    },
    theme: { glyphLevel: ref('unicode') },
    registerKeybindings() {},
    registerPrimaryDockContent: (pane: PaneContent) => panes.push(pane),
    commands: {
      register: (command: { id: string }) => {
        commandIdentifiers.push(command.id);
        return () => {
          commandDisposals++;
        };
      },
    },
    statusProjectionContributions: {
      register: (projection: { snapshot: () => Record<string, unknown> }) => {
        snapshotProvider = projection.snapshot;
        return () => {
          snapshotProvider = null;
          statusDisposals++;
        };
      },
    },
  } as unknown as ApplicationContributionContext;

  plugin.activateApplication(context);

  expect(plugin.primaryDockContentIdentifiers).toEqual(['database']);
  expect(panes.map((pane) => pane.id)).toEqual(['database']);
  expect(commandIdentifiers).toEqual(['view.showDatabase']);
  expect(readSnapshot()).toMatchObject({
    databaseConsumerStatus: 'idle',
  });

  contribution.disposed();
  plugin.disposeApplication();
  expect(commandDisposals).toBe(1);
  expect(statusDisposals).toBe(1);
  expect(snapshotProvider).toBeNull();
  workspace.dispose();
});
