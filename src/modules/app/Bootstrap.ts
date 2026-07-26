// Boot sequence: seal the kernel, create the renderer, open the workspace, build the frame,
// wire ONE reactive frame effect, wire input, and run until quit.
//
// invariant: The app is built only after the kernel is sealed (project.invariants.md)
// invariant: Data flows one way (project.invariants.md)
// invariant: Rendering is one coarse frame effect (app.invariants.md)
// invariant: Construction goes through overridable seams (project.invariants.md)
import {
  createCliRenderer,
  type CliRenderer,
  type KeyEvent,
} from '@opentui/core';
import { Static } from 'ivue/extras';
import { App } from './App';
import { Kernel } from '../kernel/Kernel';
import { Workspace } from '../workspace/Workspace';
import { WorkspaceSet } from '../workspace/WorkspaceSet';
import { Theme } from '../theme/Theme';
import { TerminalCapabilities } from '../theme/TerminalCapabilities';
import { CommandRegistry } from '../commands/CommandRegistry';
import { CommandDefaults } from '../commands/CommandDefaults';
import { RootView } from '../ui/RootView';
import { TabStrip } from '../ui/TabStrip';
import { ContextMenu } from '../ui/ContextMenu';
import { BoundedListPopup } from '../ui/BoundedListPopup';
import { CompletionPopup } from '../ui/CompletionPopup';
import { OverlayCoordinator } from '../ui/OverlayCoordinator';
import { ShortcutHelp } from '../ui/ShortcutHelp';
import { Tooltip } from '../ui/Tooltip';
import { Settings } from '../settings/Settings';
import { SettingsPanel } from '../settings/SettingsPanel';
import { FindBar } from '../search/FindBar';
import { QuickOpen } from '../search/QuickOpen';
import { Files } from '../system/Files';
import { StatusChannel } from '../system/StatusChannel';
import { FrameProbe } from '../system/FrameProbe';
import { ScrollPhysics } from '../ui/ScrollPhysics';
import { Clipboard } from '../system/Clipboard';
import { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import { KeybindingDefaults } from '../keybindings/KeybindingDefaults';
import { KeybindingMac } from '../keybindings/KeybindingMac';
import { Environment } from '../system/Environment';
import { Logging } from '../system/Logging';
import { HandlerGuard } from './HandlerGuard';
import { TerminalSession } from './TerminalSession';
import {
  AppStatusProjection,
  type AppStatusMouseEvent,
  type AppStatusProjectionPorts,
} from './AppStatusProjection';
import { PanelHost } from '../ui/PanelHost';
import { PanelAddPopup, type PanelContentKind } from '../ui/PanelAddPopup';
import type { PaneContent } from '../ui/PaneContent.interface';
import { TerminalFactory } from '../terminal/TerminalFactory';
import { TerminalPaneContent } from '../terminal/TerminalPaneContent';
import type { TerminalCommandEvent } from '../terminal/TerminalCommandController';
import { AgentFactory } from '../agent/AgentFactory';
import type { AgentTerminalToolPort } from '../agent/AgentTerminalTools';
import { BracketMatch } from '../editor/BracketMatch';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import type { TextInputAction } from '../editor/TextInputModel';
import { LanguageRegistry } from '../syntax/LanguageRegistry';
import {
  AgentPaneContent,
  type AgentEnginePort,
  type AgentTranscriptSearchPort,
} from '../agent/AgentPaneContent';
import { AgentProviderRegistry } from '../agent/AgentProviderRegistry';
import { AgentTerminalFollow } from '../agent/AgentTerminalFollow';
import { AgentSkillPopup } from '../agent/AgentSkillPopup';
import { TtsFactory } from '../narration/TtsFactory';
import type { TtsBackend } from '../narration/TtsBackend.interface';
import { NarrationProjection } from '../narration/NarrationProjection';
import { dirname, join } from 'node:path';
import type { ApplicationContributor } from './ApplicationContributor.interface';
import { StatusProjectionContributions } from './StatusProjectionContributions';
import { EditorSurfaceContents } from '../ui/EditorSurfaceContents';
import { StatusBarSegments } from '../ui/StatusBarSegments';
import { CoreStatusBarSegments } from '../ui/CoreStatusBarSegments';
import { ApplicationContributions } from './ApplicationContributions';
import { CodexRewriteProvider } from '../lsp/CodexRewriteProvider';

class $Bootstrap {
  static async boot(options: BootOptions = {}): Promise<BootedApp> {
    Logging.Class.info('Boot start');

    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      targetFps: 30,
      useMouse: true,
      enableMouseMovement: true, // hover highlighting (over/out/move)
      // Kitty keyboard protocol where available: super-modifier fidelity for the mac overlay
      // (Cmd chords); legacy terminals silently stay at base fidelity.
      useKittyKeyboard: {},
    });

    Kernel.Class.instance.seal();
    Kernel.Class.instance.assertSealed();

    const app = new App.Class();
    app.attach(renderer);
    // OpenTUI owns stdout and may flush frames from a native render thread. Its OSC 52 writer shares
    // that serialization authority, so clipboard bytes can only land between complete frame writes.
    // The higher-level copy helper is capability-gated and rejects terminals that accept OSC 52 but do
    // not advertise it (including the user-verified host), so use the renderer's raw serialized writer.
    // invariant: Clipboard emissions flush at frame boundaries (src/modules/system/system.invariants.md)
    const disposeClipboardEmitter = Clipboard.Class.setOsc52Emitter(
      (sequence) =>
        (
          renderer as unknown as {
            writeOut(outputSequence: string): boolean;
          }
        ).writeOut(sequence),
    );
    app.onDispose(disposeClipboardEmitter);

    const theme = new Theme.Class();
    const commands = new CommandRegistry.Class();

    // Reactive settings store (item G): load user + project settings; changes live-apply + persist.
    const settings = new Settings.Class();
    settings.load({ workspaceRoot: options.root ?? Environment.Class.cwd });
    const inlineRewriteEnabled = settings.registerSetting({
      identifier: 'inlineRewrite.enabled',
      label: 'Enabled',
      section: 'Inline Rewrite',
      defaultValue: new CodexRewriteProvider.Class().available,
      spec: { kind: 'boolean' },
    });
    app.onDispose(() => inlineRewriteEnabled.dispose());
    let inlineRewriteOverlayOpen = (): boolean => true;
    const workspaceSet = new WorkspaceSet.Class(settings, {
      awaitNextViewPaint: () =>
        new Promise<void>((resolve) => {
          renderer.once('frame', () => resolve());
        }),
      inlineRewriteEnabled: inlineRewriteEnabled.value,
      inlineRewriteEligible: () => !inlineRewriteOverlayOpen(),
    });
    workspaceSet.open(options.root ?? Environment.Class.cwd);
    const keybindings = new KeybindingRegistry.Class();
    keybindings.registerGuard(
      'editorHasSelection',
      () => workspaceSet.active.editor.cursor.hasSelection,
    );
    keybindings.registerGuard(
      'inlineRewriteVisible',
      () => workspaceSet.active.editor.inlineRewrite.visible,
    );
    keybindings.registerLayer(
      'canonical',
      KeybindingDefaults.Class.canonicalBindings,
    );
    keybindings.registerLayer('mac', KeybindingMac.Class.overlayBindings);
    const bufferTabStrip = new TabStrip.Class('horizontal', () =>
      workspaceSet.active.buffers.tabs().map((bufferTab) => ({
        identifier: bufferTab.path,
        label: Files.Class.basename(bufferTab.path),
        active: bufferTab.active,
        dirty: bufferTab.dirty,
        closable: true,
      })),
    );
    const workspaceTabStrip = new TabStrip.Class(
      settings.workspaceTabPosition.value === 'left'
        ? 'vertical'
        : 'horizontal',
      () =>
        workspaceSet.tabs().map((workspaceTab) => ({
          identifier: workspaceTab.root,
          label: workspaceTab.name,
          detailLabel: workspaceTab.detail,
          active: workspaceTab.active,
          closable: workspaceSet.count > 1,
        })),
    );

    // App-level overlay view models (the view projects them; input routes through here).
    const contextMenu = new ContextMenu.Class();
    const scrollPhysics = new ScrollPhysics.Class();
    const boundedListPopup = new BoundedListPopup.Class({
      renderer,
      settings,
      theme,
      scrollPhysics,
    });
    const completionPopup = new CompletionPopup.Class({
      renderer,
      settings,
      theme,
      scrollPhysics,
    });
    const agentSkillPopup = new AgentSkillPopup.Class({
      renderer,
      settings,
      theme,
      scrollPhysics,
    });
    let completionRequestGeneration = 0;
    const dismissCompletion = (): void => {
      completionRequestGeneration++;
      completionPopup.close();
      // A completion request can open while the renderer still has that frame queued. OpenTUI
      // coalesces another request made in the same input turn, so retry on the next turn after the
      // popup's paint revision has republished the closed semantic state.
      setTimeout(() => renderer.requestRender(), 0);
    };
    const tooltip = new Tooltip.Class();
    const settingsPanel = new SettingsPanel.Class(settings);
    const findBar = new FindBar.Class();
    const quickOpen = new QuickOpen.Class();
    const shortcutHelp = new ShortcutHelp.Class(keybindings, commands);
    // The bottom panel slot: a generic, content-agnostic host. Tier S registers ONE PaneContent (the
    // terminal), lazily on first toggle so no shell spawns until the panel is opened.
    // invariant: Panel content order is one persisted sequence (src/modules/ui/ui.invariants.md)
    let handlePanelContentRemoved: (content: PaneContent) => void = () => {};
    const panelHost = new PanelHost.Class({
      contentOrder: settings.panelContentOrder,
      persistContentOrder: () => settings.save(),
      onContentRemoved: (content) => handlePanelContentRemoved(content),
    });
    const primaryDockHost = new PanelHost.Class();
    const rightDockHost = new PanelHost.Class({
      showWhenContentRegistered: true,
    });

    const overlayCoordinator = new OverlayCoordinator.Class({
      findBar: () => findBar.close(),
      quickOpen: () => quickOpen.close(),
      commandPalette: () => commands.closePalette(),
      settingsPanel: () => settingsPanel.close(),
      contextMenu: () => contextMenu.close(),
      boundedListPopup: () => boundedListPopup.close(),
      completionPopup: dismissCompletion,
      shortcutHelp: () => shortcutHelp.close(),
    });
    const statusBarSegments = new StatusBarSegments.Class();
    const statusProjectionContributions =
      new StatusProjectionContributions.Class();
    // Contributed occupants of the editor column register here. Created BEFORE plugin activation
    // (which runs before buildRootView), so a provider registers early and its content is built
    // lazily at mount time from a view-supplied context.
    const editorSurfaceContents = new EditorSurfaceContents.Class();
    const pluginPrimaryDockContentIdentifiers = (options.plugins ?? []).flatMap(
      (plugin) => plugin.primaryDockContentIdentifiers ?? [],
    );
    const applicationContributions = new ApplicationContributions.Class(
      options.plugins ?? [],
      {
        renderer,
        workspaceSet,
        settings,
        theme,
        commands,
        keybindings,
        primaryDockHost,
        contextMenu,
        boundedListPopup,
        overlayCoordinator,
        statusBarSegments,
        statusProjectionContributions,
        editorSurfaceContents,
        requestRender: () => renderer.requestRender(),
      },
    );
    applicationContributions.activateAll();
    app.onDispose(() => applicationContributions.dispose());
    const primaryDockFallbackContentIdentifier = (options.plugins ?? []).find(
      (plugin) => plugin.primaryDockFallbackContentIdentifier !== undefined,
    )?.primaryDockFallbackContentIdentifier;
    if (
      primaryDockFallbackContentIdentifier &&
      primaryDockHost.has(primaryDockFallbackContentIdentifier)
    ) {
      primaryDockHost.showContent(primaryDockFallbackContentIdentifier);
    }
    statusBarSegments.register(CoreStatusBarSegments.Class);
    let panelAddPopup: PanelAddPopup.Instance | null = null;

    // The ONE terminal-region action, shared by the panel.toggleTerminal chords (Ctrl+J / Ctrl+backtick)
    // AND the status-bar terminal button. Opening it beside an existing agent region creates the
    // visible split; closing it leaves the agent region intact.
    const toggleTerminal = (): void => {
      agentSkillPopup.close();
      primaryDockHost.blur();
      rightDockHost.blur();
      const visibleTerminal = panelHost.visibleContentOfKind('terminal');
      if (visibleTerminal) panelHost.toggleContent(visibleTerminal.id);
      else panelHost.showContent(ensureTerminal().id);
    };

    // The native agent pane owns its own headed region in the bottom-panel layout. Opening it while the
    // terminal is visible places both regions side by side; closing it leaves the terminal untouched.
    const toggleAgent = (): void => {
      agentSkillPopup.close();
      primaryDockHost.blur();
      rightDockHost.blur();
      const visibleAgent = panelHost.visibleContentOfKind('agent');
      if (visibleAgent) panelHost.toggleContent(visibleAgent.id);
      else panelHost.showContent(ensureAgent().id);
    };
    const toggleRightDock = (): void => {
      agentSkillPopup.close();
      // invariant: Right dock command and mouse affordance share one toggle (src/modules/ui/ui.invariants.md)
      rightDockHost.toggle();
      if (rightDockHost.visible.value) panelHost.blur();
    };

    // Reveal through the bound pane target: the source editor and every contributed surface's panes keep their own
    // scroll/selection writer while FindBar retains independent engines for all of them.
    const revealFindMatch = (): void => {
      const match = findBar.engine?.currentMatch;
      if (!match || !findBar.target) return;
      findBar.target.revealMatch(match);
    };

    // Quick-open activation — the SINGLE path shared by the Enter key and a mouse click on a result row,
    // so the two can never diverge. Files mode opens the selected file; the path-navigator opens the
    // CURRENT input path as a workspace (folder rows are drilled into by a click, not opened here).
    const activateQuickOpenSelection = (): void => {
      const path = quickOpen.activate(); // files: a project-ROOT-relative path; workspacePath: an absolute path
      if (quickOpen.mode.value === 'workspacePath') {
        if (!path || !Files.Class.isDir(path)) {
          quickOpen.setError('Enter an existing folder path');
          return;
        }
        quickOpen.close();
        workspaceSet.open(path);
      } else {
        quickOpen.close();
        // Resolve against the workspace root — openFileInTab (like the tree) reads an ABSOLUTE path.
        if (path)
          workspaceSet.active.openFileInTab(
            Files.Class.join(workspaceSet.active.root, path),
          );
      }
    };

    const view = RootView.Class.buildRootView(
      renderer,
      workspaceSet,
      bufferTabStrip,
      workspaceTabStrip,
      theme,
      keybindings,
      commands,
      app,
      contextMenu,
      boundedListPopup,
      tooltip,
      settingsPanel,
      findBar,
      quickOpen,
      shortcutHelp,
      overlayCoordinator,
      panelHost,
      primaryDockHost,
      rightDockHost,
      statusBarSegments,
      editorSurfaceContents,
      toggleTerminal,
      toggleAgent,
      (anchor) => panelAddPopup?.show(anchor),
      toggleRightDock,
      activateQuickOpenSelection,
      revealFindMatch,
    );
    inlineRewriteOverlayOpen = () =>
      view.modalOverlayOwnsScreen() || completionPopup.open;

    // Lazily create + register the terminal PaneContent on first toggle (idle cost is zero until then).
    // The initial cols×rows seed from the laid-out panel region; the frame loop converges the true size.
    const terminalPaneContents = new Map<string, TerminalPaneContent.Model>();
    const agentPaneContents = new Map<string, AgentPaneContent.Model>();
    let terminalInstanceCount = 0;
    let agentInstanceCount = 0;
    let terminalPaneContent: TerminalPaneContent.Model | null = null;
    let agentPaneContent: AgentPaneContent.Model | null = null;
    const currentTerminalPane = (): TerminalPaneContent.Model | null => {
      const visibleContent = panelHost.visibleContentOfKind('terminal');
      return visibleContent instanceof TerminalPaneContent.Class
        ? visibleContent
        : terminalPaneContent;
    };
    const currentAgentPane = (): AgentPaneContent.Model | null => {
      const visibleContent = panelHost.visibleContentOfKind('agent');
      return visibleContent instanceof AgentPaneContent.Class
        ? visibleContent
        : agentPaneContent;
    };
    const synchronizeAgentSkillPopup = (
      pane: AgentPaneContent.Model | null = panelHost.focusedContent instanceof
      AgentPaneContent.Class
        ? panelHost.focusedContent
        : null,
    ): void => {
      if (!pane || !panelHost.visible.value || !panelHost.focused.value) {
        agentSkillPopup.close();
        return;
      }
      agentSkillPopup.synchronize(
        pane.id,
        pane.agentSession.workspaceDirectory,
        pane.skillInvocation(),
        view.focusedPanelCaretAnchor(),
        (invocation, skillName) =>
          pane.acceptSkillInvocation(invocation, skillName),
      );
    };
    let terminalFollowController: AgentTerminalFollow.Model | null = null;
    const cycleTerminalFollowMode = (): void => {
      settings.agentTerminalFollowMode.value =
        AgentTerminalFollow.Class.nextMode(
          settings.agentTerminalFollowMode.value,
        );
      settings.save();
    };
    const terminalFollowPort = {
      mode: settings.agentTerminalFollowMode,
      label: () =>
        AgentTerminalFollow.Class.labelFor(
          settings.agentTerminalFollowMode.value,
        ),
      cycle: () => {
        cycleTerminalFollowMode();
        return settings.agentTerminalFollowMode.value;
      },
    };
    const connectTerminalFollow = (): void => {
      if (
        terminalFollowController ||
        !terminalPaneContent ||
        !agentPaneContent
      ) {
        return;
      }
      terminalFollowController = new AgentTerminalFollow.Class(
        agentPaneContent.agentSession,
        terminalPaneContent,
        settings.agentTerminalFollowMode,
        () => settings.save(),
      );
    };
    const terminalCommandEventText = (event: TerminalCommandEvent): string => {
      switch (event.kind) {
        case 'pending':
          return `terminal command pending at ${event.currentWorkingDirectory || 'unknown cwd'} — waiting for an idle prompt: ${event.command}`;
        case 'staged':
          return `terminal command staged at ${event.currentWorkingDirectory || 'unknown cwd'} — edit it, press Enter to execute, or Ctrl+C to reject: ${event.command}`;
        case 'replaced-then-staged':
          return `terminal command replaced-then-staged at ${event.currentWorkingDirectory || 'unknown cwd'}\n- ${event.replacedCommand}\n+ ${event.command}`;
        case 'user-executed':
          return `terminal command user-executed: ${event.command}`;
        case 'user-edited-then-executed':
          return `terminal command user-edited-then-executed\n- ${event.command}\n+ ${event.executedCommand}`;
        case 'agent-executed':
          return `terminal command agent-executed at ${event.currentWorkingDirectory || 'unknown cwd'}: ${event.command}`;
        case 'aborted':
          return `terminal command staging aborted by user input before execution: ${event.command}`;
        case 'rejected':
          return `terminal command rejected with Ctrl+C: ${event.command}`;
      }
    };
    const createTerminal = (
      additionalInstance = false,
    ): TerminalPaneContent.Model => {
      const instanceNumber =
        additionalInstance || terminalPaneContents.size > 0
          ? terminalInstanceCount + 1
          : 1;
      terminalInstanceCount = Math.max(terminalInstanceCount, instanceNumber);
      const identifier =
        instanceNumber === 1 ? 'terminal' : `terminal-${instanceNumber}`;
      const label =
        instanceNumber === 1 ? 'Terminal' : `Terminal ${instanceNumber}`;
      const content = TerminalFactory.Class.create({
        identifier,
        label,
        columns: view.panelViewportColumns() || 80,
        rows: view.panelViewportRows() || 24,
        cwd: workspaceSet.active.root,
        cleanPrompt: settings.terminalCleanPrompt.value,
        promptColor: theme.palette.terminalPrompt,
        typingSpeed: () => settings.agentTypingSpeed.value,
        reducedMotion: () => settings.reducedMotion.value,
      });
      terminalPaneContents.set(content.id, content);
      terminalPaneContent ??= content;
      content.onTerminalCommandEvent((event) => {
        currentAgentPane()?.agentSession.appendSystemNote(
          terminalCommandEventText(event),
        );
      });
      panelHost.register(content);
      connectTerminalFollow();
      return content;
    };
    const ensureTerminal = (): TerminalPaneContent.Model =>
      terminalPaneContent ?? createTerminal();

    // The native agent pane — a second PaneContent with its OWN headed region in the bottom layout,
    // registered lazily on first toggle (idle cost zero). The host still supplies the shared layout and
    // splitter primitives, while terminal and agent identity remain separate.
    // The audio narration projection over the agent transcript (the third projection: text→pane,
    // visual→decorations, audio→speech). Created alongside the agent pane so it subscribes to the SAME
    // AgentSession; null until the agent pane is ensured. Barge-in + dispose route through it.
    let narration: NarrationProjection.Instance | null = null;
    const narrationsByAgentIdentifier = new Map<
      string,
      NarrationProjection.Instance
    >();
    const currentNarration = (): NarrationProjection.Instance | null => {
      const agentPane = currentAgentPane();
      return agentPane
        ? (narrationsByAgentIdentifier.get(agentPane.id) ?? narration)
        : narration;
    };
    // The agent pane instance once ensured — the frame dump reads its view state (scroll/collapse) so the
    // driving smoke asserts the UX without pane-scraping. Null until the pane is first toggled.
    // ONE transcript-search action, shared by Ctrl+F and the pane's clickable search icon. Overlay
    // exclusivity stays host-owned; the pane only invokes this port.
    const openAgentTranscriptSearch = (): void => {
      agentSkillPopup.close();
      const targetAgent = currentAgentPane();
      if (!targetAgent) return;
      const transcriptFindTarget = targetAgent.findTarget();
      overlayCoordinator.openExclusiveOverlay('findBar', () =>
        findBar.openForTarget(transcriptFindTarget, 'find'),
      );
      revealFindMatch();
    };
    const agentTranscriptSearchPort: AgentTranscriptSearchPort = {
      findBar,
      open: openAgentTranscriptSearch,
    };
    // A one-shot TTS backend for the "Narration: Test Voice" audition — recreated per test in the current
    // selected voice; the previous one is disposed so repeated tests never pile up. Under
    // INVAR_TTS_BACKEND=mock (the gate) this is silent.
    let testVoiceBackend: TtsBackend | null = null;
    const testNarrationVoice = (): void => {
      testVoiceBackend?.dispose();
      testVoiceBackend = TtsFactory.Class.createBackend({
        voice: settings.agentNarrationVoice.value,
        rate: settings.agentNarrationRate.value,
      });
      testVoiceBackend.speak(
        'Narration voice test — the quick brown fox jumps over the lazy dog.',
      );
    };

    const prepareTerminalForAgentCommand = (): TerminalPaneContent.Model => {
      const terminalPane = currentTerminalPane() ?? ensureTerminal();
      panelHost.showContent(terminalPane.id);
      const terminalIndex = panelHost.resolvedCells.findIndex(
        (cell) => cell.content.id === terminalPane.id,
      );
      if (terminalIndex >= 0) panelHost.focusCell(terminalIndex);
      return terminalPane;
    };
    const terminalToolPort: AgentTerminalToolPort = {
      readTerminalInput: () =>
        (currentTerminalPane() ?? ensureTerminal()).readTerminalInput(),
      readTerminalScrollback: (request) =>
        (currentTerminalPane() ?? ensureTerminal()).readTerminalScrollback(
          request,
        ),
      stageTerminalCommand: (command) =>
        prepareTerminalForAgentCommand().stageTerminalCommand(command),
      replaceTerminalInput: (command) =>
        prepareTerminalForAgentCommand().replaceTerminalInput(command),
      runTerminalCommand: (command) =>
        prepareTerminalForAgentCommand().runTerminalCommand(command),
    };

    // --- Live engine switcher (claude ⇄ codex) --------------------------------------------------------
    // ONE provider authority: label, availability, cycling, and construction all read the SAME
    // AgentProviderRegistry resolution, so the mode line can never claim an engine the factory didn't
    // build (the reviewed dual-authority bug: configured codex with codex missing labeled "codex" while
    // claude silently ran; with neither installed it labeled "claude" while the echo ran).
    // Swap the backend behind the SAME AgentSession (transcript preserved), then write the setting back.
    const cycleEngine = (pane: AgentPaneContent.Model): boolean => {
      const current = pane.agentSession.activeEngine;
      const next = AgentProviderRegistry.Class.nextEngine(current);
      if (!next) return false;
      const nextBackend = AgentFactory.Class.createBackend({
        cwd: workspaceSet.active.root,
        provider: next === 'echo' ? 'auto' : next,
        skipPermissions: () => settings.agentSkipPermissions.value,
        model: settings.agentModel.value,
        terminalTools: terminalToolPort,
      });
      if (pane.agentSession.swapBackend(nextBackend, next)) {
        if (next !== 'echo') settings.agentProvider.value = next;
        settings.save(); // persist the write-back (a bare ref write live-applies but does not persist)
        return true;
      }
      nextBackend.dispose(); // swap refused (busy) — don't leak the backend we built
      return false;
    };

    const createAgent = (
      additionalInstance = false,
    ): AgentPaneContent.Model => {
      const instanceNumber =
        additionalInstance || agentPaneContents.size > 0
          ? agentInstanceCount + 1
          : 1;
      agentInstanceCount = Math.max(agentInstanceCount, instanceNumber);
      const identifier =
        instanceNumber === 1 ? 'agent' : `agent-${instanceNumber}`;
      const label = instanceNumber === 1 ? 'Agent' : `Agent ${instanceNumber}`;
      // Real Claude (when `claude` is on PATH) runs in the workspace root so it operates in the project.
      const agentPane = AgentFactory.Class.create({
        identifier,
        label,
        cwd: workspaceSet.active.root,
        provider: settings.agentProvider.value,
        skipPermissions: () => settings.agentSkipPermissions.value, // LIVE getter — Shift+Tab toggle applies next turn
        model: settings.agentModel.value,
        terminalTools: terminalToolPort,
      });
      panelHost.register(agentPane);
      if (agentPane instanceof AgentPaneContent.Class) {
        agentPaneContents.set(agentPane.id, agentPane);
        agentPaneContent ??= agentPane;
        agentPane.attachPermissionMode(settings.agentSkipPermissions); // mode line + Shift+Tab toggle
        const enginePort: AgentEnginePort = {
          get provider() {
            return agentPane.agentSession.activeEngine;
          },
          get canCycle() {
            return AgentProviderRegistry.Class.availableEngines().length >= 2;
          },
          cycle: () => cycleEngine(agentPane),
        };
        agentPane.attachEnginePort(enginePort); // mode-line engine segment + click/Ctrl+E cycle
        agentPane.attachTerminalFollowPort(terminalFollowPort);
        agentPane.attachTranscriptSearchPort(agentTranscriptSearchPort); // icon + Ctrl+F share ONE action
        const agentNarration = new NarrationProjection.Class(
          agentPane.agentSession,
          settings.agentAudioNarration,
          // LIVE voice + rate: read per utterance so changing them in settings applies to ongoing narration
          // without recreating the backend or restarting.
          TtsFactory.Class.createBackend({
            voiceProvider: () => settings.agentNarrationVoice.value,
            rateProvider: () => settings.agentNarrationRate.value,
          }),
        );
        narrationsByAgentIdentifier.set(agentPane.id, agentNarration);
        narration ??= agentNarration;
        connectTerminalFollow();
      }
      return agentPane;
    };
    const ensureAgent = (): AgentPaneContent.Model =>
      agentPaneContent ?? createAgent();
    handlePanelContentRemoved = (content): void => {
      if (content instanceof TerminalPaneContent.Class) {
        terminalPaneContents.delete(content.id);
        terminalPaneContent =
          terminalPaneContents.values().next().value ?? null;
      }
      if (content instanceof AgentPaneContent.Class) {
        agentPaneContents.delete(content.id);
        const removedNarration = narrationsByAgentIdentifier.get(content.id);
        removedNarration?.dispose();
        narrationsByAgentIdentifier.delete(content.id);
        agentPaneContent = agentPaneContents.values().next().value ?? null;
        narration = narrationsByAgentIdentifier.values().next().value ?? null;
      }
      terminalFollowController?.dispose();
      terminalFollowController = null;
      connectTerminalFollow();
    };
    const addPanelContent = (kind: PanelContentKind): void => {
      primaryDockHost.blur();
      rightDockHost.blur();
      const content =
        kind === 'terminal' ? createTerminal(true) : createAgent(true);
      panelHost.showContent(content.id);
    };
    panelAddPopup = new PanelAddPopup.Class({
      popup: boundedListPopup,
      overlayCoordinator,
      addContent: addPanelContent,
    });
    app.onDispose(() => {
      testVoiceBackend?.dispose();
      terminalFollowController?.dispose();
      terminalFollowController = null;
      panelHost.dispose();
      primaryDockHost.dispose();
      rightDockHost.dispose();
    });

    // Ctrl+Shift+S is the accelerator for the same visible action as opening the second status-bar content item:
    // add the missing terminal/agent region beside the current one, or collapse a split back to the
    // focused region.
    const togglePanelSplit = (): void => {
      const terminal = ensureTerminal();
      const agent = ensureAgent();
      if (panelHost.isSplit) {
        panelHost.unsplit();
        return;
      }
      if (!panelHost.visible.value) panelHost.show();
      panelHost.split([agent.id, terminal.id]);
    };
    const focusPanelContent = (direction: -1 | 1): void => {
      const contentCount = panelHost.resolvedCells.length;
      if (contentCount < 2) return;
      const nextIndex =
        (panelHost.focusedIndex.value + direction + contentCount) %
        contentCount;
      panelHost.focusCell(nextIndex);
    };
    const movePanelContent = (direction: -1 | 1): void => {
      const identifier = panelHost.focusedContent?.id;
      if (identifier) panelHost.moveOpenContent(identifier, direction);
    };
    const closeActivePanelContent = (): void => {
      const identifier = panelHost.focusedContent?.id;
      if (identifier) panelHost.closeOpenContent(identifier);
    };

    // Theme + glyph mode are settings-driven (single source): the panel edits settings.theme /
    // settings.glyphMode, and these reactive hooks PUSH the change into the Theme so it live-applies with
    // no restart. GOTCHA reconciled here: the panel's theme option strings ('dark'/'light') are NOT the
    // palette keys ('invar-dark'/'invar-light') — map explicitly, never by string concat.
    const THEME_OPTION_TO_PALETTE_KEY: Record<string, string> = {
      dark: 'invar-dark',
      light: 'invar-light',
    };
    app.$watchEffect(() => {
      const paletteKey =
        THEME_OPTION_TO_PALETTE_KEY[settings.theme.value] ??
        settings.theme.value;
      theme.setPalette(paletteKey);
    });
    app.$watchEffect(() => {
      const mode = settings.glyphMode.value;
      theme.setGlyphLevel(
        mode === 'auto' ? TerminalCapabilities.Class.detectGlyphLevel() : mode,
      );
    });
    app.$watch(
      () => settings.workspaceTabPosition.value,
      (position) =>
        workspaceTabStrip.setOrientation(
          position === 'left' ? 'vertical' : 'horizontal',
        ),
    );
    app.$watch(
      () => workspaceSet.activeWorkspaceIndex.value,
      () =>
        primaryDockHost.activate(
          workspaceSet.active.primaryPaneContentIdentifier.value,
        ),
    );
    app.$watch(
      () => workspaceSet.active.focus.value,
      (focus) => {
        if (focus === 'primaryPane') {
          const contentIdentifier =
            workspaceSet.active.primaryPaneContentIdentifier.value;
          if (contentIdentifier) {
            primaryDockHost.activate(contentIdentifier);
            primaryDockHost.focus();
          }
        } else {
          primaryDockHost.blur();
        }
      },
      // A sidebar click can synchronously focus its pane and then open a file, returning Workspace
      // focus to `editor` in the same input turn. The default queued watcher coalesces that
      // editor→primaryPane→editor round trip to "no change" and leaves PanelHost.focused stale, so
      // the dock steals the next context-bound key. Focus projection is ownership transfer, not
      // deferred enrichment: observe every transition before input routing can see split state.
      { flush: 'sync' },
    );
    // Word wrap toggling (command OR settings panel) switches viewport.scrollTop between LOGICAL-line and
    // VISUAL-row units. Re-anchoring on the cursor sets a valid scrollTop in the new units — no fragile
    // conversion — so the cursor stays on screen. This MUST be a TARGETED watch on settings.wordWrap, NOT
    // a $watchEffect: revealCursor() READS viewport.scrollTop, so a $watchEffect would re-run on EVERY
    // scroll and re-reveal the cursor — snapping a wheel-scroll back to the cursor's line (the "opening a
    // file, wheel does nothing / can't leave the top" bug: cursor at line 0 pinned the viewport at 0).
    app.$watch(
      () => settings.wordWrap.value,
      () => workspaceSet.active.editor.revealCursor(),
    );
    // Language-server document sync: every edit bumps document.revision; this targeted watch pushes
    // the new text as a revision-idempotent full-text didChange (LanguageClient skips versions it
    // already sent). A TARGETED watch, not a $watchEffect — the handler must depend on the revision
    // signal only, never on the other state syncActiveDocumentWithLanguageServer reads.
    app.$watch(
      () => {
        const editor = workspaceSet.active.editor;
        return editor.hasDocument.value ? editor.document.revision.value : -1;
      },
      () => workspaceSet.active.syncActiveDocumentWithLanguageServer(),
    );

    // Last mouse event seen (for the observability side channel — proves the mouse path is live).
    let lastMouse: AppStatusMouseEvent | null = null;
    const statusProjectionPorts: AppStatusProjectionPorts = {
      workspaceSet,
      settings,
      commands,
      findBar,
      quickOpen,
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
      pluginPrimaryDockContentIdentifiers,
      view,
      get mouse() {
        return lastMouse;
      },
      get narration() {
        return currentNarration();
      },
      get agentPaneContent() {
        return currentAgentPane();
      },
      get terminalPaneContent() {
        return currentTerminalPane();
      },
    };

    // Pull current state into the renderables and request a frame. READ-ONLY over model state
    // (no ref writes), so it is safe to run inside the reactive effect with no feedback loop.
    const paint = (): void => {
      view.update();
      boundedListPopup.update();
      completionPopup.update();
      agentSkillPopup.update();
      AppStatusProjection.Class.publish(statusProjectionPorts);
      renderer.requestRender();
    };

    // The editor viewport size derives from the rendered layout (non-reactive), so it is synced on
    // the external triggers (boot, resize) — NOT inside the frame effect, which would be a
    // projection→model write feeding the effect it observes.
    // invariant: Rendering is one coarse frame effect (app.invariants.md)
    const syncSize = (): void => {
      workspaceSet.active.editor.viewport.setSize(
        view.editorViewportWidth(),
        view.editorViewportHeight(),
      );
    };

    // The single coarse reactive frame effect: observe the load-bearing signals and repaint on ANY
    // change — keyboard input OR an async producer. This lets contributed state or an LSP
    // diagnostic repaint the screen without a keypress.
    // invariant: Rendering is one coarse frame effect (app.invariants.md)
    app.$watchEffect(() => {
      const editor = workspaceSet.active.editor;
      // The whole paint pass is exception-isolated: a throw while projecting model→renderables must
      // degrade this one frame (logged to file) and request a repaint, never wedge the demand-driven
      // loop. The signal reads stay first so reactive dependency tracking is unaffected by the guard.
      // invariant: The render loop never wedges (project.invariants.md)
      // Explicit subscriptions to the load-bearing signals (document.revision in particular is only
      // read indirectly by update(), so touch it here to guarantee content changes repaint).
      void editor.document.revision.value;
      void editor.cursor.line.value;
      void editor.cursor.col.value;
      void editor.cursor.anchor.value;
      void editor.viewport.scrollTop.value;
      void editor.viewport.scrollLeft.value;
      void editor.wordWrap.value;
      void editor.foldRevision.value;
      // Contributed editor surfaces subscribe their own paint signals.
      editorSurfaceContents.observePaintSignals();
      void settings.workspaceTabPosition.value;
      void workspaceSet.entries.value;
      void workspaceSet.activeWorkspaceIndex.value;
      void workspaceTabStrip.scrollOffset.value;
      void bufferTabStrip.scrollOffset.value;
      void workspaceSet.active.focus.value;
      // The breadcrumb's ‹ › history buttons re-colour (enabled/disabled) as the trail moves.
      void workspaceSet.active.navigationHistory.currentIndex.value;
      void workspaceSet.active.navigationHistory.entries.value;
      // Overlay models: the context menu and tooltip repaint on any of their display state.
      void contextMenu.open.value;
      void contextMenu.items.value;
      void contextMenu.anchorX.value;
      void contextMenu.anchorY.value;
      void contextMenu.hoveredIndex.value;
      void contextMenu.selectedIndex.value;
      void boundedListPopup.open.value;
      void boundedListPopup.items.value;
      void boundedListPopup.query.value;
      void boundedListPopup.selectedIndex.value;
      void boundedListPopup.hoveredIndex.value;
      void boundedListPopup.paintRevision.value;
      void completionPopup.paintRevision.value;
      void agentSkillPopup.paintRevision.value;
      void tooltip.visible.value;
      void tooltip.text.value;
      void tooltip.anchorX.value;
      void tooltip.anchorY.value;
      view.observeHoverRepaint(); // the LSP hover card projects on its reactive paint signal (async landing)
      void commands.open.value;
      void commands.query.value;
      void commands.queryInput.caret.value;
      void quickOpen.open.value; // repaint the quick-open modal on open/query/selection/hover change
      void quickOpen.query.value;
      void quickOpen.queryInput.caret.value;
      void quickOpen.selectedIndex.value;
      void quickOpen.hoveredIndex.value;
      void quickOpen.workspacePathOpenable.value; // repaint the path-alert glyph live as the path changes
      void findBar.open.value;
      void findBar.engine?.query.value;
      void findBar.focusedInput?.caret.value;
      void findBar.engine?.matches.value;
      void findBar.engine?.currentMatchIndex.value; // repaint the match counter on next/prev
      void findBar.caseSensitive; // repaint the case toggle on flip
      void shortcutHelp.open.value; // repaint the cheat-sheet on open/close and scroll
      void shortcutHelp.scrollTop.value;
      void commands.selectedIndex.value;
      void theme.paletteName.value;
      void app.quitChordArmed.value;
      void app.copyNotice.value;
      // Bottom panel: repaint on visibility/focus/switch AND on the active content's paint signal, so
      // async terminal output (PTY bytes) repaints without a keypress (idle shell bumps nothing → the
      // demand-driven loop stays at rest).
      void panelHost.visible.value;
      void panelHost.focused.value;
      void panelHost.expanded.value;
      void panelHost.activeId.value;
      void panelHost.order.value;
      void panelHost.layout.value;
      void panelHost.focusedIndex.value;
      // Repaint on ANY visible cell's paint signal — a split panel has two live panes, either of which
      // can emit async output (PTY bytes) that must repaint without a keypress.
      for (const content of panelHost.visibleContents())
        void content.renderRevision.value;
      void primaryDockHost.visible.value;
      void primaryDockHost.focused.value;
      void primaryDockHost.activeId.value;
      for (const content of primaryDockHost.visibleContents()) {
        void content.renderRevision.value;
      }
      void rightDockHost.visible.value;
      void rightDockHost.focused.value;
      void rightDockHost.activeId.value;
      void rightDockHost.order.value;
      for (const content of rightDockHost.visibleContents()) {
        void content.renderRevision.value;
      }
      HandlerGuard.Class.run('paint', paint, () => renderer.requestRender());
    });

    // Frame-settle signal for the tmux harness (a frame actually rendered).
    const framePath =
      process.env.TUI_FRAME_PATH ||
      join(
        dirname(StatusChannel.Class.path),
        StatusChannel.Class.path.split('/').pop()!.replace('status', 'frame'),
      );
    let frame = 0;
    // Smooth-scroll animation clock. dt is clamped so a resume from idle (a "paused clock") advances
    // one frame's worth, not the whole idle gap — the paused-clock invariant.
    let lastFrameMilliseconds = 0;
    const MAXIMUM_DELTA_TIME_SECONDS = 0.1; // seconds
    // Animation liveness: while ANY animation runs (any pane's wheel-momentum glide, drag-edge
    // auto-scroll, tooltip dwell) we hold ONE live request so the render loop runs; at quiescence we
    // drop it and the loop STOPS (frames and status writes cease — 'idle CPU above ~zero is forbidden').
    let liveAnimationHeld = false;
    // Last panel geometry pushed to the terminal — so the resize ioctl fires only on a real change.
    // The panel converge signature: total rows + each cell's id=width. Keyed on the LAYOUT, not just the
    // total width, so splitting/un-splitting/dragging the divider (which redistributes the SAME total
    // width across cells) re-fires setViewportSize — otherwise a cell's child (a real terminal) keeps its
    // pre-split full width because the panel's outer width never changed.
    let lastPanelLayoutKey = '';
    let lastRightDockLayoutKey = '';
    const syncAnimationLiveness = (animating: boolean): void => {
      if (animating && !liveAnimationHeld) {
        renderer.requestLive();
        liveAnimationHeld = true;
      } else if (!animating && liveAnimationHeld) {
        renderer.dropLive();
        liveAnimationHeld = false;
        lastFrameMilliseconds = 0; // paused-clock: the next animation's first frame gets a fresh dt
      }
    };
    const frameTick = (): void => {
      frame += 1;
      // Drive every pane glide: step all momentum by real dt; the live request keeps frames coming
      // while anything moves (including frames that advance 0 whole rows).
      const nowMilliseconds = performance.now();
      const deltaTimeSeconds =
        lastFrameMilliseconds === 0
          ? 1 / 30
          : Math.min(
              MAXIMUM_DELTA_TIME_SECONDS,
              (nowMilliseconds - lastFrameMilliseconds) / 1000,
            );
      lastFrameMilliseconds = nowMilliseconds;
      let animating = false;
      // All pane wheel-momentum regimes step here and each
      // settles to EXACTLY zero, so `animating` returns to false at rest — quiescence preserved.
      const workspaceScrollMomentumIsActive =
        workspaceSet.active.tickScrollAnimations(deltaTimeSeconds);
      animating = workspaceScrollMomentumIsActive || animating;
      // invariant: Rendering is one coarse frame effect (app.invariants.md)
      StatusChannel.Class.update({
        workspaceScrollMomentumAtRest: !workspaceScrollMomentumIsActive,
      });
      // Drag-edge auto-scroll: while a selection drag holds at a pane edge, keep scrolling +
      // extending the selection.
      animating = view.tickDragAutoScroll(deltaTimeSeconds) || animating;
      // The mounted contributed surface advances its own glide + settle-repaint.
      animating = view.tickContributedSurface(deltaTimeSeconds) || animating;
      // Tooltip dwell: the frame tick advances the timer; it's just another animation source, so it
      // folds into the SAME single-live-request model (holds a frame while counting, false at rest).
      animating = tooltip.tick(deltaTimeSeconds) || animating;
      // The LSP hover-card dwell advances on the SAME frame tick (holds a frame while counting or while a
      // hover request is in flight, false once the card is shown or disarmed).
      animating = view.tickHover(deltaTimeSeconds) || animating;
      // The agent transcript's scroll-momentum glide + drag edge-autoscroll advance on the SAME tick and
      // settle to zero at rest (idle-quiescence preserved).
      const panelScrollMomentumIsActive =
        view.tickPanelScroll(deltaTimeSeconds);
      animating = panelScrollMomentumIsActive || animating;
      StatusChannel.Class.update({
        panelScrollMomentumAtRest: !panelScrollMomentumIsActive,
      });
      animating = boundedListPopup.tick(deltaTimeSeconds) || animating;
      animating = completionPopup.tick(deltaTimeSeconds) || animating;
      animating = agentSkillPopup.tick(deltaTimeSeconds) || animating;
      animating = view.tickOverlayScroll(deltaTimeSeconds) || animating;
      syncAnimationLiveness(animating);
      // Converge the viewport size with the LAID-OUT layout (gutter width changes when a file opens
      // or its line count crosses a digit boundary; boot/resize alone goes stale). Mutating outside
      // the reactive effect: the write triggers one repaint and converges — no feedback loop.
      const editorViewport = workspaceSet.active.editor.viewport;
      const laidOutWidth = view.editorViewportWidth();
      const laidOutHeight = view.editorViewportHeight();
      if (
        editorViewport.width.value !== laidOutWidth ||
        editorViewport.height.value !== laidOutHeight
      ) {
        editorViewport.setSize(laidOutWidth, laidOutHeight);
        renderer.requestRender(); // one-shot convergence (not an animation — no live request)
      }
      // Converge the terminal's cols×rows with the laid-out panel region (like the editor viewport):
      // resize the emulator + child ONLY on a real change, so the ioctl fires on split/window resize,
      // never per frame. Drives the child's SIGWINCH so `stty size` reflects the new geometry.
      if (panelHost.visible.value) {
        const panelColumns = view.panelViewportColumns();
        const panelRows = view.panelViewportRows();
        const layoutKey = `${panelRows}:${panelHost
          .cellSpans(panelColumns)
          .map((span) => `${span.content.id}=${span.columns}`)
          .join(',')}`;
        if (
          panelColumns > 0 &&
          panelRows > 0 &&
          layoutKey !== lastPanelLayoutKey
        ) {
          lastPanelLayoutKey = layoutKey;
          panelHost.setViewportSize(panelColumns, panelRows);
          renderer.requestRender();
        }
      }
      if (rightDockHost.visible.value) {
        const rightDockColumns = view.rightDockViewportColumns();
        const rightDockRows = view.rightDockViewportRows();
        const layoutKey = `${rightDockColumns}:${rightDockRows}:${rightDockHost.activeId.value ?? ''}`;
        if (
          rightDockColumns > 0 &&
          rightDockRows > 0 &&
          layoutKey !== lastRightDockLayoutKey
        ) {
          lastRightDockLayoutKey = layoutKey;
          rightDockHost.setViewportSize(rightDockColumns, rightDockRows);
          renderer.requestRender();
        }
      }
      StatusChannel.Class.settle(frame);
      // Exact per-cell visual snapshot for tests (env-gated; no-op otherwise).
      FrameProbe.Class.dump(renderer, framePath);
    };
    // A throw in a frame tick (animation step, layout convergence) must not stop the pump: isolate it
    // and keep the loop alive. invariant: The render loop never wedges (project.invariants.md)
    const onFrame = (): void => {
      HandlerGuard.Class.run('frame', frameTick, () =>
        renderer.requestRender(),
      );
    };
    renderer.on('frame', onFrame);
    app.onDispose(() => renderer.off('frame', onFrame));
    app.onDispose(() => workspaceSet.dispose()); // stop all working-tree watchers + dispose open buffers

    // Awaitable render for boot/resize/harness determinism: sync size, paint, wait one frame.
    const render = async (): Promise<void> => {
      syncSize();
      paint();
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          renderer.off('frame', finish);
          resolve();
        };
        renderer.once('frame', finish);
        renderer.requestRender();
        setTimeout(finish, 120);
      });
    };

    let shuttingDown = false;
    const shutdown = async (): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      Logging.Class.info('Shutdown start');
      app.$stopEffects(); // stop the frame effect FIRST — no repaint during teardown
      view.dispose();
      boundedListPopup.dispose();
      completionPopup.dispose();
      agentSkillPopup.dispose();
      app.dispose();
      options.onQuit?.();
    };

    CommandDefaults.Class.registerDefaultCommands(commands, {
      workspaceSet,
      theme,
      openWorkspaceFolder: () =>
        overlayCoordinator.openExclusiveOverlay('quickOpen', () =>
          quickOpen.showWorkspacePath(workspaceSet.active.root),
        ),
      quit: () => void shutdown(),
      requestRender: () => app.requestRender(),
      toggleActivityBar: () => {
        settings.showActivityBar.value = !settings.showActivityBar.value;
        app.requestRender();
      },
      toggleRightDock,
      toggleTerminal,
      toggleAgent,
      togglePanelSplit,
      focusPreviousPanelContent: () => focusPanelContent(-1),
      focusNextPanelContent: () => focusPanelContent(1),
      movePanelContentUp: () => movePanelContent(-1),
      movePanelContentDown: () => movePanelContent(1),
      closeActivePanelContent,
      cycleTerminalFollowMode,
      openShortcutHelp: () =>
        overlayCoordinator.openExclusiveOverlay('shortcutHelp', () =>
          shortcutHelp.show(),
        ),
      testNarrationVoice,
    });

    // --- input: handlers MUTATE model state only; the frame effect repaints. -----------------
    // Accelerated arrows: terminals report key REPEAT (not down/up), so ScrollPhysics infers the
    // shared run from direction and cadence for editor and list consumers.
    // invariant: Terminals report key repeat not key up (project.invariants.md)
    const movementAcceleration = (
      key: KeyEvent,
      movementScope: 'editor' | 'editorSurface',
    ): number =>
      scrollPhysics.keyAccelerationFor(`${movementScope}:${key.name}`);
    const isTypedCharacter = (key: KeyEvent): boolean => {
      if (key.ctrl || key.meta || key.option) return false;
      const sequence = key.sequence;
      if (!sequence || sequence.length !== 1) return false;
      const code = sequence.charCodeAt(0);
      return code >= 32 && code !== 127;
    };
    const completionPrefix = (): {
      text: string;
      range: {
        start: { line: number; column: number };
        end: { line: number; column: number };
      };
    } => {
      const editor = workspaceSet.active.editor;
      const line = editor.cursor.line.value;
      const endColumn = editor.cursor.col.value;
      const lineText = editor.document.line(line);
      const linePrefix = lineText.slice(
        0,
        EditorCoordinates.Class.graphemeToU16(lineText, endColumn),
      );
      const text = linePrefix.match(/[\p{L}\p{N}_$]+$/u)?.[0] ?? '';
      return {
        text,
        range: {
          start: {
            line,
            column: endColumn - EditorCoordinates.Class.graphemeCount(text),
          },
          end: { line, column: endColumn },
        },
      };
    };
    const requestCompletion = (
      triggerKind: 'invoked' | 'triggerCharacter',
      triggerCharacter?: string,
    ): void => {
      const editor = workspaceSet.active.editor;
      if (
        !editor.hasDocument.value ||
        workspaceSet.active.focus.value !== 'editor'
      )
        return;
      const document = editor.document;
      const path = document.path;
      const revision = document.revision.value;
      const position = {
        line: editor.cursor.line.value,
        column: editor.cursor.col.value,
      };
      const requestGeneration = ++completionRequestGeneration;
      void workspaceSet.active
        .completionAt(position, { triggerKind, triggerCharacter })
        .then((completionList) => {
          const activeEditor = workspaceSet.active.editor;
          if (
            requestGeneration !== completionRequestGeneration ||
            activeEditor.document !== document ||
            activeEditor.document.path !== path ||
            activeEditor.document.revision.value !== revision ||
            activeEditor.cursor.line.value !== position.line ||
            activeEditor.cursor.col.value !== position.column
          )
            return;
          const anchor = view.editorCaretAnchor();
          if (!anchor || completionList.items.length === 0) {
            dismissCompletion();
            return;
          }
          const prefix = completionPrefix();
          completionPopup.show(completionList, anchor, prefix.text, (item) => {
            const currentPrefix = completionPrefix();
            const originalTextEdit = item.textEdit;
            const itemTextEditMatchesOriginalPrefix =
              originalTextEdit !== null &&
              originalTextEdit.range.start.line === prefix.range.start.line &&
              originalTextEdit.range.start.column ===
                prefix.range.start.column &&
              originalTextEdit.range.end.line === prefix.range.end.line &&
              originalTextEdit.range.end.column === prefix.range.end.column;
            const acceptedItem =
              itemTextEditMatchesOriginalPrefix && originalTextEdit
                ? {
                    ...item,
                    textEdit: {
                      newText: originalTextEdit.newText,
                      range: {
                        start: originalTextEdit.range.start,
                        end: currentPrefix.range.end,
                      },
                    },
                  }
                : item;
            workspaceSet.active.editor.applyCompletion(
              acceptedItem,
              currentPrefix.range,
            );
          });
        });
    };

    // ---------------------------------------------------------------------------------------------
    // Keyboard: ONE decode layer (OpenTUI) -> registry resolution (pure data lookup) -> action
    // dispatch. No chord conditionals live here — bindings are data in keybindings.defaults/mac.
    // invariant: Bindings are intent addressed (src/modules/keybindings/keybindings.invariants.md)
    const applyTextInputAction = (action: TextInputAction): void => {
      // The bounded popup is modal and topmost, so its search field owns text input first.
      if (boundedListPopup.acceptsQueryInput) {
        boundedListPopup.applyQueryInputAction(action);
        return;
      }
      if (findBar.open.value) {
        findBar.applyInputAction(action);
        revealFindMatch();
        return;
      }
      if (quickOpen.open.value) {
        quickOpen.applyQueryInputAction(action);
        return;
      }
      if (commands.open.value) {
        commands.applyQueryInputAction(action);
        return;
      }
      const focusedContent = panelHost.focusedContent;
      if (focusedContent instanceof AgentPaneContent.Class) {
        focusedContent.applyComposerInputAction(action);
        synchronizeAgentSkillPopup(focusedContent);
      }
    };

    // The ACTION TABLE: every binding's action id -> its handler. Handlers receive the raw KeyEvent
    // for parameters that compose (shift = extend; repeat runs = acceleration).
    const actionHandlers: Record<string, (key: KeyEvent) => void> = {
      'app.quit': () => void shutdown(),
      'find.open': () => {
        const target = view.findTarget();
        if (!target) return;
        overlayCoordinator.openExclusiveOverlay('findBar', () =>
          findBar.openForTarget(target, 'find'),
        );
        revealFindMatch();
      },
      'find.replace': () => {
        const target = view.findTarget();
        if (!target) return;
        overlayCoordinator.openExclusiveOverlay('findBar', () =>
          findBar.openForTarget(target, 'replace'),
        );
        revealFindMatch();
      },
      'quickopen.open': () =>
        overlayCoordinator.openExclusiveOverlay(
          'quickOpen',
          () => void quickOpen.show(workspaceSet.active.root),
        ),
      'workspace.openFolder': () =>
        overlayCoordinator.openExclusiveOverlay('quickOpen', () =>
          quickOpen.showWorkspacePath(workspaceSet.active.root),
        ),
      'workspace.close': () => {
        agentSkillPopup.close();
        workspaceSet.closeActive();
      },
      'workspace.next': () => {
        agentSkillPopup.close();
        workspaceSet.cycle(1);
      },
      'workspace.previous': () => {
        agentSkillPopup.close();
        workspaceSet.cycle(-1);
      },
      'palette.open': () =>
        overlayCoordinator.openExclusiveOverlay('commandPalette', () =>
          commands.openPalette(),
        ),
      'palette.close': () => commands.closePalette(),
      'palette.run': () => commands.runSelected(),
      'palette.previous': () => commands.moveSelection(-1),
      'palette.next': () => commands.moveSelection(1),
      'textInput.moveLeft': () => applyTextInputAction('moveLeft'),
      'textInput.moveRight': () => applyTextInputAction('moveRight'),
      'textInput.moveWordLeft': () => applyTextInputAction('moveWordLeft'),
      'textInput.moveWordRight': () => applyTextInputAction('moveWordRight'),
      'textInput.moveHome': () => applyTextInputAction('moveHome'),
      'textInput.moveEnd': () => applyTextInputAction('moveEnd'),
      'textInput.backspace': () => applyTextInputAction('backspace'),
      'textInput.deleteForward': () => applyTextInputAction('deleteForward'),
      'textInput.deletePreviousWord': () =>
        applyTextInputAction('deletePreviousWord'),
      'textInput.deleteNextWord': () => applyTextInputAction('deleteNextWord'),
      'textInput.deleteLine': () => applyTextInputAction('deleteLine'),
      'find.toggleCaseSensitive': () => {
        findBar.toggleCaseSensitive();
        revealFindMatch();
      },
      'focus.toggle': () => workspaceSet.active.toggleFocus(),
      'settings.toggle': () => {
        if (settingsPanel.open.value) settingsPanel.close();
        else
          overlayCoordinator.openExclusiveOverlay('settingsPanel', () =>
            settingsPanel.toggle(),
          );
      },
      'settings.close': () => settingsPanel.close(),
      // The cheat-sheet: the same chord toggles; Esc closes; arrows/pages scroll the row window.
      // invariant: The shortcut sheet lists the effective bindings (src/modules/ui/ui.invariants.md)
      'help.shortcuts': () => {
        if (shortcutHelp.open.value) shortcutHelp.close();
        else
          overlayCoordinator.openExclusiveOverlay('shortcutHelp', () =>
            shortcutHelp.show(),
          );
      },
      'help.close': () => shortcutHelp.close(),
      'help.up': () => view.scrollShortcutHelpBy(-1),
      'help.down': () => view.scrollShortcutHelpBy(1),
      'help.pageUp': () =>
        view.scrollShortcutHelpBy(-view.shortcutHelpViewportRows()),
      'help.pageDown': () =>
        view.scrollShortcutHelpBy(view.shortcutHelpViewportRows()),
      'settings.up': () => settingsPanel.moveSelection(-1),
      'settings.down': () => settingsPanel.moveSelection(1),
      'settings.increase': () => settingsPanel.adjust(1),
      'settings.decrease': () => settingsPanel.adjust(-1),
      'buffer.close': () => workspaceSet.active.closeActiveTab(),
      'buffer.next': () => workspaceSet.active.cycleTab(1),
      'buffer.previous': () => workspaceSet.active.cycleTab(-1),
      // Ctrl+] parity with Ctrl/Cmd+click: definition of the symbol AT THE CURSOR.
      'go.definition': () => void workspaceSet.active.goToDefinition(),
      // Browser-style Go Back / Go Forward through the navigation trail (Alt+[ / Alt+]). Safe no-ops
      // at the ends of the history.
      'navigation.back': () => workspaceSet.active.navigateBack(),
      'navigation.forward': () => workspaceSet.active.navigateForward(),
      // Ctrl+Shift+B shows/hides the whole activity bar (same setting-flip the palette command runs).
      'view.toggleActivityBar': () => {
        settings.showActivityBar.value = !settings.showActivityBar.value;
        app.requestRender();
      },
      'view.toggleRightDock': toggleRightDock,
      // Movement arrives through the REBINDABLE command, not a raw-key intercept, so a remapped
      // chord still drives whichever surface owns the keyboard.
      'editor.moveUp': (key) => {
        if (!workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          view
            .contributedEditorSurface()
            ?.scrollFocusedPaneByRows(
              -movementAcceleration(key, 'editorSurface'),
            );
        else
          workspaceSet.active.editor.moveVertical(
            -movementAcceleration(key, 'editor'),
            key.shift,
          );
      },
      'editor.completion': () => requestCompletion('invoked'),
      'editor.moveDown': (key) => {
        if (!workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          view
            .contributedEditorSurface()
            ?.scrollFocusedPaneByRows(
              movementAcceleration(key, 'editorSurface'),
            );
        else
          workspaceSet.active.editor.moveVertical(
            movementAcceleration(key, 'editor'),
            key.shift,
          );
      },
      'editor.moveLeft': (key) => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget) {
          workspaceSet.active.editor.moveHorizontal(
            -movementAcceleration(key, 'editor'),
            key.shift,
          );
        }
      },
      'editor.moveRight': (key) => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget) {
          workspaceSet.active.editor.moveHorizontal(
            movementAcceleration(key, 'editor'),
            key.shift,
          );
        }
      },
      'editor.pageUp': (key) => {
        if (!workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          view.contributedEditorSurface()?.pageFocusedPane(-1);
        else workspaceSet.active.editor.pageUp(key.shift);
      },
      'editor.pageDown': (key) => {
        if (!workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          view.contributedEditorSurface()?.pageFocusedPane(1);
        else workspaceSet.active.editor.pageDown(key.shift);
      },
      'editor.lineStart': (key) => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspaceSet.active.editor.moveToLineStart(key.shift);
      },
      'editor.lineEnd': (key) => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspaceSet.active.editor.moveToLineEnd(key.shift);
      },
      'editor.jumpUp': (key) =>
        !workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget
          ? view
              .contributedEditorSurface()
              ?.scrollFocusedPaneByRows(
                -scrollPhysics.jumpRowsFor(`editorSurface:${key.name}`),
              )
          : workspaceSet.active.editor.moveVertical(
              -scrollPhysics.jumpRowsFor(`editor:${key.name}`),
              key.shift,
            ),
      'editor.jumpDown': (key) =>
        !workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget
          ? view
              .contributedEditorSurface()
              ?.scrollFocusedPaneByRows(
                scrollPhysics.jumpRowsFor(`editorSurface:${key.name}`),
              )
          : workspaceSet.active.editor.moveVertical(
              scrollPhysics.jumpRowsFor(`editor:${key.name}`),
              key.shift,
            ),
      'editor.wordLeft': (key) => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspaceSet.active.editor.moveWordHorizontal(-1, key.shift);
      },
      'editor.wordRight': (key) => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspaceSet.active.editor.moveWordHorizontal(1, key.shift);
      },
      'editor.documentStart': (key) => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspaceSet.active.editor.moveDocumentStart(key.shift);
      },
      'editor.documentEnd': (key) => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspaceSet.active.editor.moveDocumentEnd(key.shift);
      },
      'editor.newline': () => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspaceSet.active.editor.insertNewline();
      },
      'editor.backspace': () => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspaceSet.active.editor.backspace();
      },
      'editor.delete': () => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspaceSet.active.editor.deleteChar();
      },
      'editor.deleteToLineStart': () => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspaceSet.active.editor.deleteToLineStart();
      },
      'edit.deletePreviousWord': () => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          commands.run('edit.deletePreviousWord');
      },
      'editor.escape': () => {
        if (!workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          view.contributedEditorSurface()?.yieldKeyboardToSourceEditor();
        else if (workspaceSet.active.editor.hasSelection)
          workspaceSet.active.editor.cursor.clearSelection();
        else workspaceSet.active.focusPrimaryPane();
      },
      'editor.save': () => workspaceSet.active.saveActiveFile(),
      'editor.selectAll': () => {
        if (!workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          view.contributedEditorSurface()?.selectAllInFocusedPane();
        else workspaceSet.active.editor.selectAll();
      },
      'editor.copy': () => {
        // Publish how many characters landed on the clipboard — the observable proof that copy
        // actually copied (the human-QA "cannot copy" bug's verification channel).
        // An engaged hover card with a selection owns Ctrl+C — copy ITS text, not the editor's
        // beneath. Otherwise the mounted contributed surface is asked whether it owns a selection;
        // a null answer falls through to the source editor.
        const contributedSurfaceCopy =
          view.contributedEditorSurface()?.copySelection() ?? null;
        const copyPromise = view.hoverHasSelection()
          ? view.hoverCopySelection()
          : (contributedSurfaceCopy ??
            workspaceSet.active.editor.copySelection());
        void copyPromise.then((copiedCharacters) => {
          if (copiedCharacters > 0) {
            app.copyNotice.value = `Copied ${copiedCharacters} chars (${Clipboard.Class.lastBackend ?? 'no backend'})`;
          }
          StatusChannel.Class.update({
            lastCopyChars: copiedCharacters,
            lastCopyHash: Clipboard.Class.lastCopiedTextHash,
            clipboardBackend: Clipboard.Class.lastBackend,
          });
          StatusChannel.Class.flush();
        });
      },
      // The focused agent pane owns Ctrl+C / Cmd+C: copy its transcript OR composer selection (whichever is
      // set) to the clipboard, publishing the same character-count proof channel as editor.copy.
      'agent.copy': () => {
        const focusedContent = panelHost.focusedContent;
        const pane =
          focusedContent instanceof AgentPaneContent.Class
            ? focusedContent
            : currentAgentPane();
        if (!pane) return;
        void pane.copySelection().then((copiedCharacters) => {
          if (copiedCharacters > 0) {
            app.copyNotice.value = `Copied ${copiedCharacters} chars (${Clipboard.Class.lastBackend ?? 'no backend'})`;
          }
          StatusChannel.Class.update({
            lastCopyChars: copiedCharacters,
            lastCopyHash: Clipboard.Class.lastCopiedTextHash,
            clipboardBackend: Clipboard.Class.lastBackend,
          });
          StatusChannel.Class.flush();
        });
      },
      'agent.cancelTurn': () => {
        const focusedContent = panelHost.focusedContent;
        if (focusedContent instanceof AgentPaneContent.Class) {
          focusedContent.cancelTurn();
        }
      },
      'agent.cycleTerminalFollowMode': cycleTerminalFollowMode,
      'terminal.copy': () => {
        const focusedContent = panelHost.focusedContent;
        const pane =
          focusedContent instanceof TerminalPaneContent.Class
            ? focusedContent
            : currentTerminalPane();
        if (!pane) return;
        void pane.copySelection().then((copiedCharacters) => {
          if (copiedCharacters > 0) {
            app.copyNotice.value = `Copied ${copiedCharacters} chars (${Clipboard.Class.lastBackend ?? 'no backend'})`;
          }
          StatusChannel.Class.update({
            lastCopyChars: copiedCharacters,
            lastCopyHash: Clipboard.Class.lastCopiedTextHash,
            clipboardBackend: Clipboard.Class.lastBackend,
          });
          StatusChannel.Class.flush();
        });
      },
      'terminal.wordLeft': (key) => panelHost.handleKey(key),
      'terminal.wordRight': (key) => panelHost.handleKey(key),
      'terminal.deletePreviousWord': (key) => panelHost.handleKey(key),
      'editor.cut': () => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          void workspaceSet.active.editor.cutSelection();
      },
      'editor.paste': () => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          void workspaceSet.active.editor.pasteClipboard();
      },
      'editor.undo': () => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspaceSet.active.editor.performUndo();
      },
      'editor.redo': () => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspaceSet.active.editor.performRedo();
      },
      'editor.toggleWordWrap': () =>
        workspaceSet.active.editor.toggleWordWrap(),
      'editor.moveLineUp': () => workspaceSet.active.editor.moveLineUp(),
      'editor.moveLineDown': () => workspaceSet.active.editor.moveLineDown(),
      'editor.duplicateLine': () => workspaceSet.active.editor.duplicateLine(),
      'editor.indent': () => workspaceSet.active.editor.indent(),
      'editor.outdent': () => workspaceSet.active.editor.outdent(),
      'inlineRewrite.request': () => {
        dismissCompletion();
        workspaceSet.active.editor.requestInlineRewrite();
      },
      'inlineRewrite.accept': () =>
        workspaceSet.active.editor.acceptInlineRewrite(),
      'inlineRewrite.reject': () =>
        workspaceSet.active.editor.rejectInlineRewrite(),
      'inlineRewrite.next': () =>
        workspaceSet.active.editor.cycleInlineRewrite(1),
      'inlineRewrite.previous': () =>
        workspaceSet.active.editor.cycleInlineRewrite(-1),
      // Toggle the bottom panel (terminal). Reserved so it fires from ANY mode — including from within a
      // focused terminal (to hide it) — exactly like the quit escape hatch. Same closure the status-bar
      // terminal button runs, so chord and click are one action.
      'panel.toggleTerminal': toggleTerminal,
      'panel.toggleAgent': toggleAgent,
      'panel.toggleSplit': () => {
        agentSkillPopup.close();
        togglePanelSplit();
      },
      'panel.contentsPrevious': () => {
        agentSkillPopup.close();
        focusPanelContent(-1);
      },
      'panel.contentsNext': () => {
        agentSkillPopup.close();
        focusPanelContent(1);
      },
      'panel.contentsMoveUp': () => {
        agentSkillPopup.close();
        movePanelContent(-1);
      },
      'panel.contentsMoveDown': () => {
        agentSkillPopup.close();
        movePanelContent(1);
      },
      'panel.contentsClose': () => {
        agentSkillPopup.close();
        closeActivePanelContent();
      },
      'menu.previous': () => contextMenu.moveSelection(-1),
      'menu.next': () => contextMenu.moveSelection(1),
      'menu.run': () => contextMenu.runSelected(),
      'menu.close': () => contextMenu.close(),
      'listPopup.previous': () => boundedListPopup.moveSelection(-1),
      'listPopup.next': () => boundedListPopup.moveSelection(1),
      'listPopup.run': () => boundedListPopup.runSelected(),
      'listPopup.drill': () => boundedListPopup.drillSelected(),
      'listPopup.navigateBackward': () => boundedListPopup.navigateBackward(),
      'listPopup.close': () => boundedListPopup.close(),
      'listPopup.erase': () => boundedListPopup.eraseQueryCharacter(),
    };
    const dispatchAction = (action: string, key: KeyEvent): void => {
      const handler = actionHandlers[action];
      if (handler) handler(key);
      else commands.run(action);
    };

    const inputOverlayOpeningActionIdentifiers = new Set([
      'find.open',
      'find.replace',
      'quickopen.open',
      'workspace.openFolder',
      'palette.open',
      'settings.toggle',
      'help.shortcuts',
    ]);

    // The find/replace bar's key handling, shared VERBATIM by the two routes that reach it — the global
    // 'find' context (the source editor and every contributed surface's own targets) and the focused agent pane's interception
    // (the transcript target) — so transcript search speaks the ONE find vocabulary: type = live query,
    // Enter/Shift+Enter cycle + reveal, Tab switches field, Esc closes (returning keys to whatever owns
    // them beneath — the editor there, the agent composer here).
    const handleFindBarKey = (key: KeyEvent): void => {
      // Ctrl+H arrives as the ASCII Backspace control byte (0x08) — same normalization as the router.
      const rawControlH = key.name === 'backspace' && key.sequence === '\u0008';
      const normalizedChordEvent = {
        name: rawControlH ? 'h' : key.name,
        ctrl: rawControlH ? true : key.ctrl,
        shift: key.shift,
        option: key.option || key.meta,
        super: key.super,
      };
      const findResolution = keybindings.resolve(
        normalizedChordEvent,
        'find',
        Date.now(),
      );
      if (findResolution.action) {
        dispatchAction(findResolution.action, key);
        return;
      }
      if (key.name === 'escape') {
        findBar.close();
        return;
      }
      if (key.name === 'return') {
        if (key.ctrl && key.shift) findBar.replaceAll();
        else if (key.ctrl) findBar.replaceCurrent();
        else if (key.shift) findBar.previous();
        else findBar.next();
        revealFindMatch();
        return;
      }
      if (key.name === 'tab') {
        findBar.switchField();
        return;
      }
      if (key.name === 'backspace') {
        findBar.applyInputAction('backspace');
        revealFindMatch();
        return;
      }
      if (isTypedCharacter(key)) {
        findBar.append(key.sequence);
        revealFindMatch();
        return;
      }
      // swallow other keys while the bar is open
    };

    const keyTick = (key: KeyEvent): void => {
      tooltip.clear(); // any keypress hides the tooltip (display-only affordance)
      if (key.name === 'escape') currentNarration()?.bargeIn(); // Escape is the EXPLICIT "stop narration"; ordinary typing/paste/navigation lets it play on, so you can read/compose/work while listening (barge-in should be intentional, not a side effect of every keystroke)
      // Escape always closes the hover card; any other key closes it too UNLESS the pointer is engaged
      // with it (over the card / dragging a selection) — so a sticky card lets Ctrl+C copy its selection.
      if (key.name === 'escape') view.dismissHover();
      else view.dismissHoverSoft();
      // RESERVED GLOBAL CHORDS (quit) are escape hatches that must fire from ANY mode — checked BEFORE
      // every modal/search branch below, or a focused find/quick-open/settings input would swallow the
      // quit key and TRAP the user with no way out (a hard no-dead-ends / learnability failure). The
      // check is stateless (single-chord match only), so it never disturbs the chord resolver below.
      // invariant: Reserved global chords fire from any mode (src/modules/keybindings/keybindings.invariants.md)
      const reservedGlobalAction = keybindings.resolveReservedGlobal({
        name: key.name,
        ctrl: key.ctrl,
        shift: key.shift,
        option: key.option || key.meta,
        super: key.super,
      });
      if (reservedGlobalAction) {
        dispatchAction(reservedGlobalAction, key);
        return;
      }
      // Same MODAL contract for closing a tab with unsaved edits.
      if (workspaceSet.active.pendingCloseTabIndex.value >= 0) {
        if (key.name === 'y') workspaceSet.active.confirmCloseTab();
        else workspaceSet.active.cancelCloseTab();
        return;
      }

      // The exclusive overlay slot owns EVERY key before focused pane content. Pane focus is retained
      // beneath the overlay so closing returns naturally, but it cannot outrank the modal owner while
      // the overlay is open. The previous order routed Escape into a focused terminal/agent first:
      // Settings remained open even though OpenTUI had decoded and delivered the bare Escape correctly.
      // invariant: Input overlays share one modal slot (src/modules/ui/ui.invariants.md)
      const modalOverlayOwnsScreen = view.modalOverlayOwnsScreen();

      if (
        !modalOverlayOwnsScreen &&
        primaryDockHost.visible.value &&
        primaryDockHost.focused.value
      ) {
        const content = primaryDockHost.focusedContent;
        const contentContext = content?.keybindingContext;
        if (contentContext) {
          const resolution = keybindings.resolve(
            {
              name: key.name,
              ctrl: key.ctrl,
              shift: key.shift,
              option: key.option || key.meta,
              super: key.super,
            },
            contentContext,
            Date.now(),
          );
          if (resolution.action) {
            dispatchAction(resolution.action, key);
            return;
          }
        }
        if (content?.handleKey(key)) return;
      }

      // A focused bottom panel (the terminal) owns the keyboard: every non-reserved key is encoded to
      // terminal bytes and delivered to the active PaneContent's handleKey. Reserved globals (quit, panel
      // toggle) already fired above, so Ctrl+Q / F10 still quit and the toggle still hides the panel; an
      // unencodable key is swallowed so it never drives the hidden editor beneath.
      // invariant: A focused panel routes keystrokes to its active pane content (src/modules/terminal/terminal.invariants.md)
      if (
        !modalOverlayOwnsScreen &&
        panelHost.visible.value &&
        panelHost.focused.value
      ) {
        const panelResolution = keybindings.resolve(
          {
            name: key.name,
            ctrl: key.ctrl,
            shift: key.shift,
            option: key.option || key.meta,
            super: key.super,
          },
          'panel',
          Date.now(),
        );
        if (panelResolution.action?.startsWith('panel.contents')) {
          dispatchAction(panelResolution.action, key);
          return;
        }
        // The focused agent pane resolves a FEW bindings before its composer swallows the key: Ctrl+C /
        // Cmd+C copies its selection, and the global find chords open TRANSCRIPT SEARCH — the same
        // FindBar every searchable pane shares, bound to the pane's transcript target (replace is
        // read-only-declined by the target, so Ctrl+H also lands in find mode). While that bar is open
        // on the transcript, it owns the keyboard through the SAME shared handler the 'find' context
        // uses; Esc closes it and keys fall back to the composer. Everything else goes to the pane.
        const focusedContent = panelHost.focusedContent;
        if (focusedContent instanceof AgentPaneContent.Class) {
          if (agentSkillPopup.open.value) {
            if (key.name === 'escape') {
              agentSkillPopup.dismiss();
              return;
            }
            if (key.name === 'up') {
              agentSkillPopup.moveSelection(-1);
              return;
            }
            if (key.name === 'down') {
              agentSkillPopup.moveSelection(1);
              return;
            }
            if (key.name === 'return') {
              agentSkillPopup.runSelected();
              return;
            }
          }
          if (
            findBar.open.value &&
            findBar.target?.identifier ===
              AgentPaneContent.Class.transcriptFindTargetIdentifier
          ) {
            handleFindBarKey(key);
            return;
          }
          const agentResolution = keybindings.resolve(
            {
              name: key.name,
              ctrl: key.ctrl,
              shift: key.shift,
              option: key.option || key.meta,
              super: key.super,
            },
            'agent',
            Date.now(),
          );
          if (
            agentResolution.action === 'agent.copy' &&
            focusedContent.hasSelection()
          ) {
            dispatchAction('agent.copy', key);
            return;
          }
          if (
            agentResolution.action === 'find.open' ||
            agentResolution.action === 'find.replace'
          ) {
            openAgentTranscriptSearch();
            return;
          }
          if (
            agentResolution.action?.startsWith('agent.') ||
            agentResolution.action?.startsWith('textInput.')
          ) {
            dispatchAction(agentResolution.action, key);
            synchronizeAgentSkillPopup(focusedContent);
            return;
          }
        }
        if (focusedContent instanceof TerminalPaneContent.Class) {
          const terminalResolution = keybindings.resolve(
            {
              name: key.name,
              ctrl: key.ctrl,
              shift: key.shift,
              option: key.option || key.meta,
              super: key.super,
            },
            'terminal',
            Date.now(),
          );
          if (
            terminalResolution.action === 'terminal.copy' &&
            focusedContent.hasSelection()
          ) {
            dispatchAction('terminal.copy', key);
            return;
          }
          if (terminalResolution.action?.startsWith('terminal.word')) {
            dispatchAction(terminalResolution.action, key);
            return;
          }
          if (terminalResolution.action === 'terminal.deletePreviousWord') {
            dispatchAction(terminalResolution.action, key);
            return;
          }
        }
        panelHost.handleKey(key);
        if (focusedContent instanceof AgentPaneContent.Class) {
          synchronizeAgentSkillPopup(focusedContent);
        } else {
          agentSkillPopup.close();
        }
        return;
      }
      if (
        !modalOverlayOwnsScreen &&
        rightDockHost.visible.value &&
        rightDockHost.focused.value
      ) {
        rightDockHost.handleKey(key);
        return;
      }

      // Context menu is MODAL: keys resolve ONLY in the 'menu' context (bindings are registry
      // data); anything that is not a menu action closes the menu and is CONSUMED — no keystroke
      // both dismisses the menu and acts on what is beneath it.
      // invariant: A context menu is modal and single-consumer (src/modules/ui/ui.invariants.md)
      if (contextMenu.open.value) {
        const menuResolution = keybindings.resolve(
          {
            name: key.name,
            ctrl: key.ctrl,
            shift: key.shift,
            option: key.option || key.meta,
            super: key.super,
          },
          'menu',
          Date.now(),
        );
        if (menuResolution.action?.startsWith('menu.'))
          dispatchAction(menuResolution.action, key);
        else if (
          menuResolution.action &&
          inputOverlayOpeningActionIdentifiers.has(menuResolution.action)
        ) {
          dispatchAction(menuResolution.action, key);
        } else contextMenu.close();
        return;
      }

      // Bounded lists are modal and single-consumer. Printable keys edit the optional query; all
      // other unbound keys are consumed without reaching the editor below.
      if (boundedListPopup.open.value) {
        const listPopupResolution = keybindings.resolve(
          {
            name: key.name,
            ctrl: key.ctrl,
            shift: key.shift,
            option: key.option || key.meta,
            super: key.super,
          },
          'listPopup',
          Date.now(),
        );
        // `listPopup.*` drives the list; `textInput.*` drives the search field — word movement, word
        // deletion, Home/End, and delete-line reach it through the same action table every other
        // one-line input uses.
        if (
          listPopupResolution.action?.startsWith('listPopup.') ||
          listPopupResolution.action?.startsWith('textInput.')
        ) {
          dispatchAction(listPopupResolution.action, key);
        } else if (
          listPopupResolution.action &&
          inputOverlayOpeningActionIdentifiers.has(listPopupResolution.action)
        ) {
          dispatchAction(listPopupResolution.action, key);
        } else if (isTypedCharacter(key)) {
          boundedListPopup.appendQuery(key.sequence);
        }
        return;
      }

      // Completion is deliberately non-modal: the editor retains focus and continues mutating the
      // document while this adapter consumes only its navigation/acceptance keys.
      if (
        completionPopup.open &&
        workspaceSet.active.focus.value === 'editor'
      ) {
        const completionKeyIsUnmodified =
          !key.ctrl && !key.shift && !key.option && !key.meta && !key.super;
        if (completionKeyIsUnmodified && key.name === 'escape') {
          dismissCompletion();
          return;
        }
        if (
          completionKeyIsUnmodified &&
          (key.name === 'up' || key.name === 'down')
        ) {
          completionPopup.moveSelection(key.name === 'up' ? -1 : 1);
          return;
        }
        if (
          completionKeyIsUnmodified &&
          (key.name === 'return' || key.name === 'tab')
        ) {
          completionPopup.acceptSelected();
          return;
        }
        if (completionKeyIsUnmodified && key.name === 'backspace') {
          workspaceSet.active.editor.backspace();
          const prefix = completionPrefix();
          if (completionPopup.sourceIsIncomplete) requestCompletion('invoked');
          else completionPopup.narrow(prefix.text);
          return;
        }
        if (isTypedCharacter(key)) {
          workspaceSet.active.editor.insertText(key.sequence);
          const prefix = completionPrefix();
          const triggerCharacters =
            workspaceSet.active.completionTriggerCharacters();
          const isTriggerCharacter = triggerCharacters.includes(key.sequence);
          if (isTriggerCharacter) {
            requestCompletion('triggerCharacter', key.sequence);
          } else if (completionPopup.sourceIsIncomplete) {
            requestCompletion('invoked');
          } else {
            completionPopup.narrow(prefix.text);
          }
          return;
        }
        dismissCompletion();
      }

      // The cheat-sheet is an input-capturing overlay: while open, keys resolve in its 'help'
      // context (Esc closes, arrows scroll, global chords still work — opening another overlay
      // closes the sheet through the coordinator) and unbound keys are consumed.
      const context = shortcutHelp.open.value
        ? 'help'
        : settingsPanel.open.value
          ? 'settings'
          : commands.open.value
            ? 'palette'
            : quickOpen.open.value
              ? 'quickopen'
              : findBar.open.value
                ? 'find'
                : workspaceSet.active.focus.value;

      // Ctrl+H is the ASCII Backspace control byte (0x08); OpenTUI correctly decodes that legacy byte
      // as {name:'backspace', ctrl:false}. A physical Backspace is DEL (0x7f), so the byte sequences are
      // distinguishable. Normalize raw 0x08 back to the intent-addressed Ctrl+H chord before registry
      // resolution; the action remains DATA (`find.replace`), and ordinary Backspace remains editing.
      const rawControlH = key.name === 'backspace' && key.sequence === '\u0008';
      const normalizedChordEvent = {
        name: rawControlH ? 'h' : key.name,
        ctrl: rawControlH ? true : key.ctrl,
        shift: key.shift,
        option: key.option || key.meta,
        super: key.super,
      };

      // Quick-open (Ctrl+P) modal: type filters the fuzzy file list live, ↑/↓ move, Enter opens the
      // selected file as a tab (add-or-focus), Esc closes. Inline like the palette's query editing.
      if (context === 'quickopen') {
        const quickOpenResolution = keybindings.resolve(
          normalizedChordEvent,
          'quickopen',
          Date.now(),
        );
        if (quickOpenResolution.action) {
          dispatchAction(quickOpenResolution.action, key);
          return;
        }
        if (key.name === 'escape') {
          quickOpen.close();
          return;
        }
        if (key.name === 'up') {
          quickOpen.moveSelection(-1);
          return;
        }
        if (key.name === 'down') {
          quickOpen.moveSelection(1);
          return;
        }
        if (key.name === 'return') {
          activateQuickOpenSelection(); // the SAME path a click on a result row runs
          return;
        }
        if (key.name === 'backspace') {
          quickOpen.applyQueryInputAction('backspace');
          return;
        }
        if (isTypedCharacter(key)) {
          quickOpen.insertQuery(key.sequence);
          return;
        }
        return;
      }

      // Find/replace bar has keyboard: type edits the focused field (live find), Enter/Shift+Enter cycle
      // matches, Ctrl+Enter replaces, Tab switches field, Esc closes. Handled inline (not via the registry)
      // because it composes typed input with the match-reveal, like the palette's query editing. The body
      // is the SHARED handler — the focused agent pane routes to the same one for its transcript target.
      if (context === 'find') {
        handleFindBarKey(key);
        return;
      }

      // iTerm2 "Natural Text Editing" remaps Cmd+Left → a RAW ^A byte (0x01), which collides with
      // Ctrl+A = Select All. Under the Kitty protocol a PHYSICALLY pressed Ctrl+A arrives as the kitty
      // form (`key.sequence === 'a'`, an escape-encoded event), so a raw 0x01 control byte here is the
      // Cmd remap → line start. We divert it BEFORE resolving (the registry can't tell them apart:
      // both are {name:'a', ctrl:true}), and ONLY when Kitty is active — on a legacy terminal a raw ^A
      // really is Ctrl+A and must stay Select All. (Cmd+Right = raw ^E is handled by the Ctrl+E binding,
      // which is harmless because Ctrl+E was unbound.) Driven-verified against the real byte streams.
      if (
        context === 'editor' &&
        workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget &&
        renderer.useKittyKeyboard &&
        key.ctrl &&
        key.name === 'a' &&
        key.sequence === '\u0001'
      ) {
        workspaceSet.active.editor.moveToLineStart(key.shift);
        return;
      }

      // A contributed surface occupies the editor column: it consumes editor-context keys before the
      // keybinding registry, so its own panes move instead of the hidden buffer. The host does not
      // know which keys those are — the surface answers true when it handled one.
      if (
        context === 'editor' &&
        !workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget &&
        view.contributedEditorSurface()?.handleKey(key)
      ) {
        return;
      }

      const resolution = keybindings.resolve(
        // Alt-family collapse: mac terminals surface Option as `option` OR `meta` (ESC-prefixed
        // forms); both mean the alt slot of a chord pattern.
        normalizedChordEvent,
        context,
        Date.now(),
      );
      app.quitChordArmed.value = resolution.chordPending; // status-bar hint mirrors the pending chord
      if (resolution.action) {
        dispatchAction(resolution.action, key);
        return;
      }
      if (resolution.chordPending) return;
      // Residual defaults: unbound printable keys TYPE in type-accepting contexts.
      if (context === 'palette' && isTypedCharacter(key))
        commands.appendQuery(key.sequence);
      else if (
        context === 'editor' &&
        isTypedCharacter(key) &&
        workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget
      ) {
        workspaceSet.active.editor.insertText(key.sequence);
        if (
          workspaceSet.active
            .completionTriggerCharacters()
            .includes(key.sequence)
        )
          requestCompletion('triggerCharacter', key.sequence);
      }
      // No explicit render here — any model mutation above triggers the frame effect.
    };
    // A throw while handling a keystroke must not wedge the loop: isolate + repaint so the app stays
    // responsive. invariant: The render loop never wedges (project.invariants.md)
    const onKey = (key: KeyEvent): void => {
      HandlerGuard.Class.run(
        'keypress',
        () => keyTick(key),
        () => app.requestRender(),
      );
    };
    renderer.keyInput.on('keypress', onKey);
    app.onDispose(() => renderer.keyInput.off('keypress', onKey));

    // Bracketed paste (DECSET 2004) is part of the app-owned mode bundle TerminalSession enters at
    // startup and RE-enters on every recovery — never enabled inline here, or the tab-refocus recovery
    // forgets it and paste/dictation dies until restart (the mode-ownership-split bug).
    // A framed paste yields NO keypresses, so OpenTUI's paste event is the ONLY delivery path.
    // invariant: A focused panel routes keystrokes to its active pane content (src/modules/terminal/terminal.invariants.md)
    // invariant: Bracketed paste survives stream chunking (src/modules/terminal/terminal.invariants.md)
    // Route a paste to the same target the keyboard has: the focused panel pane (terminal PTY / agent
    // composer), else a focused single-line modal input (quick-open / find), else the editor. Mirrors
    // keyTick's dispatch order so paste lands exactly where typing would.
    const pasteTick = (text: string): void => {
      if (!text) return;
      if (panelHost.visible.value && panelHost.focused.value) {
        panelHost.handlePaste(text);
        const focusedContent = panelHost.focusedContent;
        if (focusedContent instanceof AgentPaneContent.Class) {
          synchronizeAgentSkillPopup(focusedContent);
        } else {
          agentSkillPopup.close();
        }
        return; // a focused panel owns paste even if its pane has no sink — never leak to the editor
      }
      if (rightDockHost.visible.value && rightDockHost.focused.value) {
        rightDockHost.handlePaste(text);
        return;
      }
      const singleLine = text.replace(/[\r\n]+/g, ' ');
      if (boundedListPopup.open.value) {
        if (boundedListPopup.searchEnabled)
          boundedListPopup.appendQuery(singleLine);
        return;
      }
      if (quickOpen.open.value) {
        quickOpen.insertQuery(singleLine);
        return;
      }
      if (findBar.open.value) {
        findBar.append(singleLine);
        return;
      }
      // Other overlays (palette, settings, help, menu) have no free-text paste target — consume it so a
      // paste never drives the editor hidden beneath an open overlay.
      if (
        commands.open.value ||
        settingsPanel.open.value ||
        shortcutHelp.open.value ||
        contextMenu.open.value
      )
        return;
      if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
        workspaceSet.active.editor.pasteText(text);
    };
    const onPaste = (event: { bytes: Uint8Array }): void => {
      HandlerGuard.Class.run(
        'paste',
        () => pasteTick(new TextDecoder().decode(event.bytes)),
        () => app.requestRender(),
      );
    };
    renderer.keyInput.on('paste', onPaste);
    app.onDispose(() => renderer.keyInput.off('paste', onPaste));

    // Global mouse capture: events bubble to the root renderable. Records the last event to the
    // status channel (verification) and repaints. Per-region handlers (tree, sidebar, dividers) are
    // attached on their own renderables and run before this via propagation.
    const onMouse = (event: {
      type: string;
      x: number;
      y: number;
      button: number;
    }): void => {
      HandlerGuard.Class.run(
        'mouse',
        () => {
          lastMouse = {
            type: event.type,
            x: event.x,
            y: event.y,
            button: event.button,
          };
          // Focus-follows-click for the bottom panel: a down OUTSIDE the visible panel blurs it (a down
          // inside is handled by the panel box, which focuses it). Keeps typing from going to a shell you
          // clicked away from.
          if (
            event.type === 'down' &&
            panelHost.focused.value &&
            !view.panelContainsPoint(event.x, event.y)
          ) {
            panelHost.blur();
          }
          if (
            event.type === 'down' &&
            rightDockHost.focused.value &&
            !view.rightDockContainsPoint(event.x, event.y)
          ) {
            rightDockHost.blur();
          }
          if (event.type === 'down') tooltip.clear(); // any click hides the tooltip, wherever it lands
          if (event.type === 'down' && completionPopup.open) {
            const geometry = completionPopup.geometry;
            const insideCompletion =
              geometry !== null &&
              event.x >= geometry.boxLeft &&
              event.x < geometry.boxLeft + geometry.boxWidth &&
              event.y >= geometry.boxTop &&
              event.y < geometry.boxTop + geometry.boxHeight;
            if (!insideCompletion) dismissCompletion();
          }
          if (event.type === 'down' && agentSkillPopup.open.value) {
            const geometry = agentSkillPopup.geometry;
            const insideAgentSkillPopup =
              geometry !== null &&
              event.x >= geometry.boxLeft &&
              event.x < geometry.boxLeft + geometry.boxWidth &&
              event.y >= geometry.boxTop &&
              event.y < geometry.boxTop + geometry.boxHeight;
            if (!insideAgentSkillPopup) agentSkillPopup.close();
          }
          // A click hides the hover card UNLESS it lands ON the card (engaged): a down on the card begins a
          // drag-select and must not dismiss it; a down anywhere else closes it.
          if (event.type === 'down') view.dismissHoverSoft();
          paint();
        },
        () => renderer.requestRender(),
      );
    };
    renderer.root.onMouse = onMouse;
    app.onDispose(() => {
      if (renderer.root.onMouse === onMouse) renderer.root.onMouse = undefined;
    });

    // --- terminal session-state recovery ----------------------------------------------------------
    // A VS Code terminal tab (and others) reset the terminal session state on tab-hide and neither
    // restore it nor redraw on return — leaving termios raw mode reverted (Ctrl+Q eaten by XON flow
    // control), mouse SGR + focus reporting dropped (dead wheel/click), and a stale frame (looks
    // frozen). On focus-in we re-enter the FULL terminal setup + force a repaint, restoring all three.
    // invariant: The render loop never wedges (project.invariants.md)
    const writeSequence = (sequence: string): void => {
      try {
        process.stdout.write(sequence);
      } catch {
        /* stdout gone (shutdown) — nothing to assert against */
      }
    };
    // Enter the app-owned mode bundle at startup: focus reporting (so \e[I arrives and recovery
    // triggers — OpenTUI's setup also enables it, this is idempotent insurance) AND bracketed paste
    // (paste/dictation delivery). Leave the bundle on exit so the shell is left clean.
    TerminalSession.Class.enterAppModes(writeSequence);
    app.onDispose(() => TerminalSession.Class.leaveAppModes(writeSequence));

    const onFocus = (): void => {
      HandlerGuard.Class.run(
        'focus',
        () => {
          // termios raw + mouse + focus + alt-screen (OpenTUI's routine) + the app modes (2004/1004)
          TerminalSession.Class.reenterTerminalModes(renderer, writeSequence);
          syncSize();
          paint(); // push current model→renderables; resume() already armed the full repaint
        },
        () => renderer.requestRender(),
      );
    };
    renderer.on('focus', onFocus);
    app.onDispose(() => renderer.off('focus', onFocus));

    const onResize = (): void => {
      HandlerGuard.Class.run(
        'resize',
        () => {
          // Re-assert the app-owned modes (some terminals drop them on the geometry change that
          // accompanies a tab-return) then re-lay-out + full-repaint. render() → processResize forces a
          // full repaint on a genuine size change; a same-size return is handled by onFocus above.
          TerminalSession.Class.enterAppModes(writeSequence);
          agentSkillPopup.close();
          void render();
        },
        () => renderer.requestRender(),
      );
    };
    renderer.on('resize', onResize);
    app.onDispose(() => renderer.off('resize', onResize));

    // DEMAND-DRIVEN rendering: auto() renders only on requestRender()/live requests — no continuous
    // targetFps loop at rest (the idle-leak fix: at-rest frame delta must be 0). Animations hold a
    // live request below and drop it on quiescence.
    renderer.auto();
    app.markStarted();
    await render();

    Logging.Class.info('Boot complete');
    return {
      app,
      get workspace() {
        return workspaceSet.active;
      },
      workspaceSet,
      theme,
      renderer,
      view,
      render,
      shutdown,
    };
  }
}

export namespace Bootstrap {
  export const $Class = $Bootstrap;
  export const Class = Static($Bootstrap);
}

export interface BootOptions {
  root?: string;
  onQuit?: () => void;
  plugins?: readonly ApplicationContributor[];
}

export interface BootedApp {
  app: App.Instance;
  workspace: Workspace.Instance;
  workspaceSet: WorkspaceSet.Instance;
  theme: Theme.Instance;
  renderer: CliRenderer;
  view: RootView;
  render(): Promise<void>;
  shutdown(): Promise<void>;
}
