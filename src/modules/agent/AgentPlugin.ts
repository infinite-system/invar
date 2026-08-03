import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import type { Keybinding } from '../keybindings/KeybindingRegistry';
import { KeybindingDefaults } from '../keybindings/KeybindingDefaults';
import { NarrationProjection } from '../narration/NarrationProjection';
import { TtsFactory } from '../narration/TtsFactory';
import type { TtsBackend } from '../narration/TtsBackend.interface';
import type { StatusSnapshot } from '../system/StatusChannel';
import type { PaneContent } from '../ui/PaneContent.interface';
import type {
  PaneRuntime,
  PaneRuntimeHostPort,
  PaneRuntimeRequest,
} from '../ui/PaneRuntime.interface';
import { AgentFactory } from './AgentFactory';
import {
  AgentPaneContent,
  type AgentEnginePort,
  type AgentTranscriptSearchPort,
} from './AgentPaneContent';
import { AgentProviderRegistry } from './AgentProviderRegistry';
import { AgentSkillPopup } from './AgentSkillPopup';
import {
  AgentTerminalFollow,
  type AgentTerminalObservationPort,
} from './AgentTerminalFollow';
import type { AgentTerminalToolPort } from './AgentTerminalTools';
import { SdkBinaryExtraction } from './SdkBinaryExtraction';
import type { RegisteredSetting } from '../settings/SettingContribution.interface';
import { SettingSpecs } from '../settings/SettingSpecs';
import type { AgentProvider } from './AgentProviderRegistry';
import type { AgentTerminalFollowMode } from './AgentPaneContent';
import { VoiceDiscovery } from '../narration/VoiceDiscovery';

