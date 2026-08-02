import { expect, test } from 'bun:test';
import { ref } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type { PanelContentFactory } from '../ui/PanelContentFactory.interface';
import { Workspace } from '../workspace/Workspace';
import { DatabaseConsumerPlugin } from './DatabaseConsumerPlugin';

test('the consumer plugin registers and withdraws its pane and status projection', () => {
  const workspace = new Workspace.Class();
  const plugin = new DatabaseConsumerPlugin.Class();
  const contribution = plugin.attachWorkspace(workspace);
  const factories: PanelContentFactory[] = [];
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
    bottomPanelHost: {
      visible: ref(true),
      focusedContent: null,
      focused: ref(false),
      showContent() {},
      isContentVisible: () => true,
      focus() {},
    },
    theme: { glyphLevel: ref('unicode') },
    registerKeybindings() {},
    registerPanelContentFactory: (factory: PanelContentFactory) =>
      factories.push(factory),
    openPanelContent: () => true,
    commands: {
      registerAll: (commands: readonly { id: string }[]) => {
        commandIdentifiers.push(...commands.map((command) => command.id));
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

  expect(plugin.primaryDockContentIdentifiers).toEqual([]);
  expect(factories.map((factory) => factory.kind)).toEqual(['database']);
  const pane = factories[0]?.createPane('pane-instance-1', 'Database');
  expect(pane?.id).toBe('pane-instance-1');
  expect(pane?.kind).toBe('database');
  expect(commandIdentifiers).toContain('view.showDatabase');
  expect(commandIdentifiers).toContain('database.connect');
  expect(commandIdentifiers).toContain('database.disconnect');
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
