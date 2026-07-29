import { expect, test } from 'bun:test';
import { ref } from 'vue';
import { Workspace } from '../workspace/Workspace';
import { DocumentLifecycle } from '../workspace/DocumentLifecycle';
import { TextDocument } from '../text/TextDocument';
import { ProviderRegistry } from '../plugins/ProviderRegistry';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type { PaneContent } from '../ui/PaneContent.interface';
import { StructurePlugin } from './StructurePlugin';

interface RecordingContext {
  context: ApplicationContributionContext;
  dockContents: PaneContent[];
  keybindings: number;
  commandIds: string[];
  commandDisposals: number;
  statusDisposals: number;
  snapshot: () => Record<string, unknown>;
  dockVisible: ReturnType<typeof ref<boolean>>;
  setActiveDockContent: (id: string | null) => void;
}

function makeContext(workspace: Workspace.Model): RecordingContext {
  const dockContents: PaneContent[] = [];
  const commandIds: string[] = [];
  const dockVisible = ref(true);
  const activeDockContentId = ref<string | null>(null);
  let snapshotProvider: (() => Record<string, unknown>) | null = null;
  const recording: RecordingContext = {
    dockContents,
    keybindings: 0,
    commandIds,
    commandDisposals: 0,
    statusDisposals: 0,
    dockVisible,
    snapshot: () => snapshotProvider?.() ?? {},
    setActiveDockContent: (id) => {
      activeDockContentId.value = id;
    },
    context: {
      workspaceSet: {
        active: workspace,
        activeWorkspaceIndex: ref(0),
      },
      primaryDockHost: {
        get visible() {
          return dockVisible;
        },
        get activeContent() {
          const id = activeDockContentId.value;
          return id
            ? (dockContents.find((content) => content.id === id) ?? null)
            : null;
        },
        showContent: (id: string) => {
          activeDockContentId.value = id;
        },
        focused: ref(true),
      },
      settings: { scrollbarThickness: ref(1) },
      theme: { glyphLevel: ref('unicode') },
      registerKeybindings: () => {
        recording.keybindings += 1;
      },
      registerPrimaryDockContent: (content: PaneContent) => {
        dockContents.push(content);
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

test('activation registers the pane, commands, keybindings, and status keys', () => {
  const plugin = new StructurePlugin.Class();
  const workspace = new Workspace.Class();
  plugin.attachWorkspace(workspace);
  const recording = makeContext(workspace);

  plugin.activateApplication(recording.context);

  expect(plugin.primaryDockContentIdentifiers).toEqual(['structure']);
  expect(plugin.workspaceContributor).toBe(plugin);
  expect(recording.dockContents.map((content) => content.id)).toEqual([
    'structure',
  ]);
  expect(recording.keybindings).toBe(1);
  expect(recording.commandIds).toEqual([
    'view.showStructure',
    'structure.up',
    'structure.down',
    'structure.activate',
    'structure.refresh',
  ]);
  expect(recording.snapshot()).toMatchObject({
    structureStatus: 'no-document',
    structureRows: 0,
    structureRequests: 0,
  });
});

test('the outline is observed only while the dock shows the structure pane', async () => {
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

  // Hidden pane: a refresh issues no request even with a source installed.
  const source = {
    supportsDocument: () => true,
    documentSymbols: async () => ({ symbols: [], truncated: false }),
    structureNotice: () => null,
  };
  const disposeSource = workspace.providers.register('structure', source);
  const outline = plugin.controllerFor(workspace).outline;
  recording.setActiveDockContent(null);
  await outline.refresh();
  expect(outline.requestCount.value).toBe(0);

  // Shown pane: the same refresh asks the source.
  recording.setActiveDockContent('structure');
  await outline.refresh();
  expect(outline.requestCount.value).toBe(1);

  // Dock hidden again: back to zero-cost.
  recording.dockVisible.value = false;
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
