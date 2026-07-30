import { expect, test } from 'bun:test';
import { ApplicationContributions } from '../app/ApplicationContributions';
import { StatusProjectionContributions } from '../app/StatusProjectionContributions';
import { CommandRegistry } from '../commands/CommandRegistry';
import { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import { Settings } from '../settings/Settings';
import { Theme } from '../theme/Theme';
import type { PaneContent } from '../ui/PaneContent.interface';
import { PaneRuntimes } from '../ui/PaneRuntimes';
import { WorkspaceSet } from '../workspace/WorkspaceSet';
import { MediaPlugin } from './MediaPlugin';

class AbsentFfmpegMediaPlugin extends MediaPlugin.$Class {
  protected override findFfmpeg(): string | null {
    return null;
  }
}

function activatedMediaPlugin(currentPane: () => PaneContent | null) {
  const releasedPaneIdentifiers: string[] = [];
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
    statusProjectionContributions,
    currentPaneOfKind: () => currentPane(),
    releasePane: (identifier: string) => {
      releasedPaneIdentifiers.push(identifier);
      const pane = paneRuntimes.createPane('media', {
        identifier,
        label: identifier,
        columns: 20,
        rows: 8,
        workingDirectory: '/tmp',
      });
      if (pane) paneRuntimes.paneRemoved(pane);
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
    releasedPaneIdentifiers,
    statusProjectionContributions,
  };
}

test('media runtime, commands, keys, and status withdraw together', () => {
  let currentPane: PaneContent | null = null;
  const context = activatedMediaPlugin(() => currentPane);
  context.manager.activateAll();

  expect(context.paneRuntimes.runtime('media')).toBe(context.plugin);
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

  context.manager.setEnabled('media', false);

  expect(context.paneRuntimes.runtime('media')).toBeNull();
  expect(context.commands.get('media.openDemo')).toBeUndefined();
  expect(
    context.statusProjectionContributions.snapshot().mediaMode,
  ).toBeUndefined();
  expect(context.releasedPaneIdentifiers).toEqual(['media-demo']);
  context.manager.dispose();
});
