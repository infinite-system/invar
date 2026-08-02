import { expect, test } from 'bun:test';
import { nextTick, ref } from 'vue';
import { Workspace } from '../workspace/Workspace';
import { DocumentLifecycle } from '../workspace/DocumentLifecycle';
import { TextDocument } from '../text/TextDocument';
import { ProviderRegistry } from '../plugins/ProviderRegistry';
import { PanelHost } from '../ui/PanelHost';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type { PaneContent } from '../ui/PaneContent.interface';
import { ContextMenu } from '../ui/ContextMenu';
import { ThemePalettes } from '../theme/ThemePalettes';
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
  showLineNumbers: ReturnType<typeof ref<boolean>>;
  contextMenu: ContextMenu.Model;
  settingWrites: { identifier: string; value: unknown }[];
  settingSaves: string[];
  snapshot: () => Record<string, unknown>;
}

function makeContext(workspace: Workspace.Model): RecordingContext {
  const dockContents: PaneContent[] = [];
  const commandIds: string[] = [];
  const settingIdentifiers: string[] = [];
  // The real suggested host: the plugin's default-visibility policy drives it, so the tests
  // observe genuine visibility transitions instead of a hand-rolled stub's.
  const rightDockHost = new PanelHost.Class();
  const showByDefault = ref(true);
  const defaultDepth = ref(1);
  const showLineNumbers = ref(false);
  const contextMenu = new ContextMenu.Class();
  const settingWrites: { identifier: string; value: unknown }[] = [];
  const settingSaves: string[] = [];
  const settingChangeHandlers = new Map<string, () => void>();
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
    showLineNumbers,
    contextMenu,
    settingWrites,
    settingSaves,
    snapshot: () => snapshotProvider?.() ?? {},
    context: {
      workspaceSet: {
        active: workspace,
        activeWorkspaceIndex: ref(0),
      },
      rightDockHost,
      settings: {
        scrollbarThickness: ref(1),
        setContributed: (identifier: string, value: unknown) => {
          settingWrites.push({ identifier, value });
          if (identifier === 'structureDefaultDepth') {
            defaultDepth.value = Number(value);
          }
          settingChangeHandlers.get(identifier)?.();
        },
      },
      theme: { glyphLevel: ref('unicode') },
      contextMenu,
      overlayCoordinator: {
        openExclusiveOverlay: (_name: string, openOverlay: () => void): void =>
          openOverlay(),
      },
      renderer: { width: 120, height: 40 },
      registerKeybindings: () => {
        recording.keybindings += 1;
      },
      registerRightDockContent: (content: PaneContent) => {
        dockContents.push(content);
        rightDockHost.register(content);
      },
      registerDockContent: (contribution: {
        content: PaneContent;
        settingIdentifier: string;
      }) => {
        dockContents.push(contribution.content);
        settingIdentifiers.push(contribution.settingIdentifier);
        rightDockHost.register(contribution.content);
        return {
          value: ref<'left' | 'right'>('right'),
          host: () => rightDockHost,
          isPainted: () =>
            rightDockHost.isContentVisible(contribution.content.id),
          reveal: () => rightDockHost.revealContent(contribution.content.id),
          show: () => rightDockHost.showContent(contribution.content.id),
          blur: () => rightDockHost.blur(),
          save: () => {},
          dispose: () => {
            recording.settingDisposals += 1;
          },
        };
      },
      registerSetting: (contribution: {
        identifier: string;
        changed?: () => void;
      }) => {
        settingIdentifiers.push(contribution.identifier);
        if (contribution.changed) {
          settingChangeHandlers.set(
            contribution.identifier,
            contribution.changed,
          );
        }
        return {
          value:
            contribution.identifier === 'structureDefaultDepth'
              ? defaultDepth
              : contribution.identifier === 'structureShowLineNumbers'
                ? showLineNumbers
                : showByDefault,
          save: () => {
            settingSaves.push(contribution.identifier);
          },
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

test('activation registers the dock pane, commands, keybindings, setting, and status keys', () => {
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
    'structure.dockSide',
    'structureShowByDefault',
    'structureDefaultDepth',
    'structureShowLineNumbers',
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
    structureShowLineNumbers: false,
    structureFilter: '',
  });
  plugin.disposeApplication();
});

test('the outline is observed only while its dock shows the structure pane', async () => {
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

test('the in-pane depth selector writes and saves the contributed depth setting', () => {
  const plugin = new StructurePlugin.Class();
  const workspace = new Workspace.Class();
  plugin.attachWorkspace(workspace);
  const recording = makeContext(workspace);
  plugin.activateApplication(recording.context);
  const pane = recording.dockContents[0]!;
  pane.render?.({
    width: 30,
    height: 10,
    palette: ThemePalettes.Class.DARK,
    glyphLevel: 'unicode',
    colorDepth: 'truecolor',
    focused: true,
  });

  pane.onPointerDown?.(27, 0, {
    screenColumn: 80,
    screenRow: 4,
    button: 0,
    modifiers: { alt: false, shift: false, ctrl: false },
  });
  recording.contextMenu.runAt(3);

  expect(recording.settingWrites).toEqual([
    { identifier: 'structureDefaultDepth', value: 3 },
  ]);
  expect(recording.settingSaves).toEqual(['structureDefaultDepth']);
  expect(recording.defaultDepth.value).toBe(3);
  expect(recording.snapshot()).toMatchObject({
    structureDefaultDepth: 3,
    structureDepth: 3,
    structureDepthIsOverridden: false,
  });
  plugin.disposeApplication();
});

test('uninstall withdraws everything it registered and a reinstall rebuilds it', () => {
  const plugin = new StructurePlugin.Class();
  const workspace = new Workspace.Class();
  plugin.attachWorkspace(workspace);
  const recording = makeContext(workspace);

  plugin.activateApplication(recording.context);
  plugin.disposeApplication();
  // The real contribution manager runs its registration disposer after the plugin hook.
  recording.rightDockHost.removeContent('structure');

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
