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
import { GoToLinePrompt } from '../navigation/GoToLinePrompt';
import { FindBar } from '../search/FindBar';
import { QuickOpen } from '../search/QuickOpen';
import { Settings, type SettingsFileSystem } from '../settings/Settings';
import { SettingsPanel } from '../settings/SettingsPanel';
import { StatusChannel, type StatusSnapshot } from '../system/StatusChannel';
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
import { EditorSourceTextViews } from '../editor/EditorSourceTextViews';

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
    terminalExited: false,
    terminalExitCode: null,
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
    workspaceSet = new WorkspaceSet.Class(settings, {
      createSourceTextViews: () => new EditorSourceTextViews.Class(),
    });
    workspaceSet.open(temporaryRoot);
    const commands = new CommandRegistry.Class();
    const keybindings = new KeybindingRegistry.Class();
    const findBar = new FindBar.Class();
    const quickOpen = new QuickOpen.Class();
    const settingsPanel = new SettingsPanel.Class(settings);
    const contextMenu = new ContextMenu.Class();
    const boundedListPopup = {
      open: ref(false),
      items: ref([]),
      query: ref(''),
      selectedIndex: ref(-1),
      filteredMatches: [],
      geometry: null,
      title: '',
    } as unknown as InstanceType<typeof BoundedListPopup.Class>;
    const completionPopup = {
      open: false,
      selectedLabel: '',
      itemCount: 0,
      geometry: null,
    };
    const agentSkillPopup = {
      open: ref(false),
      items: [],
      selectedIdentifier: null,
      geometry: null,
    };
    const shortcutHelp = new ShortcutHelp.Class(keybindings, commands);
    const goToLinePrompt = new GoToLinePrompt.Class();
    const tooltip = new Tooltip.Class();
    const panelHost = new PanelHost.Class();
    const primaryDockHost = new PanelHost.Class();
    const rightDockHost = new PanelHost.Class();
    // The terminal's status now arrives the way every contributed runtime's does — through the
    // contribution channel, not a host-held pane reference.
    const statusProjectionContributions = {
      snapshot: () => contributedStatus,
    };
    let contributedStatus: Partial<StatusSnapshot> = {};
    let mouse: AppStatusMouseEvent | null = null;
    let narration: InstanceType<typeof NarrationProjection.Class> | null = null;
    let agentPaneContent: AgentPaneContent.Model | null = null;
    const ports: AppStatusProjectionPorts = {
      workspaceSet,
      settings,
      commands,
      findBar,
      quickOpen,
      goToLinePrompt,
      settingsPanel,
      contextMenu,
      boundedListPopup,
      completionPopup,
      agentSkillPopup,
      shortcutHelp,
      tooltip,
      panelHost,
      primaryDockHost,
      rightDockHost,
      statusProjectionContributions,
      pluginPrimaryDockContentIdentifiers: ['git', 'extensions'],
      view: {
        editorColumnContentIdentifier: () => 'source-text-editor',
        editorFrameAttribution: () => ({
          latestFrame: {
            documentLineReads: 0,
            foldProjectionLookups: 0,
            wrapProjectionLookups: 0,
            layoutComputations: 0,
          },
          totals: {
            completedFrameCount: 0,
            documentLineReads: 0,
            foldProjectionLookups: 0,
            wrapProjectionLookups: 0,
            layoutComputations: 0,
          },
        }),
        panelViewportColumns: () => 80,
        panelViewportRows: () => 24,
        panelHeadingGeometry: () => [
          {
            contentId: 'terminal',
            row: 22,
            hoveredAction: 'expand',
            controls: [
              {
                action: 'expand',
                startColumn: 74,
                endColumnExclusive: 77,
              },
            ],
          },
        ],
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
          rightActivityBar: { left: 120, top: 0, width: 0, height: 0 },
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
        activityBarItemIdentifiers: () => ['files', 'git', 'extensions'],
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

    workspaceSet.active.editor.document.loadFromText(
      Array.from({ length: 50 }, () => 'x'.repeat(90)).join('\n'),
    );
    workspaceSet.active.editor.hasDocument.value = true;
    workspaceSet.active.editor.viewport.setSize(30, 20);
    const initialSnapshot = AppStatusProjection.Class.snapshot(ports);
    expect(initialSnapshot.mouse).toBeNull();
    expect(initialSnapshot.agentTitle).toBe('');
    expect(initialSnapshot.agentEngine).toBe('');
    expect(initialSnapshot.agentAssistantEntryCount).toBe(0);
    expect(initialSnapshot.agentLastAssistantText).toBe('');
    expect(initialSnapshot.terminalFollowMode).toBe('off');
    // With no runtime contributing terminal status, the keys are simply absent — the host holds no
    // terminal default of its own.
    expect(initialSnapshot.terminalObservedEventCount).toBeUndefined();
    expect(initialSnapshot.terminalLastObservedBoundarySource).toBeUndefined();
    expect(initialSnapshot.boundedListPopupTitle).toBe('');
    expect(initialSnapshot.boundedListPopupItemIdentifiers).toEqual([]);
    expect(initialSnapshot.boundedListPopupMatchIdentifiers).toEqual([]);
    expect(initialSnapshot.boundedListPopupSelectedIdentifier).toBeNull();
    expect(initialSnapshot.quickOpenSelectedIdentifier).toBeNull();
    expect(initialSnapshot.quickOpenFileEnumerationState).toBe('idle');
    expect(initialSnapshot.quickOpenFileEnumerationMessage).toBe('');
    expect(initialSnapshot.pluginPrimaryDockContentIdentifiers).toEqual([
      'git',
      'extensions',
    ]);
    expect(initialSnapshot.activityBarItemIdentifiers).toEqual([
      'files',
      'git',
      'extensions',
    ]);
    expect(initialSnapshot.editorMaximumScrollLeft).toBe(60);
    expect(initialSnapshot.editorMaximumScrollTop).toBe(30);
    expect(initialSnapshot.editorFrameAttribution).toEqual({
      latestFrame: {
        documentLineReads: 0,
        foldProjectionLookups: 0,
        wrapProjectionLookups: 0,
        layoutComputations: 0,
      },
      totals: {
        completedFrameCount: 0,
        documentLineReads: 0,
        foldProjectionLookups: 0,
        wrapProjectionLookups: 0,
        layoutComputations: 0,
      },
    });

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
    contributedStatus = {
      terminalObservedEventCount: 7,
      terminalExited: true,
      terminalExitCode: 17,
      terminalLastObservedBoundarySource: 'heuristic',
      terminalScrollTop: 19,
      terminalScrollContentRows: 43,
      terminalScrollViewportRows: 24,
      terminalWheelForwardedToChild: true,
    };
    quickOpen.matches.value = [
      { path: 'TASK.md', score: 0 },
      { path: 'project.tasks.md', score: 1 },
    ];
    quickOpen.selectedIndex.value = 0;
    quickOpen.fileEnumerationState.value = 'degraded';
    quickOpen.fileEnumerationMessage.value = 'Bounded folder scan';

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
    expect(publishedSnapshot.terminalExited).toBe(true);
    expect(publishedSnapshot.terminalExitCode).toBe(17);
    expect(publishedSnapshot.terminalLastObservedBoundarySource).toBe(
      'heuristic',
    );
    expect(publishedSnapshot.terminalScrollTop).toBe(19);
    expect(publishedSnapshot.terminalScrollContentRows).toBe(43);
    expect(publishedSnapshot.terminalScrollViewportRows).toBe(24);
    expect(publishedSnapshot.terminalWheelForwardedToChild).toBe(true);
    expect(publishedSnapshot.quickOpenSelectedIdentifier).toBe('TASK.md');
    expect(publishedSnapshot.quickOpenFileEnumerationState).toBe('degraded');
    expect(publishedSnapshot.quickOpenFileEnumerationMessage).toBe(
      'Bounded folder scan',
    );
    expect(publishedSnapshot.panelHeadingGeometry).toEqual([
      {
        contentId: 'terminal',
        row: 22,
        hoveredAction: 'expand',
        controls: [
          {
            action: 'expand',
            startColumn: 74,
            endColumnExclusive: 77,
          },
        ],
      },
    ]);
    expect(StatusChannel.Class.snapshot.agentTitle).toBe('Codex (working…)');
    expect(StatusChannel.Class.snapshot.primaryDockFocused).toBe(false);

    panelHost.dispose();
    rightDockHost.dispose();
  });
});
