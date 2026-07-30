import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ref } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import { RenderLoadLedger } from '../system/RenderLoadLedger';
import { ThemePalettes } from '../theme/ThemePalettes';
import { PanelHost } from '../ui/PanelHost';
import type { PaneContent } from '../ui/PaneContent.interface';
import { MonitoringPlugin } from './MonitoringPlugin';

interface RecordingContext {
  context: ApplicationContributionContext;
  rightDockHost: PanelHost.Instance;
  dockContents: PaneContent[];
  keybindingRegistrations: number;
  settingIdentifiers: string[];
  commandIds: string[];
  commandRunners: Map<string, () => void>;
  commandDisposals: number;
  statusDisposals: number;
  settingDisposals: number;
  snapshot: () => Record<string, unknown>;
}

function makeContext(
  workspaceRoot: string,
  settingValues: Record<string, unknown> = {},
): RecordingContext {
  const dockContents: PaneContent[] = [];
  const commandIds: string[] = [];
  const commandRunners = new Map<string, () => void>();
  const settingIdentifiers: string[] = [];
  const rightDockHost = new PanelHost.Class();
  let snapshotProvider: (() => Record<string, unknown>) | null = null;
  const activeWorkspace = {
    root: workspaceRoot,
    focusEditor: () => {},
    buffers: { documentLedger: () => [] },
  };
  const recording: RecordingContext = {
    rightDockHost,
    dockContents,
    keybindingRegistrations: 0,
    settingIdentifiers,
    commandIds,
    commandRunners,
    commandDisposals: 0,
    statusDisposals: 0,
    settingDisposals: 0,
    snapshot: () => snapshotProvider?.() ?? {},
    context: {
      workspaceSet: {
        active: activeWorkspace,
        entries: ref([activeWorkspace]),
        activeWorkspaceIndex: ref(0),
        open: () => 0,
      },
      rightDockHost,
      primaryDockHost: rightDockHost,
      settings: { scrollbarThickness: ref(1) },
      theme: { palette: ThemePalettes.Class.DARK, glyphLevel: ref('unicode') },
      registerKeybindings: () => {
        recording.keybindingRegistrations += 1;
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
          isVisible: () =>
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
        defaultValue: unknown;
      }) => {
        settingIdentifiers.push(contribution.identifier);
        return {
          value: ref(
            contribution.identifier in settingValues
              ? settingValues[contribution.identifier]
              : contribution.defaultValue,
          ),
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
        registerAll: (commands: readonly { id: string; run: () => void }[]) => {
          for (const command of commands) {
            commandIds.push(command.id);
            commandRunners.set(command.id, command.run);
          }
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

test('activation registers the dock pane, keybindings, settings, commands, and status keys', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'monitoring-plugin-'));
  const plugin = new MonitoringPlugin.Class();
  const recording = makeContext(workspaceRoot);
  plugin.activateApplication(recording.context);
  expect(recording.dockContents.map((content) => content.id)).toEqual([
    'monitoring',
  ]);
  expect(recording.keybindingRegistrations).toBe(1);
  expect(recording.settingIdentifiers).toEqual([
    'monitoringSampleSeconds',
    'monitoringLogging',
    'monitoring.dockSide',
  ]);
  expect(recording.commandIds).toEqual([
    'view.showMonitoring',
    'monitoring.toggleLogging',
    'monitoring.heapCensus',
  ]);
  const snapshot = recording.snapshot();
  expect(snapshot.monitoringObserved).toBe(false);
  expect(snapshot.monitoringSamplingAtRest).toBe(true);
  expect(snapshot.monitoringSampleCount).toBe(0);
  expect(snapshot.monitoringLogging).toBe(false);
  plugin.disposeApplication();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

test('a hidden pane owns no sampling clock; showing it starts one and hiding it stops it', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'monitoring-plugin-'));
  const plugin = new MonitoringPlugin.Class();
  const recording = makeContext(workspaceRoot);
  plugin.activateApplication(recording.context);
  expect(recording.snapshot().monitoringSamplingAtRest).toBe(true);
  expect(recording.snapshot().monitoringSampleCount).toBe(0);

  recording.rightDockHost.visible.value = true;
  recording.rightDockHost.showContent('monitoring');
  expect(recording.snapshot().monitoringObserved).toBe(true);
  expect(recording.snapshot().monitoringSamplingAtRest).toBe(false);
  expect(Number(recording.snapshot().monitoringSampleCount)).toBeGreaterThan(0);
  expect(
    Number(recording.snapshot().monitoringResidentSetBytes),
  ).toBeGreaterThan(0);

  recording.rightDockHost.visible.value = false;
  expect(recording.snapshot().monitoringObserved).toBe(false);
  expect(recording.snapshot().monitoringSamplingAtRest).toBe(true);
  plugin.disposeApplication();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

test('withdrawal is total: dispose stops the clock and takes back every registration', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'monitoring-plugin-'));
  const plugin = new MonitoringPlugin.Class();
  const recording = makeContext(workspaceRoot);
  plugin.activateApplication(recording.context);
  recording.rightDockHost.visible.value = true;
  recording.rightDockHost.showContent('monitoring');
  expect(recording.snapshot().monitoringSamplingAtRest).toBe(false);

  plugin.disposeApplication();
  expect(recording.commandDisposals).toBe(1);
  expect(recording.statusDisposals).toBe(1);
  // The projection is ABSENT, not stale: no monitoring key survives the withdrawal.
  expect(recording.snapshot()).toEqual({});
  rmSync(workspaceRoot, { recursive: true, force: true });
});

