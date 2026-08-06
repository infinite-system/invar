import { expect, test } from 'bun:test';
import { ApplicationContributions } from '../app/ApplicationContributions';
import { StatusProjectionContributions } from '../app/StatusProjectionContributions';
import { CommandRegistry } from '../commands/CommandRegistry';
import { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import { Settings } from '../settings/Settings';
import { Theme } from '../theme/Theme';
import type { PaneContent } from '../ui/PaneContent.interface';
import { PanelHost } from '../ui/PanelHost';
import { PaneRuntimes } from '../ui/PaneRuntimes';
import type { PaneRuntimeRequest } from '../ui/PaneRuntime.interface';
import { WorkspaceSet } from '../workspace/WorkspaceSet';
import { MediaPlugin } from './MediaPlugin';

class AbsentFfmpegMediaPlugin extends MediaPlugin.$Class {
  protected override findFfmpeg(): string | null {
    return null;
  }
}

function activatedMediaPlugin(currentPane: () => PaneContent | null) {
  const releasedPaneIdentifiers: string[] = [];
  const openedRuntimePanes: Array<{
    runtimeKind: string;
    request: PaneRuntimeRequest;
  }> = [];
  const settings = new Settings.Class();
  const keybindings = new KeybindingRegistry.Class();
  const commands = new CommandRegistry.Class();
  const workspaceSet = new WorkspaceSet.Class(settings);
  workspaceSet.open('/tmp');
  const paneRuntimes = new PaneRuntimes.Class();
  const statusProjectionContributions =
    new StatusProjectionContributions.Class();
  const plugin = new AbsentFfmpegMediaPlugin();
  const manager = new ApplicationContributions.Class([plugin], {
    settings,
    keybindings,
    commands,
    workspaceSet,
    theme: new Theme.Class(),
    paneRuntimes,
    bottomPanelHost: new PanelHost.Class(),
    statusProjectionContributions,
    openRuntimePane: (runtimeKind: string, request: PaneRuntimeRequest) => {
      openedRuntimePanes.push({ runtimeKind, request });
      return true;
    },
    currentPaneOfKind: () => currentPane(),
    releasePane: (identifier: string) => {
      releasedPaneIdentifiers.push(identifier);
      paneRuntimes.paneRemoved({ id: identifier, kind: 'media' } as never);
    },
    renderer: {
      width: 100,
      height: 30,
      resolution: { width: 800, height: 480 },
      idle: () => Promise.resolve(),
      writeOut: () => true,
    },
    primaryDockHost: {
      register() {},
      removeContent() {},
    },
    dismissEditorSuggestions() {},
    requestRender() {},
  } as never);
  return {
    commands,
    keybindings,
    manager,
    paneRuntimes,
    plugin,
    openedRuntimePanes,
    releasedPaneIdentifiers,
    statusProjectionContributions,
  };
}

test('dropped image and video paths open media runtime panes', () => {
  const context = activatedMediaPlugin(() => null);
  context.manager.activateAll();

  expect(
    context.manager.openDroppedPath({
      path: '/tmp/picture.png',
      readOnly: false,
    }),
  ).toBe(true);
  expect(
    context.manager.openDroppedPath({
      path: '/tmp/movie.mp4',
      readOnly: true,
    }),
  ).toBe(true);
  expect(
    context.manager.openDroppedPath({
      path: '/tmp/notes.txt',
      readOnly: false,
    }),
  ).toBe(false);
  expect(
    context.openedRuntimePanes.map(({ runtimeKind, request }) => ({
      runtimeKind,
      label: request.label,
      resourcePath: request.resourcePath,
    })),
  ).toEqual([
    {
      runtimeKind: 'media',
      label: 'picture.png',
      resourcePath: '/tmp/picture.png',
    },
    {
      runtimeKind: 'media',
      label: 'movie.mp4 [read-only]',
      resourcePath: '/tmp/movie.mp4',
    },
  ]);
});

test('media runtime, commands, keys, and status withdraw together', () => {
  let currentPane: PaneContent | null = null;
  const context = activatedMediaPlugin(() => currentPane);
  context.manager.activateAll();

  expect(context.paneRuntimes.runtime('media')).toBe(context.plugin);
  expect(context.plugin.panelSpace).toEqual({ kind: 'media', label: 'Media' });
  expect(context.paneRuntimes.addableKinds()).toEqual([
    { kind: 'media', label: '3D Demo' },
  ]);
  expect(context.commands.get('media.openDemo')).toBeDefined();
  expect(
    context.keybindings.resolve(
      {
        name: 'space',
        ctrl: false,
        shift: false,
        option: false,
        super: false,
      },
      'media',
      0,
    ).action,
  ).toBe('media.togglePlayback');
  expect(
    context.statusProjectionContributions.snapshot().mediaFfmpegAvailable,
  ).toBe(false);

  currentPane = context.paneRuntimes.createPane('media', {
    identifier: 'media-demo',
    label: '3D Demo',
    columns: 20,
    rows: 8,
    workingDirectory: '/tmp',
  });
  expect(context.statusProjectionContributions.snapshot().mediaMode).toBe(
    'demo',
  );
  expect(() =>
    context.paneRuntimes.createPane('media', {
      identifier: 'media-demo',
      label: 'Another Demo',
      columns: 20,
      rows: 8,
      workingDirectory: '/tmp',
    }),
  ).toThrow(
    'Media pane identifier already belongs to another session: media-demo',
  );

  context.manager.setEnabled('media', false);

  expect(context.paneRuntimes.runtime('media')).toBeNull();
  expect(context.commands.get('media.openDemo')).toBeUndefined();
  expect(
    context.statusProjectionContributions.snapshot().mediaMode,
  ).toBeUndefined();
  expect(
    context.manager.openDroppedPath({
      path: '/tmp/picture.png',
      readOnly: false,
    }),
  ).toBe(false);
  expect(context.releasedPaneIdentifiers).toEqual(['media-demo']);
  context.manager.dispose();
});
