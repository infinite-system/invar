import { expect, test } from 'bun:test';
import { ApplicationContributions } from '../app/ApplicationContributions';
import { CommandRegistry } from '../commands/CommandRegistry';
import { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import { Settings } from '../settings/Settings';
import { StatusProjectionContributions } from '../app/StatusProjectionContributions';
import { Theme } from '../theme/Theme';
import { PaneRuntimes } from '../ui/PaneRuntimes';
import type { PaneContent } from '../ui/PaneContent.interface';
import { PanelHost } from '../ui/PanelHost';
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
        task: options.task,
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

function activatedTerminalPlugin(currentPane: () => PaneContent | null) {
  const releasedPaneIdentifiers: string[] = [];
  const settings = new Settings.Class();
  const keybindings = new KeybindingRegistry.Class();
  const commands = new CommandRegistry.Class();
  const workspaceSet = new WorkspaceSet.Class(settings);
  workspaceSet.open('/tmp');
  const paneRuntimes = new PaneRuntimes.Class();
  const statusProjectionContributions =
    new StatusProjectionContributions.Class();
  const plugin = new MockBackedTerminalPlugin();
  const manager = new ApplicationContributions.Class([plugin], {
    settings,
    keybindings,
    commands,
    workspaceSet,
    theme: new Theme.Class(),
    paneRuntimes,
    bottomPanelHost: new PanelHost.Class(),
    statusProjectionContributions,
    currentPaneOfKind: () => currentPane(),
    releasePane: (identifier: string) => {
      releasedPaneIdentifiers.push(identifier);
      paneRuntimes.paneRemoved({ id: identifier, kind: 'terminal' } as never);
    },
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
    commands,
    paneRuntimes,
    statusProjectionContributions,
    releasedPaneIdentifiers,
  };
}

test('the terminal registers as a runtime and withdraws it symmetrically', () => {
  const context = activatedTerminalPlugin(() => null);
  context.manager.activateAll();

  expect(context.paneRuntimes.runtime('terminal')?.kind).toBe('terminal');
  expect(context.paneRuntimes.addableKinds()).toEqual([
    { kind: 'terminal', label: 'Terminal' },
  ]);
  expect(context.paneRuntimes.spaceAddableKinds()).toEqual([
    { kind: 'terminal', label: 'Terminal' },
  ]);
  expect(context.paneRuntimes.paneAddMenuEntries('terminal')).toEqual([
    {
      identifier: 'terminal',
      label: 'Terminal',
      instanceLabel: 'Terminal',
      spaceKind: 'terminal',
    },
    {
      identifier: 'terminal-agent',
      label: 'Terminal (Agent)',
      instanceLabel: 'Terminal (Agent)',
      spaceKind: 'terminal',
      process: { command: 'claude' },
    },
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
  // Every contributed binding is SCOPED to the terminal context. A focused pane dispatches only
  // scoped bindings, so a chord that leaked in as global would be swallowed instead of reaching
  // the child as bytes — the #114 Wave B regression the reserved-chord and keyboard-invariant
  // smokes caught.
  for (const ownedChord of [
    keyboardEvent('left', { alt: true }),
    keyboardEvent('right', { alt: true }),
    keyboardEvent('b', { alt: true }),
    keyboardEvent('f', { alt: true }),
    keyboardEvent('backspace', { alt: true }),
  ]) {
    expect(context.keybindings.resolve(ownedChord, 'terminal', 0).context).toBe(
      'terminal',
    );
  }
  expect(
    context.keybindings.resolve(
      { name: 'c', ctrl: true, shift: false, option: false, super: false },
      'terminal',
      0,
    ).context,
  ).toBe('terminal');
  expect(
    context.keybindings.resolve(
      { name: 'c', ctrl: false, shift: false, option: false, super: true },
      'terminal',
      0,
    ).action,
  ).toBe('terminal.copy');
  expect(context.commands.get('terminal.wordLeft')).toMatchObject({
    title: 'Terminal: Word Left',
    category: 'Terminal',
  });
  // Chords the terminal must NOT own: they have to pass through to the child as raw bytes.
  for (const passThroughChord of ['p', 'f', 's', 'r', 'u', 'w']) {
    expect(
      context.keybindings.resolve(
        {
          name: passThroughChord,
          ctrl: true,
          shift: false,
          option: false,
          super: false,
        },
        'terminal',
        0,
      ).context,
    ).not.toBe('terminal');
  }

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
  expect(context.commands.get('terminal.wordLeft')).toBeUndefined();
  expect(
    context.statusProjectionContributions.snapshot().terminalObservedEventCount,
  ).toBeUndefined();

  context.manager.dispose();
});

test('the runtime builds panes and publishes the active workspace pane as current', () => {
  let currentPane: PaneContent | null = null;
  const context = activatedTerminalPlugin(() => currentPane);
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
  expect(() =>
    context.paneRuntimes.createPane('terminal', {
      identifier: 'terminal-2',
      label: 'Another Terminal',
      columns: 80,
      rows: 24,
      workingDirectory: '/tmp',
    }),
  ).toThrow(
    'Terminal pane identifier already belongs to another session: terminal-2',
  );

  const runtime = context.paneRuntimes.runtime(
    'terminal',
  ) as TerminalPlugin.Model;
  // The host reports only the active workspace world. A live terminal in another world is not
  // current merely because it is the runtime's oldest instance.
  expect(runtime.currentPane()).toBeNull();
  currentPane = first;
  expect(runtime.currentPane()?.id).toBe('terminal');
  currentPane = second;
  expect(runtime.currentPane()?.id).toBe('terminal-2');

  // A declared task is a terminal session with task metadata. The host uses that metadata to keep
  // the task distinct from the runtime's default interactive pane.
  const task = context.paneRuntimes.createPane('terminal', {
    identifier: 'build',
    label: 'build',
    kind: 'terminal',
    heading: 'build',
    task: {
      label: 'build',
      workspaceRoot: '/tmp',
      sourcePath: '/tmp/.invar/tasks.json',
    },
    columns: 80,
    rows: 24,
    workingDirectory: '/tmp',
    process: { command: 'printf', arguments: ['%s\n', 'built'] },
  });
  expect(task?.kind).toBe('terminal');
  expect(task?.task?.sourcePath).toBe('/tmp/.invar/tasks.json');
  currentPane = null;
  expect(runtime.currentPane()).toBeNull();

  currentPane = second;
  runtimePlugin.paneRemoved(first as PaneContent);
  expect(runtime.currentPane()?.id).toBe('terminal-2');

  // Uninstall releases every pane the runtime still owns — a withdrawn runtime must leave no live
  // pane rendering or holding keyboard focus. The declared task is one of those terminal panes.
  context.manager.setEnabled('terminal', false);
  expect(context.releasedPaneIdentifiers).toEqual(['terminal-2', 'build']);
  expect(runtime.currentPane()).toBeNull();

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
