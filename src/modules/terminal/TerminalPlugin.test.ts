import { expect, test } from 'bun:test';
import { ApplicationContributions } from '../app/ApplicationContributions';
import { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import { Settings } from '../settings/Settings';
import { StatusProjectionContributions } from '../app/StatusProjectionContributions';
import { Theme } from '../theme/Theme';
import { PaneRuntimes } from '../ui/PaneRuntimes';
import type { PaneContent } from '../ui/PaneContent.interface';
import { WorkspaceSet } from '../workspace/WorkspaceSet';
import { MockBackend } from './MockBackend';
import { TerminalEmulator } from './TerminalEmulator';
import { TerminalInstance } from './TerminalInstance';
import { TerminalPaneContent } from './TerminalPaneContent';
import type { TerminalCreateOptions } from './TerminalFactory';
import { TerminalPlugin } from './TerminalPlugin';

/** The runtime with its construction seam pointed at scripted bytes: a byte test, not a shell one. */
class MockBackedTerminalPlugin extends TerminalPlugin.$Class {
  readonly builtOptions: TerminalCreateOptions[] = [];

  protected override buildTerminalPaneContent(
    options: TerminalCreateOptions,
  ): TerminalPaneContent.Model {
    this.builtOptions.push(options);
    return new TerminalPaneContent.Class(
      new TerminalInstance.Class(
        new MockBackend.Class(),
        new TerminalEmulator.Class(options.columns ?? 80, options.rows ?? 24),
      ),
      {
        identifier: options.identifier,
        label: options.label,
        kind: options.kind,
        heading: options.heading,
      },
    );
  }
}

function keyboardEvent(name: string, modifiers: { alt?: boolean } = {}) {
  return {
    name,
    ctrl: false,
    shift: false,
    option: modifiers.alt ?? false,
    super: false,
  };
}

function activatedTerminalPlugin(visiblePane: () => PaneContent | null) {
  const settings = new Settings.Class();
  const keybindings = new KeybindingRegistry.Class();
  const workspaceSet = new WorkspaceSet.Class(settings);
  workspaceSet.open('/tmp');
  const paneRuntimes = new PaneRuntimes.Class();
  const statusProjectionContributions =
    new StatusProjectionContributions.Class();
  const plugin = new MockBackedTerminalPlugin();
  const manager = new ApplicationContributions.Class([plugin], {
    settings,
    keybindings,
    workspaceSet,
    theme: new Theme.Class(),
    paneRuntimes,
    statusProjectionContributions,
    visiblePaneOfKind: () => visiblePane(),
    primaryDockHost: {
      register() {},
      removeContent() {},
    },
    dismissEditorSuggestions() {},
    requestRender() {},
  } as never);
  return {
    manager,
    keybindings,
    paneRuntimes,
    statusProjectionContributions,
  };
}

test('the terminal registers as a runtime and withdraws it symmetrically', () => {
  const context = activatedTerminalPlugin(() => null);
  context.manager.activateAll();

  expect(context.paneRuntimes.runtime('terminal')?.kind).toBe('terminal');
  expect(context.paneRuntimes.addableKinds()).toEqual([
    { kind: 'terminal', label: 'Terminal' },
  ]);
  expect(
    context.keybindings.resolve(
      keyboardEvent('left', { alt: true }),
      'terminal',
      0,
    ).action,
  ).toBe('terminal.wordLeft');
  expect(
    context.statusProjectionContributions.snapshot().terminalObservedEventCount,
  ).toBe(0);

  context.manager.setEnabled('terminal', false);

  expect(context.paneRuntimes.runtime('terminal')).toBeNull();
  expect(context.paneRuntimes.addableKinds()).toEqual([]);
  expect(
    context.keybindings.resolve(
      keyboardEvent('left', { alt: true }),
      'terminal',
      0,
    ).action,
  ).toBeNull();
  expect(
    context.statusProjectionContributions.snapshot().terminalObservedEventCount,
  ).toBeUndefined();

  context.manager.dispose();
});

test('the runtime builds panes and publishes the visible one as current', () => {
  let visiblePane: PaneContent | null = null;
  const context = activatedTerminalPlugin(() => visiblePane);
  const runtimePlugin = context.paneRuntimes;
  context.manager.activateAll();

  const first = context.paneRuntimes.createPane('terminal', {
    identifier: 'terminal',
    label: 'Terminal',
    columns: 80,
    rows: 24,
    workingDirectory: '/tmp',
  });
  const second = context.paneRuntimes.createPane('terminal', {
    identifier: 'terminal-2',
    label: 'Terminal 2',
    columns: 80,
    rows: 24,
    workingDirectory: '/tmp',
  });
  expect(first?.kind).toBe('terminal');
  expect(second?.id).toBe('terminal-2');

  const runtime = context.paneRuntimes.runtime(
    'terminal',
  ) as TerminalPlugin.Model;
  // With nothing visible the oldest live instance is current; the visible one always wins.
  expect(runtime.currentPane()?.id).toBe('terminal');
  visiblePane = second;
  expect(runtime.currentPane()?.id).toBe('terminal-2');

  // A declared task owns its own switching identity and must never become "the" terminal.
  const task = context.paneRuntimes.createPane('terminal', {
    identifier: 'build',
    label: 'build',
    kind: 'build',
    heading: 'build',
    columns: 80,
    rows: 24,
    workingDirectory: '/tmp',
    process: { command: 'printf', arguments: ['%s\n', 'built'] },
  });
  expect(task?.kind).toBe('build');
  visiblePane = null;
  expect(runtime.currentPane()?.id).toBe('terminal');

  runtimePlugin.paneRemoved(first as PaneContent);
  expect(runtime.currentPane()?.id).toBe('terminal-2');

  // Prompt policy is the runtime's, not the host's: the interactive shell gets the themed clean
  // prompt, a declared task keeps its own.
  const builtOptions = (runtime as MockBackedTerminalPlugin).builtOptions;
  expect(builtOptions[0]?.cleanPrompt).toBe(true);
  expect(builtOptions[0]?.promptColor).toBeString();
  expect(builtOptions[2]?.cleanPrompt).toBe(false);
  expect(builtOptions[2]?.promptColor).toBeUndefined();
  expect(builtOptions[2]?.command).toBe('printf');

  context.manager.dispose();
});

test('the terminal pane publishes its ports by capability identifier', () => {
  const pane = new TerminalPaneContent.Class(
    new TerminalInstance.Class(
      new MockBackend.Class(),
      new TerminalEmulator.Class(80, 24),
    ),
    { identifier: 'terminal' },
  );
  expect(pane.keybindingContext).toBe('terminal');
  expect(pane.capability<TerminalPaneContent.Model>('terminal-commands')).toBe(
    pane,
  );
  expect(
    pane.capability<TerminalPaneContent.Model>('terminal-observation'),
  ).toBe(pane);
  expect(pane.capability<TerminalPaneContent.Model>('text-selection')).toBe(
    pane,
  );
  expect(pane.capability<TerminalPaneContent.Model>('language')).toBeNull();
  // Copy is claimed only when there is something to copy; otherwise Ctrl+C stays SIGINT.
  expect(pane.claimsContextAction('terminal.copy')).toBe(false);
  expect(pane.claimsContextAction('terminal.wordLeft')).toBe(true);
  pane.dispose();
});