// invariant: The agent pane is a PaneContent citizen, not a special case (src/modules/agent/agent.invariants.md)
// invariant: A pane runtime owns its processes (src/modules/ui/ui.invariants.md)
class $AgentPlugin implements ApplicationContributor, PaneRuntime {
  readonly identifier = 'agent';
  readonly name = 'Invar Agent';
  readonly kind = 'agent';
  readonly instanceLabel = 'Agent';
  // Agent panes share the Terminal space (the #405 declaration seam) — same
  // grouping the hand-wired pane had before the plugin move.
  readonly panelSpace = { kind: 'terminal', label: 'Terminal' } as const;
  readonly offeredInPanelAddMenu = true;
  readonly paneAddMenuEntries = [
    {
      identifier: 'invar-agent',
      label: 'Terminal (Invar agent)',
      instanceLabel: 'Terminal (Invar agent)',
      spaceKind: 'terminal',
    },
  ] as const;
  readonly defaultSplitPriority = 0;
  protected application: ApplicationContributionContext | null = null;
  protected hostPort: PaneRuntimeHostPort | null = null;
  protected readonly panes = new Map<string, AgentPaneContent.Model>();
  protected readonly narrations = new Map<
    string,
    NarrationProjection.Instance
  >();
  protected readonly terminalFollowers = new Map<
    string,
    AgentTerminalFollow.Model
  >();
  protected disposeCommands: (() => void) | null = null;
  protected disposeStatusProjection: (() => void) | null = null;
  protected disposeStatusBar: (() => void) | null = null;
  protected disposeSystemNotes: (() => void) | null = null;
  protected disposePanelContentLifecycle: (() => void) | null = null;
  protected skillPopup: AgentSkillPopup.Model | null = null;
  protected testVoiceBackend: TtsBackend | null = null;
  protected provider: RegisteredSetting<AgentProvider> | null = null;
  protected skipPermissions: RegisteredSetting<boolean> | null = null;
  protected terminalFollowMode: RegisteredSetting<AgentTerminalFollowMode> | null =
    null;
  protected model: RegisteredSetting<string> | null = null;
  protected audioNarration: RegisteredSetting<boolean> | null = null;
  protected narrationVoice: RegisteredSetting<string> | null = null;
  protected narrationRate: RegisteredSetting<number> | null = null;
  protected insertedDefaultPanelOrder = false;

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    if (!context.settings.panelContentOrder.value.includes(this.kind)) {
      context.settings.panelContentOrder.value = [
        this.kind,
        ...context.settings.panelContentOrder.value,
      ];
      this.insertedDefaultPanelOrder = true;
    }
    SdkBinaryExtraction.Class.reapStaleSiblings();
    this.provider = context.registerSetting({
      identifier: 'agentProvider',
      label: 'Agent engine',
      section: 'Agent',
      defaultValue: 'auto',
      spec: { kind: 'enum', options: ['auto', 'claude', 'codex'] },
    });
    this.skipPermissions = context.registerSetting({
      identifier: 'agentSkipPermissions',
      label: 'Agent bypasses permissions (off = ask interactively)',
      section: 'Agent',
      defaultValue: true,
      spec: { kind: 'boolean' },
    });
    this.terminalFollowMode = context.registerSetting({
      identifier: 'agentTerminalFollowMode',
      label: 'Agent terminal follow mode',
      section: 'Agent',
      defaultValue: 'off',
      spec: {
        kind: 'enum',
        options: ['follow-all', 'on-error', 'on-request', 'off'],
      },
    });
    this.model = context.registerSetting({
      identifier: 'agentModel',
      label: 'Agent model override',
      section: 'Agent',
      defaultValue: '',
      spec: SettingSpecs.Class.dynamicEnum(() => ['']),
    });
    this.audioNarration = context.registerSetting({
      identifier: 'agentAudioNarration',
      label: 'Speak agent replies aloud (needs a TTS engine)',
      section: 'Narration',
      defaultValue: false,
      spec: { kind: 'boolean' },
    });
    this.narrationVoice = context.registerSetting({
      identifier: 'agentNarrationVoice',
      label: 'Narration voice',
      section: 'Narration',
      defaultValue: '',
      spec: SettingSpecs.Class.dynamicEnum(() =>
        VoiceDiscovery.Class.options(),
      ),
    });
    this.narrationRate = context.registerSetting({
      identifier: 'agentNarrationRate',
      label: 'Narration speed (higher = faster; 1.0 = normal)',
      section: 'Narration',
      defaultValue: 1,
      spec: {
        kind: 'number',
        step: 0.1,
        minimum: 0.5,
        maximum: 3,
        decimals: 1,
      },
    });
    this.hostPort = context.registerPaneRuntime(this);
    this.skillPopup = new AgentSkillPopup.Class({
      renderer: context.renderer,
      settings: context.settings,
      theme: context.theme,
      popup: context.boundedListPopup,
    });
    context.registerKeybindings(this.keybindings());
    context.registerKeyObserver((key) => {
      if (key.name !== 'escape') return;
      const pane = this.currentPane();
      if (pane) this.narrations.get(pane.id)?.bargeIn();
    });
    this.disposeCommands = context.commands.registerAll([
      {
        id: 'panel.toggleAgent',
        title: 'Panel: Toggle Agent',
        category: 'Agent',
        run: () => this.togglePane(),
      },
      {
        id: 'agent.copy',
        title: 'Agent: Copy Selection',
        category: 'Agent',
        run: () => {
          const pane = this.currentPane();
          if (pane) context.copyPaneSelection(pane);
        },
      },
      {
        id: 'agent.cancelTurn',
        title: 'Agent: Cancel Turn',
        category: 'Agent',
        run: () => this.focusedPane()?.cancelTurn(),
      },
      {
        id: 'agent.cycleTerminalFollowMode',
        title: 'Agent: Cycle Terminal Follow Mode',
        category: 'Agent',
        run: () => this.cycleTerminalFollowMode(),
      },
      {
        id: 'narration.testVoice',
        title: 'Narration: Test Voice',
        category: 'Narration',
        run: () => this.testNarrationVoice(),
      },
    ]);
    this.disposeStatusBar = context.statusBarSegments.register({
      segments: () => [],
      controls: () => [
        {
          identifier: 'agent',
          icon: context.theme.agentIcon,
          label: 'Toggle Agent',
          active:
            context.bottomPanelHost.visible.value &&
            context.bottomPanelHost.visibleContentsOfKind(this.kind).length > 0,
          run: () => this.togglePane(),
        },
      ],
    });
    this.disposeStatusProjection =
      context.statusProjectionContributions.register({
        snapshot: () => this.statusSnapshot(),
      });
    this.disposeSystemNotes = context.systemNoteContributions.register((note) =>
      this.currentPane()?.agentSession.appendSystemNote(note),
    );
    this.disposePanelContentLifecycle =
      context.panelContentLifecycle.onRegistered((content) => {
        if ((content.kind ?? content.id) !== 'terminal') return;
        for (const pane of this.panes.values()) {
          this.connectTerminalFollow(pane);
        }
      });
  }

  createPane(request: PaneRuntimeRequest): PaneContent {
    const context = this.requireApplication();
    const pane = AgentFactory.Class.create({
      identifier: request.identifier,
      label: request.label,
      cwd: request.workingDirectory,
      provider: this.requireProvider().value.value,
      skipPermissions: () => this.requireSkipPermissions().value.value,
      model: this.requireModel().value.value,
      terminalTools: this.terminalTools(),
      onExit: (identifier) => {
        context.replacePaneWithRuntime(identifier, 'terminal');
      },
    });
    if (this.panes.has(pane.id)) {
      throw new Error(
        `Agent pane identifier already belongs to another session: ${pane.id}`,
      );
    }
    this.panes.set(pane.id, pane);
    pane.attachPermissionMode(this.requireSkipPermissions().value);
    const enginePort: AgentEnginePort = {
      get provider() {
        return pane.agentSession.activeEngine;
      },
      get canCycle() {
        return AgentProviderRegistry.Class.availableEngines().length >= 2;
      },
      cycle: () => this.cycleEngine(pane),
    };
    pane.attachEnginePort(enginePort);
    pane.attachTerminalFollowPort({
      mode: this.requireTerminalFollowMode().value,
    });
    const transcriptSearchPort: AgentTranscriptSearchPort = {
      findBar: context.findBar,
      open: () => context.openFindTarget(pane.findTarget()),
    };
    pane.attachTranscriptSearchPort(transcriptSearchPort);
    if (this.skillPopup) {
      pane.attachSkillPopupPort({
        popup: this.skillPopup,
        workspaceDirectory: () => context.workspaceSet.active.root,
        caretAnchor: () => context.focusedPanelCaretAnchor(),
      });
    }
    this.narrations.set(
      pane.id,
      new NarrationProjection.Class(
        pane.agentSession,
        this.requireAudioNarration().value,
        TtsFactory.Class.createBackend({
          voiceProvider: () => this.requireNarrationVoice().value.value,
          rateProvider: () => this.requireNarrationRate().value.value,
        }),
      ),
    );
    this.connectTerminalFollow(pane);
    return pane;
  }

  paneRemoved(content: PaneContent): void {
    this.panes.delete(content.id);
    this.narrations.get(content.id)?.dispose();
    this.narrations.delete(content.id);
    this.terminalFollowers.get(content.id)?.dispose();
    this.terminalFollowers.delete(content.id);
  }

  disposeApplication(): void {
    this.disposeCommands?.();
    this.disposeCommands = null;
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    this.disposeStatusBar?.();
    this.disposeStatusBar = null;
    this.disposeSystemNotes?.();
    this.disposeSystemNotes = null;
    this.disposePanelContentLifecycle?.();
    this.disposePanelContentLifecycle = null;
    for (const identifier of [...this.panes.keys()]) {
      this.hostPort?.releasePane(identifier);
    }
    this.panes.clear();
    for (const narration of this.narrations.values()) narration.dispose();
    this.narrations.clear();
    for (const follower of this.terminalFollowers.values()) follower.dispose();
    this.terminalFollowers.clear();
    this.testVoiceBackend?.dispose();
    this.testVoiceBackend = null;
    this.skillPopup?.dispose();
    this.skillPopup = null;
    if (this.insertedDefaultPanelOrder && this.application) {
      this.application.settings.panelContentOrder.value =
        this.application.settings.panelContentOrder.value.filter(
          (identifier) => identifier !== this.kind,
        );
    }
    this.insertedDefaultPanelOrder = false;
    this.hostPort?.dispose();
    this.hostPort = null;
    this.application = null;
    this.provider = null;
    this.skipPermissions = null;
    this.terminalFollowMode = null;
    this.model = null;
    this.audioNarration = null;
    this.narrationVoice = null;
    this.narrationRate = null;
  }

  protected togglePane(): void {
    const context = this.requireApplication();
    const visible = context.bottomPanelHost.visibleContentsOfKind(this.kind)[0];
    if (visible) context.bottomPanelHost.toggleContent(visible.id);
    else {
      const pane = this.currentPane() ?? context.ensureRuntimePane(this.kind);
      if (pane) context.bottomPanelHost.showContent(pane.id);
    }
    context.requestRender();
  }

  protected currentPane(): AgentPaneContent.Model | null {
    const pane = this.hostPort?.currentPane() ?? null;
    return pane instanceof AgentPaneContent.Class ? pane : null;
  }

  protected focusedPane(): AgentPaneContent.Model | null {
    const pane = this.application?.bottomPanelHost.focusedContent;
    return pane instanceof AgentPaneContent.Class ? pane : null;
  }

  protected cycleEngine(pane: AgentPaneContent.Model): boolean {
    const context = this.requireApplication();
    const next = AgentProviderRegistry.Class.nextEngine(
      pane.agentSession.activeEngine,
    );
    if (!next) return false;
    const backend = AgentFactory.Class.createBackend({
      cwd: context.workspaceSet.active.root,
      provider: next === 'echo' ? 'auto' : next,
      skipPermissions: () => this.requireSkipPermissions().value.value,
      model: this.requireModel().value.value,
      terminalTools: this.terminalTools(),
    });
    if (!pane.agentSession.swapBackend(backend, next)) {
      backend.dispose();
      return false;
    }
    if (next !== 'echo') this.requireProvider().value.value = next;
    this.requireProvider().save();
    return true;
  }

  protected cycleTerminalFollowMode() {
    const context = this.requireApplication();
    this.requireTerminalFollowMode().value.value =
      AgentTerminalFollow.Class.nextMode(
        this.requireTerminalFollowMode().value.value,
      );
    this.requireTerminalFollowMode().save();
    return this.requireTerminalFollowMode().value.value;
  }

  protected connectTerminalFollow(pane: AgentPaneContent.Model): void {
    const context = this.requireApplication();
    const observation = context
      .currentPaneOfKind('terminal')
      ?.capability?.<AgentTerminalObservationPort>('terminal-observation');
    if (!observation) return;
    this.terminalFollowers.get(pane.id)?.dispose();
    this.terminalFollowers.set(
      pane.id,
      new AgentTerminalFollow.Class(
        pane.agentSession,
        observation,
        this.requireTerminalFollowMode().value,
        () => this.requireTerminalFollowMode().save(),
      ),
    );
  }

  protected terminalTools(): AgentTerminalToolPort {
    const context = this.requireApplication();
    const port = (): AgentTerminalToolPort => {
      const terminal = context.ensureRuntimePane('terminal');
      const capability =
        terminal?.capability?.<AgentTerminalToolPort>('terminal-commands');
      if (!terminal || !capability)
        throw new Error('No terminal runtime is installed');
      return capability;
    };
    const reveal = (): AgentTerminalToolPort => {
      const terminal = context.ensureRuntimePane('terminal');
      const capability =
        terminal?.capability?.<AgentTerminalToolPort>('terminal-commands');
      if (!terminal || !capability)
        throw new Error('No terminal runtime is installed');
      context.bottomPanelHost.showContent(terminal.id);
      return capability;
    };
    return {
      readTerminalInput: () => port().readTerminalInput(),
      readTerminalScrollback: (request) =>
        port().readTerminalScrollback(request),
      stageTerminalCommand: (command) => reveal().stageTerminalCommand(command),
      replaceTerminalInput: (command) => reveal().replaceTerminalInput(command),
      runTerminalCommand: (command) => reveal().runTerminalCommand(command),
    };
  }

  protected testNarrationVoice(): void {
    const context = this.requireApplication();
    this.testVoiceBackend?.dispose();
    this.testVoiceBackend = TtsFactory.Class.createBackend({
      voice: this.requireNarrationVoice().value.value,
      rate: this.requireNarrationRate().value.value,
    });
    this.testVoiceBackend.speak(
      'Narration voice test — the quick brown fox jumps over the lazy dog.',
    );
  }

  protected keybindings(): readonly Keybinding[] {
    return [
      {
        chord: { key: 'a', ctrl: true, shift: true },
        action: 'panel.toggleAgent',
        applicationGlobal: true,
      },
      {
        chord: { key: 'escape' },
        action: 'agent.cancelTurn',
        context: 'agent',
      },
      {
        chord: { key: 'c', ctrl: true },
        action: 'agent.copy',
        context: 'agent',
      },
      {
        chord: { key: 'c', super: true },
        action: 'agent.copy',
        context: 'agent',
      },
      {
        chord: { key: 'm', ctrl: true, shift: true },
        action: 'agent.cycleTerminalFollowMode',
        context: 'agent',
      },
      ...KeybindingDefaults.Class.textInputBindings('agent'),
    ];
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const context = this.application;
    if (!context) return {};
    const pane = this.currentPane();
    const narration = pane ? this.narrations.get(pane.id) : null;
    const transcript = pane?.agentSession.transcript ?? [];
    return {
      agentSkillPopupOpen: this.skillPopup?.open.value ?? false,
      agentSkillPopupItemIdentifiers:
        this.skillPopup?.items.map((item) => item.identifier) ?? [],
      agentSkillPopupSelectedIdentifier:
        this.skillPopup?.selectedIdentifier ?? null,
      agentSkillPopupGeometry: this.skillPopup?.geometry ?? null,
      narrationEnabled: this.requireAudioNarration().value.value,
      narrationVoice: this.requireNarrationVoice().value.value,
      narrationRate: this.requireNarrationRate().value.value,
      narrationSpokenCount: narration?.spokenCount.value ?? 0,
      narrationLastSpoken: narration?.lastSpoken.value ?? '',
      narrationBargeInCount: narration?.bargeInCount.value ?? 0,
      agentBusy: pane?.agentSession.busy ?? false,
      agentTurnState: pane?.agentSession.turnState.value ?? 'idle',
      queuedMessageCount: pane?.agentSession.queuedMessageCount ?? 0,
      agentStuckToBottom: pane?.stuckToBottom ?? true,
      agentExpandedCount: pane?.expandedCount ?? 0,
      agentScrollTop: pane?.scrollTop ?? 0,
      agentViewportRows: pane?.viewportRows ?? 0,
      agentContentLineCount: pane?.contentLineCount ?? 0,
      agentPendingPermissionTool:
        pane?.agentSession.pendingPermission?.toolName ?? '',
      agentSkipPermissions: this.requireSkipPermissions().value.value,
      agentEngine: pane?.currentEngine ?? '',
      agentTitle: pane?.title ?? '',
      agentAssistantEntryCount: transcript.filter(
        (entry) => entry.role === 'assistant',
      ).length,
      agentLastAssistantText:
        [...transcript].reverse().find((entry) => entry.role === 'assistant')
          ?.text ?? '',
      terminalFollowMode: this.requireTerminalFollowMode().value.value,
      agentLastToolResult:
        [...transcript].reverse().find((entry) => entry.role === 'tool-result')
          ?.result ?? '',
    };
  }

  protected requireApplication(): ApplicationContributionContext {
    if (!this.application)
      throw new Error('The agent runtime is not activated');
    return this.application;
  }

  protected requireProvider(): RegisteredSetting<AgentProvider> {
    if (!this.provider)
      throw new Error('The agent provider setting is not registered');
    return this.provider;
  }

  protected requireSkipPermissions(): RegisteredSetting<boolean> {
    if (!this.skipPermissions)
      throw new Error('The agent permission setting is not registered');
    return this.skipPermissions;
  }

  protected requireTerminalFollowMode(): RegisteredSetting<AgentTerminalFollowMode> {
    if (!this.terminalFollowMode)
      throw new Error('The terminal follow setting is not registered');
    return this.terminalFollowMode;
  }

  protected requireModel(): RegisteredSetting<string> {
    if (!this.model)
      throw new Error('The agent model setting is not registered');
    return this.model;
  }

  protected requireAudioNarration(): RegisteredSetting<boolean> {
    if (!this.audioNarration)
      throw new Error('The narration setting is not registered');
    return this.audioNarration;
  }

  protected requireNarrationVoice(): RegisteredSetting<string> {
    if (!this.narrationVoice)
      throw new Error('The narration voice setting is not registered');
    return this.narrationVoice;
  }

  protected requireNarrationRate(): RegisteredSetting<number> {
    if (!this.narrationRate)
      throw new Error('The narration rate setting is not registered');
    return this.narrationRate;
  }
}

export namespace AgentPlugin {
  export const $Class = $AgentPlugin;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
