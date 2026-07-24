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
  temporaryRoot = makeTemporaryDirectorySync(join(temporaryDirectory(), 'app-status-projection-'));
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
    const shortcutHelp = new ShortcutHelp.Class(keybindings, commands);
    const tooltip = new Tooltip.Class();
    const panelHost = new PanelHost.Class();
    let mouse: AppStatusMouseEvent | null = null;
    let narration: InstanceType<typeof NarrationProjection.Class> | null = null;
    let agentPaneContent: AgentPaneContent.Model | null = null;
    const ports: AppStatusProjectionPorts = {
      workspaceSet,
      settings,
      commands,
      findBar,
      quickOpen,
      settingsPanel,
      contextMenu,
      shortcutHelp,
      tooltip,
      panelHost,
      view: {
        activeDiffView: () => null,
        activeMarkdownSplitView: () => null,
        panelViewportColumns: () => 80,
        panelViewportRows: () => 24,
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
    };

    const initialSnapshot = AppStatusProjection.Class.snapshot(ports);
    expect(initialSnapshot.mouse).toBeNull();
    expect(initialSnapshot.agentTitle).toBe('');
    expect(initialSnapshot.agentEngine).toBe('');

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
      currentEngine: 'codex',
      title: 'Codex (working…)',
    } as unknown as AgentPaneContent.Model;

    const publishedSnapshot = AppStatusProjection.Class.publish(ports);
    expect(publishedSnapshot.mouse).toEqual(mouse);
    expect(publishedSnapshot.narrationSpokenCount).toBe(3);
    expect(publishedSnapshot.agentPendingPermissionTool).toBe('Write');
    expect(publishedSnapshot.agentEngine).toBe('codex');
    expect(publishedSnapshot.agentTitle).toBe('Codex (working…)');
    expect(StatusChannel.Class.snapshot.agentTitle).toBe('Codex (working…)');

    panelHost.dispose();
  });
});
