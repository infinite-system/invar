import { expect, test } from 'bun:test';
import { nextTick, ref } from 'vue';
import { Workspace } from '../workspace/Workspace';
import { DocumentLifecycle } from '../workspace/DocumentLifecycle';
import { TextDocument } from '../text/TextDocument';
import { ProviderRegistry } from '../plugins/ProviderRegistry';
import { PanelHost } from '../ui/PanelHost';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type { PaneContent } from '../ui/PaneContent.interface';
import { StructurePlugin } from './StructurePlugin';

interface RecordingContext {
  context: ApplicationContributionContext;
  rightDockHost: PanelHost.Instance;
  dockContents: PaneContent[];
  keybindings: number;
  commandIds: string[];
  commandDisposals: number;
  statusDisposals: number;
  settingIdentifiers: string[];
  settingDisposals: number;
  showByDefault: ReturnType<typeof ref<boolean>>;
  defaultDepth: ReturnType<typeof ref<number>>;
  snapshot: () => Record<string, unknown>;
}

function makeContext(workspace: Workspace.Model): RecordingContext {
  const dockContents: PaneContent[] = [];
  const commandIds: string[] = [];
  const settingIdentifiers: string[] = [];
  // The REAL right-dock host: the plugin's default-visibility policy drives it, so the tests
  // observe genuine visibility transitions instead of a hand-rolled stub's.
  const rightDockHost = new PanelHost.Class({
    showWhenContentRegistered: true,
  });
  const showByDefault = ref(true);
  const defaultDepth = ref(1);
  let snapshotProvider: (() => Record<string, unknown>) | null = null;
  const recording: RecordingContext = {
    rightDockHost,
    dockContents,
    keybindings: 0,
    commandIds,
    commandDisposals: 0,
    statusDisposals: 0,
    settingIdentifiers,
    settingDisposals: 0,
    showByDefault,
    defaultDepth,
    snapshot: () => snapshotProvider?.() ?? {},
    context: {
      workspaceSet: {
        active: workspace,
        activeWorkspaceIndex: ref(0),
      },
      rightDockHost,
      settings: { scrollbarThickness: ref(1) },
      theme: { glyphLevel: ref('unicode') },
      registerKeybindings: () => {
        recording.keybindings += 1;
      },
      registerRightDockContent: (content: PaneContent) => {
        dockContents.push(content);
        rightDockHost.register(content);
      },
      registerSetting: (contribution: { identifier: string }) => {
        settingIdentifiers.push(contribution.identifier);
        return {
          value:
            contribution.identifier === 'structureDefaultDepth'
              ? defaultDepth
              : showByDefault,
          save: () => {},
          dispose: () => {
            recording.settingDisposals += 1;
          },
        };
      },
      statusProjectionContributions: {
        register: (contribution: {
          snapshot: () => Record<string, unknown>;
        }) => {
          snapshotProvider = contribution.snapshot;
          return () => {
            recording.statusDisposals += 1;
            snapshotProvider = null;
          };
        },
      },
      commands: {
        registerAll: (commands: readonly { id: string }[]) => {
          commandIds.push(...commands.map((command) => command.id));
          return () => {
            recording.commandDisposals += 1;
          };
        },
      },
      requestRender: () => {},
    } as never,
  };
  return recording;
}

test('activation registers the right-dock pane, commands, keybindings, setting, and status keys', () => {
  const plugin = new StructurePlugin.Class();
  const workspace = new Workspace.Class();
  plugin.attachWorkspace(workspace);
  const recording = makeContext(workspace);

  plugin.activateApplication(recording.context);

  expect(plugin.workspaceContributor).toBe(plugin);
  expect(recording.dockContents.map((content) => content.id)).toEqual([
    'structure',
  ]);
  expect(recording.rightDockHost.has('structure')).toBe(true);
  expect(recording.keybindings).toBe(1);
  expect(recording.settingIdentifiers).toEqual([
    'structureShowByDefault',
    'structureDefaultDepth',
  ]);
  expect(recording.commandIds).toEqual([
    'view.showStructure',
    'structure.focusEditor',
    'structure.up',
    'structure.down',
    'structure.activate',
    'structure.fold',
    'structure.unfold',
    'structure.decreaseDepth',
    'structure.increaseDepth',
    'structure.resetDepth',
    'structure.clearFilter',
    'structure.refresh',
  ]);
  expect(recording.snapshot()).toMatchObject({
    structureStatus: 'no-document',
    structureRows: 0,
    structureRequests: 0,
    structureDepth: 1,
    structureDepthIsOverridden: false,
    structureFilter: '',
  });
  plugin.disposeApplication();
});

test('the outline is observed only while the right dock shows the structure pane', async () => {
  const plugin = new StructurePlugin.Class();
  const document = new TextDocument.Class();
  document.loadFromText('class A {}\n', '/tmp/observed.ts');
  const workspace = {
    providers: new ProviderRegistry.Class(),
    documentLifecycle: new DocumentLifecycle.Class(),
    activeDocumentHandle: { document },
  } as unknown as Workspace.Model;
  plugin.attachWorkspace(workspace);
  const recording = makeContext(workspace);
  plugin.activateApplication(recording.context);
  await nextTick();

  // No source installed: the default-visibility policy keeps the dock hidden, and a hidden pane
  // issues no request.
  expect(recording.rightDockHost.visible.value).toBe(false);
  const outline = plugin.controllerFor(workspace).outline;
  await outline.refresh();
  expect(outline.requestCount.value).toBe(0);

  // A source that answers for the document reveals the pane, and the same refresh now asks it.
  const source = {
    supportsDocument: () => true,
    documentSymbols: async () => ({ symbols: [], truncated: false }),
    structureNotice: () => null,
  };
  const disposeSource = workspace.providers.register('structure', source);
  await nextTick();
  expect(recording.rightDockHost.isContentVisible('structure')).toBe(true);
  await outline.refresh();
  expect(outline.requestCount.value).toBe(1);

  // Dock hidden by hand: back to zero-cost.
  recording.rightDockHost.hide();
  await nextTick();
  await outline.refresh();
  expect(outline.requestCount.value).toBe(1);

  disposeSource();
  plugin.disposeApplication();
  outline.dispose();
});

test('uninstall withdraws everything it registered and a reinstall rebuilds it', () => {
  const plugin = new StructurePlugin.Class();
  const workspace = new Workspace.Class();
  plugin.attachWorkspace(workspace);
  const recording = makeContext(workspace);

  plugin.activateApplication(recording.context);
  plugin.disposeApplication();

  expect(recording.commandDisposals).toBe(1);
  expect(recording.statusDisposals).toBe(1);
  // With the application contribution gone, the projection is inert, not stale.
  expect(recording.snapshot()).toEqual({});

  // The fourth-verse lesson: prove it can come BACK.
  plugin.activateApplication(recording.context);
  expect(recording.dockContents.map((content) => content.id)).toEqual([
    'structure',
    'structure',
  ]);
  expect(recording.snapshot()).toMatchObject({
    structureStatus: 'no-document',
  });
  plugin.disposeApplication();
});