test('a reinstall rebuilds the pane and a live projection from the same context', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'monitoring-plugin-'));
  const plugin = new MonitoringPlugin.Class();
  const first = makeContext(workspaceRoot);
  plugin.activateApplication(first.context);
  plugin.disposeApplication();

  const second = makeContext(workspaceRoot);
  plugin.activateApplication(second.context);
  expect(second.dockContents.map((content) => content.id)).toEqual([
    'monitoring',
  ]);
  expect(second.snapshot().monitoringSampleCount).toBe(0);
  second.rightDockHost.visible.value = true;
  second.rightDockHost.showContent('monitoring');
  expect(Number(second.snapshot().monitoringSampleCount)).toBeGreaterThan(0);
  plugin.disposeApplication();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

test('the logging command flips the projected logging state', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'monitoring-plugin-'));
  const plugin = new MonitoringPlugin.Class();
  const recording = makeContext(workspaceRoot);
  plugin.activateApplication(recording.context);
  expect(recording.snapshot().monitoringLogging).toBe(false);
  recording.commandRunners.get('monitoring.toggleLogging')?.();
  expect(recording.snapshot().monitoringLogging).toBe(true);
  recording.commandRunners.get('monitoring.toggleLogging')?.();
  expect(recording.snapshot().monitoringLogging).toBe(false);
  plugin.disposeApplication();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

test('the contributed logging setting turns logging on without a command', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'monitoring-plugin-'));
  const plugin = new MonitoringPlugin.Class();
  const recording = makeContext(workspaceRoot, { monitoringLogging: true });
  plugin.activateApplication(recording.context);
  expect(recording.snapshot().monitoringLogging).toBe(true);
  plugin.disposeApplication();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

test('the census command publishes the retained heap and what it cost', async () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'monitoring-plugin-'));
  const plugin = new MonitoringPlugin.Class();
  const recording = makeContext(workspaceRoot);
  plugin.activateApplication(recording.context);
  expect(recording.snapshot().monitoringCensusLiveHeapBytes).toBeNull();
  recording.commandRunners.get('monitoring.heapCensus')?.();
  await Bun.sleep(120);
  expect(
    Number(recording.snapshot().monitoringCensusLiveHeapBytes),
  ).toBeGreaterThan(0);
  expect(
    Number(recording.snapshot().monitoringCensusCostMilliseconds),
  ).toBeGreaterThan(0);
  expect(recording.snapshot().monitoringCensusCount).toBe(1);
  plugin.disposeApplication();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

test('render load is attributed per plugin and reported against the open baseline', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'monitoring-plugin-'));
  RenderLoadLedger.Class.reset();
  const plugin = new MonitoringPlugin.Class();
  const recording = makeContext(workspaceRoot);
  plugin.activateApplication(recording.context);
  RenderLoadLedger.Class.record('noisy-plugin');
  recording.rightDockHost.visible.value = true;
  recording.rightDockHost.showContent('monitoring');
  // Opening the pane marks the baseline, so past load is not blamed on this watch.
  expect(recording.snapshot().monitoringRenderRequestsSinceOpen).toBe(0);
  RenderLoadLedger.Class.record('noisy-plugin');
  RenderLoadLedger.Class.record('noisy-plugin');
  RenderLoadLedger.Class.record('quiet-plugin');
  expect(recording.snapshot().monitoringRenderRequestsSinceOpen).toBe(3);
  expect(recording.snapshot().monitoringStrayCandidate).toBe('noisy-plugin');

  // Hiding and re-showing must NOT erase the load raised while the pane was away.
  recording.rightDockHost.visible.value = false;
  RenderLoadLedger.Class.record('noisy-plugin');
  recording.rightDockHost.visible.value = true;
  recording.rightDockHost.showContent('monitoring');
  expect(recording.snapshot().monitoringRenderRequestsSinceOpen).toBe(4);
  expect(recording.snapshot().monitoringStrayCandidate).toBe('noisy-plugin');
  plugin.disposeApplication();
  RenderLoadLedger.Class.reset();
  rmSync(workspaceRoot, { recursive: true, force: true });
});
