// The terminal as a RUNTIME plugin — #103's third plugin kind. Contributors add surfaces, providers
// answer questions, RUNTIMES OWN PROCESSES. This file is the whole of what the host used to know:
// which shell to start, what the prompt looks like, how many instances exist, which one is current,
// what its status projects, and which keystrokes belong to a focused terminal. The host now holds a
// pane runtime it cannot name and a PaneContent it cannot inspect.
//
// invariant: Plugin boundaries grant one authority (project.invariants.md)
// invariant: The terminal is a runtime plugin (src/modules/terminal/terminal.invariants.md)
// invariant: A pane runtime owns its processes (src/modules/ui/ui.invariants.md)
import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import type { StatusSnapshot } from '../system/StatusChannel';
import type { Keybinding } from '../keybindings/KeybindingRegistry';
import type { PaneContent } from '../ui/PaneContent.interface';
import type {
  PaneRuntime,
  PaneRuntimeHostPort,
  PaneRuntimeRequest,
} from '../ui/PaneRuntime.interface';
import { TerminalFactory, type TerminalCreateOptions } from './TerminalFactory';
import { TerminalPaneContent } from './TerminalPaneContent';

class $TerminalPlugin implements ApplicationContributor, PaneRuntime {
  readonly identifier = 'terminal';
  readonly name = 'Terminal';
  readonly kind = 'terminal';
  readonly instanceLabel = 'Terminal';
  readonly panelSpace = { kind: 'terminal', label: 'Terminal' } as const;
  readonly offeredInPanelAddMenu = true;
  readonly offeredAsPanelSpace = true;
  readonly paneAddMenuEntries = [
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
  ] as const;
  readonly defaultSplitPriority = 1;
  protected application: ApplicationContributionContext | null = null;
  protected hostPort: PaneRuntimeHostPort | null = null;
  protected disposeStatusProjection: (() => void) | null = null;
  protected disposeCommands: (() => void) | null = null;
  // Every live pane this runtime owns, oldest first — the runtime's own session registry, so the
  // host never keeps a per-kind instance map.
  protected readonly panes = new Map<string, TerminalPaneContent.Model>();

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    this.hostPort = context.registerPaneRuntime(this);
    context.registerKeybindings(this.keybindings());
    this.registerCommands(context);
    this.disposeStatusProjection =
      context.statusProjectionContributions.register({
        snapshot: () => this.statusSnapshot(),
      });
  }

  createPane(request: PaneRuntimeRequest): PaneContent {
    const context = this.application;
    if (!context) throw new Error('The terminal runtime is not activated');
    if (
      (request.kind ?? this.kind) === this.kind &&
      this.panes.has(request.identifier)
    ) {
      throw new Error(
        `Terminal pane identifier already belongs to another session: ${request.identifier}`,
      );
    }
    const { settings, theme } = context;
    const declaredProcess = request.process;
    const content = this.buildTerminalPaneContent({
      identifier: request.identifier,
      label: request.label,
      kind: request.kind,
      heading: request.heading,
      task: request.task,
      columns: request.columns,
      rows: request.rows,
      cwd: request.workingDirectory,
      command: declaredProcess?.command,
      arguments: declaredProcess?.arguments,
      environment: declaredProcess?.environment,
      // A declared process owns its own prompt; only the ordinary interactive shell is themed.
      cleanPrompt: declaredProcess ? false : settings.terminalCleanPrompt.value,
      promptColor: declaredProcess ? undefined : theme.palette.terminalPrompt,
      typingSpeed: () => settings.terminalTypingSpeed.value,
      reducedMotion: () => settings.reducedMotion.value,
    });
    // Every terminal-kind pane joins the runtime's session registry. A task keeps its task identity
    // in metadata, so its process remains a normal terminal session here.
    if ((request.kind ?? this.kind) === this.kind) {
      this.panes.set(content.id, content);
    }
    return content;
  }

  // invariant: Construction goes through overridable seams (project.invariants.md)
  protected buildTerminalPaneContent(
    options: TerminalCreateOptions,
  ): TerminalPaneContent.Model {
    return TerminalFactory.Class.create(options);
  }

  paneRemoved(content: PaneContent): void {
    this.panes.delete(content.id);
  }

  /** The pane an outside consumer means by "the terminal" in the active workspace world. */
  // invariant: Each workspace owns one panel world (src/modules/workspace/workspace.invariants.md)
  currentPane(): TerminalPaneContent.Model | null {
    const currentPane = this.hostPort?.currentPane() ?? null;
    return currentPane instanceof TerminalPaneContent.Class
      ? currentPane
      : null;
  }

  disposeApplication(): void {
    this.disposeCommands?.();
    this.disposeCommands = null;
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    // Release the panes BEFORE dropping the host port: a withdrawn runtime must leave no live pane
    // rendering or holding keyboard focus. Snapshot the identifiers first — each release calls back
    // into `paneRemoved`, which mutates this map.
    const ownedPaneIdentifiers = [...this.panes.keys()];
    for (const identifier of ownedPaneIdentifiers) {
      this.hostPort?.releasePane(identifier);
    }
    this.panes.clear();
    this.hostPort?.dispose();
    this.hostPort = null;
    this.application = null;
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const pane = this.currentPane();
    return {
      terminalObservedEventCount: pane?.observedEventCount ?? 0,
      terminalExited: pane?.terminalExited ?? false,
      terminalExitCode: pane?.terminalExitCode ?? null,
      terminalLastObservedBoundarySource:
        pane?.lastObservedBoundarySource ?? null,
      terminalScrollTop: pane?.scrollTop ?? 0,
      terminalScrollContentRows: pane?.scrollContentRows ?? 0,
      terminalScrollViewportRows: pane?.scrollViewportRows ?? 0,
      terminalWheelForwardedToChild: pane?.forwardsWheelToChild ?? false,
    };
  }

  /** The terminal context's own bindings, contributed by the runtime instead of sitting in the
   *  host's canonical layer. Ctrl+C is claimed only when the pane has a selection — see
   *  `TerminalPaneContent.claimsContextAction`. */
  protected keybindings(): readonly Keybinding[] {
    return [
      {
        chord: { key: 'c', ctrl: true },
        action: 'terminal.copy',
        context: 'terminal',
      },
      {
        chord: { key: 'c', super: true },
        action: 'terminal.copy',
        context: 'terminal',
      },
      {
        chord: { key: 'left', alt: true },
        action: 'terminal.wordLeft',
        context: 'terminal',
      },
      {
        chord: { key: 'b', alt: true },
        action: 'terminal.wordLeft',
        context: 'terminal',
      },
      {
        chord: { key: 'right', alt: true },
        action: 'terminal.wordRight',
        context: 'terminal',
      },
      {
        chord: { key: 'f', alt: true },
        action: 'terminal.wordRight',
        context: 'terminal',
      },
      {
        chord: { key: 'backspace', alt: true },
        action: 'terminal.deletePreviousWord',
        context: 'terminal',
      },
    ];
  }

  protected registerCommands(context: ApplicationContributionContext): void {
    const currentPane = (): TerminalPaneContent.Model | null =>
      this.currentPane();
    this.disposeCommands = context.commands.registerAll([
      {
        id: 'terminal.copy',
        title: 'Terminal: Copy',
        category: 'Terminal',
        when: () => currentPane()?.hasSelection() ?? false,
        run: () => {
          const pane = currentPane();
          if (pane) context.copyPaneSelection(pane);
        },
      },
      {
        id: 'terminal.wordLeft',
        title: 'Terminal: Word Left',
        category: 'Terminal',
        when: () => currentPane() !== null,
        run: () => currentPane()?.moveWordLeft(),
      },
      {
        id: 'terminal.wordRight',
        title: 'Terminal: Word Right',
        category: 'Terminal',
        when: () => currentPane() !== null,
        run: () => currentPane()?.moveWordRight(),
      },
      {
        id: 'terminal.deletePreviousWord',
        title: 'Terminal: Delete Previous Word',
        category: 'Terminal',
        when: () => currentPane() !== null,
        run: () => currentPane()?.deletePreviousWord(),
      },
    ]);
  }
}

export namespace TerminalPlugin {
  export const $Class = $TerminalPlugin;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
