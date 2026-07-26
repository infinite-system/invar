import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  mkdtempSync as makeTemporaryDirectorySync,
  rmSync as removeSync,
} from 'node:fs';
import { tmpdir as temporaryDirectory } from 'node:os';
import { join } from 'node:path';
import { ref } from 'vue';
import { AgentPaneContent } from '../agent/AgentPaneContent';
import { CommandRegistry } from '../commands/CommandRegistry';
import { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import { NarrationProjection } from '../narration/NarrationProjection';
import { FindBar } from '../search/FindBar';
import { QuickOpen } from '../search/QuickOpen';
import { Settings, type SettingsFileSystem } from '../settings/Settings';
import { SettingsPanel } from '../settings/SettingsPanel';
import { StatusChannel } from '../system/StatusChannel';
import { ContextMenu } from '../ui/ContextMenu';
import { BoundedListPopup } from '../ui/BoundedListPopup';
import { PanelHost } from '../ui/PanelHost';
import { ShortcutHelp } from '../ui/ShortcutHelp';
import { Tooltip } from '../ui/Tooltip';
import { WorkspaceSet } from '../workspace/WorkspaceSet';
import {
  AppStatusProjection,
  type AppStatusMouseEvent,
  type AppStatusProjectionPorts,
} from './AppStatusProjection';

let temporaryRoot = '';
let workspaceSet: InstanceType<typeof WorkspaceSet.Class> | null = null;

beforeEach(() => {
  temporaryRoot = makeTemporaryDirectorySync(
    join(temporaryDirectory(), 'app-status-projection-'),
  );
});

afterEach(() => {
  workspaceSet?.dispose();
  workspaceSet = null;
  removeSync(temporaryRoot, { recursive: true, force: true });
  StatusChannel.Class.update({
    mouse: null,
    agentBusy: false,
    agentStuckToBottom: true,
    agentExpandedCount: 0,
    agentScrollTop: 0,
    agentPendingPermissionTool: '',
    agentEngine: '',
    agentTitle: '',
  });
});

function createSettings(): InstanceType<typeof Settings.Class> {
  const settingsFileSystem: SettingsFileSystem = {
    readTextFile: () => null,
    writeTextFile: () => {},
    homeDirectory: () => temporaryRoot,
  };
  return new Settings.Class({ fileSystem: settingsFileSystem });
}

describe('AppStatusProjection', () => {
  test('reads optional live ports on every snapshot and publishes the active agent title', () => {
    const settings = createSettings();
    workspaceSet = new WorkspaceSet.Class(settings);
    workspaceSet.open(temporaryRoot);
    const commands = new CommandRegistry.Class();
    const keybindings = new KeybindingRegistry.Class();
    const findBar = new FindBar.Class();
    const quickOpen = new QuickOpen.Class();
    const settingsPanel = new SettingsPanel.Class(settings);
    const contextMenu = new ContextMenu.Class();
    const boundedListPopup = {
      open: ref(false),
      query: ref(''),
      selectedIndex: ref(-1),
      filteredMatches: [],
      geometry: null,
    } as unknown as InstanceType<typeof BoundedListPopup.Class>;
    const completionPopup = {
      open: false,
      selectedLabel: '',
      itemCount: 0,
      geometry: null,
    };
    const shortcutHelp = new ShortcutHelp.Class(keybindings, commands);
    const tooltip = new Tooltip.Class();
    const panelHost = new PanelHost.Class();
    const primaryDockHost = new PanelHost.Class();
    const rightDockHost = new PanelHost.Class();
    let mouse: AppStatusMouseEvent | null = null;
    let narration: InstanceType<typeof NarrationProjection.Class> | null = null;
    let agentPaneContent: AgentPaneContent.Model | null = null;
    let terminalPaneContent: {
      observedEventCount: number;
      lastObservedBoundarySource: 'osc133' | 'heuristic' | null;
      scrollTop: number;
      scrollContentRows: number;
      scrollViewportRows: number;
      forwardsWheelToChild: boolean;
    } | null = null;
    const ports: AppStatusProjectionPorts = {
      workspaceSet,
      settings,
      commands,
      findBar,
      quickOpen,
      settingsPanel,
      contextMenu,
      boundedListPopup,
      completionPopup,
      shortcutHelp,
      tooltip,
      panelHost,
      primaryDockHost,
      rightDockHost,
      view: {
        activeDiffView: () => null,
        activeMarkdownSplitView: () => null,
        panelViewportColumns: () => 80,
        panelViewportRows: () => 24,
        panelContentsListRegion: () => ({
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          visible: false,
        }),
        rightDockViewportColumns: () => 28,
        rightDockViewportRows: () => 24,
        overlayDialogBounds: () => ({}),
        overlayScrollPositions: () => ({}),
        overlayViewportExtents: () => ({}),
        layoutGeometry: () => ({
          activityBar: { left: 0, top: 0, width: 4, height: 40 },
          sidebar: { left: 4, top: 0, width: 32, height: 40 },
          sidebarSplitter: { left: 36, top: 0, width: 1, height: 40 },
          editorCenter: { left: 37, top: 0, width: 55, height: 40 },
          rightDockSplitter: { left: 92, top: 0, width: 1, height: 40 },
          rightDock: { left: 93, top: 0, width: 27, height: 40 },
          bottomPanelSplitter: { left: 37, top: 21, width: 55, height: 1 },
          bottomPanel: { left: 37, top: 22, width: 55, height: 18 },
        }),
        splitterRegions: () => ({
          sidebar: { left: 36, top: 0, width: 1, height: 40, visible: true },
          git: { left: 4, top: 15, width: 32, height: 1, visible: false },
          bottomPanel: {
            left: 37,
            top: 21,
            width: 55,
            height: 1,
            visible: false,
          },
          rightDock: { left: 92, top: 0, width: 1, height: 40, visible: false },
        }),
      },
      get mouse() {
        return mouse;
      },
      get narration() {
        return narration;
      },
      get agentPaneContent() {
        return agentPaneContent;
      },
      get terminalPaneContent() {
        return terminalPaneContent;
      },
    };

    const initialSnapshot = AppStatusProjection.Class.snapshot(ports);
    expect(initialSnapshot.mouse).toBeNull();
    expect(initialSnapshot.agentTitle).toBe('');
    expect(initialSnapshot.agentEngine).toBe('');
    expect(initialSnapshot.agentAssistantEntryCount).toBe(0);
    expect(initialSnapshot.agentLastAssistantText).toBe('');
    expect(initialSnapshot.terminalFollowMode).toBe('off');
    expect(initialSnapshot.terminalObservedEventCount).toBe(0);
    expect(initialSnapshot.terminalLastObservedBoundarySource).toBeNull();

    mouse = { type: 'down', x: 12, y: 7, button: 1 };
    narration = {
      spokenCount: ref(3),
      lastSpoken: ref('Finished'),
      bargeInCount: ref(1),
    } as unknown as InstanceType<typeof NarrationProjection.Class>;
    agentPaneContent = {
      agentSession: {
        busy: true,
        pendingPermission: { toolName: 'Write' },
      },
      stuckToBottom: false,
      expandedCount: 2,
      scrollTop: 9,
      viewportRows: 12,
      contentLineCount: 38,
      currentEngine: 'codex',
      title: 'Codex (working…)',
    } as unknown as AgentPaneContent.Model;
    terminalPaneContent = {
      observedEventCount: 7,
      lastObservedBoundarySource: 'heuristic',
      scrollTop: 19,
      scrollContentRows: 43,
      scrollViewportRows: 24,
      forwardsWheelToChild: true,
    };

    const publishedSnapshot = AppStatusProjection.Class.publish(ports);
    expect(publishedSnapshot.mouse).toEqual(mouse);
    expect(publishedSnapshot.narrationSpokenCount).toBe(3);
    expect(publishedSnapshot.agentPendingPermissionTool).toBe('Write');
    expect(publishedSnapshot.agentEngine).toBe('codex');
    expect(publishedSnapshot.agentTitle).toBe('Codex (working…)');
    expect(publishedSnapshot.agentViewportRows).toBe(12);
    expect(publishedSnapshot.agentContentLineCount).toBe(38);
    expect(publishedSnapshot.agentAssistantEntryCount).toBe(0);
    expect(publishedSnapshot.agentLastAssistantText).toBe('');
    expect(publishedSnapshot.terminalObservedEventCount).toBe(7);
    expect(publishedSnapshot.terminalLastObservedBoundarySource).toBe(
      'heuristic',
    );
    expect(publishedSnapshot.terminalScrollTop).toBe(19);
    expect(publishedSnapshot.terminalScrollContentRows).toBe(43);
    expect(publishedSnapshot.terminalScrollViewportRows).toBe(24);
    expect(publishedSnapshot.terminalWheelForwardedToChild).toBe(true);
    expect(StatusChannel.Class.snapshot.agentTitle).toBe('Codex (working…)');

    panelHost.dispose();
    rightDockHost.dispose();
  });
});
