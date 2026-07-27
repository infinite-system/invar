// The reactive agent service: it composes an AgentBackend with an append-only transcript and wires the
// event direction once, then exposes the session reactively. Backend events (backend.onEvent) fold into
// ONE transcript owned here; each fold bumps `renderRevision` so the single coarse frame effect repaints
// WITHOUT a keypress (an idle session bumps nothing → idle quiescence holds). The transcript is the
// single source of session truth: every surface (pane renderer, badges, persistence) PULLS from it and
// none keeps a parallel history. Assistant text-deltas accumulate into the current assistant turn; any
// other event closes that turn — so streaming text renders as one growing bubble, not fragments.
//
// invariant: The transcript is the single source of agent session truth (src/modules/agent/agent.invariants.md)
// invariant: One session is one Reactive instance (src/modules/agent/agent.invariants.md)
// invariant: Every agent turn reaches a terminal state (src/modules/agent/agent.invariants.md)
// invariant: Stream inactivity is visible and non-destructive (src/modules/agent/agent.invariants.md)
// invariant: Queued agent messages preserve order (src/modules/agent/agent.invariants.md)
// invariant: Agent instructions match the workspace (src/modules/agent/agent.invariants.md)
// invariant: Every agent backend session begins from the IBR foundation (src/modules/agent/agent.invariants.md)
import { Static } from 'ivue/extras';
import { Reactive } from 'ivue';
import { ref } from 'vue';
import type { AgentBackend } from './AgentBackend.interface';
import type {
  AgentEvent,
  AgentStatus,
  AgentTurnState,
  PermissionDecision,
  TranscriptEntry,
} from './AgentEvents.interface';
import type { ResolvedEngine } from './AgentProviderRegistry';
import { AgentPromptResolver } from './AgentPromptResolver';
import { TranscriptContextSerializer } from './TranscriptContextSerializer';
import type { AgentIbrFoundationResolution } from './AgentIbrFoundation';

class $AgentSession {
  /** The one append-only transcript. Mutated only by fold()/send()/swapBackend() here; read-only
   *  everywhere else. */
  protected readonly entries: TranscriptEntry[] = [];
  /** True while the trailing assistant entry is still accumulating text-deltas. */
  protected assistantTurnOpen = false;
  /** Live respond callbacks for pending permission requests, keyed by request id. The transcript entry
   *  is pure data; the callable lives HERE (the session is the one router of the user's decision). */
  protected readonly pendingPermissionResponders = new Map<
    string,
    (decision: PermissionDecision) => void
  >();
  /** A bounded context preamble to prepend to the NEXT prompt after an engine swap, so the new engine
   *  inherits the conversation. Consumed (cleared) on the first send after the swap. */
  protected pendingContextPreamble: string | null = null;
  /** External prompts waiting for the current turn to settle. Each is delivered as its own turn. */
  protected readonly pendingExternalPrompts: string[] = [];
  /** The backend may still be winding down after the user-facing state becomes canceled. */
  protected backendTurnActive = false;
  /** True from Escape until the matching backend session-end arrives. */
  protected cancellationRequested = false;
  /** Cancellation never auto-fires queued user messages. */
  protected queuedMessagesHeld = false;
  /** The user explicitly requested the held head while the canceled backend was still winding down. */
  protected queuedDispatchRequested = false;
  /** One inactivity timer per live backend turn. It observes only; it never interrupts. */
  protected inactivityTimerHandle: ReturnType<typeof setTimeout> | null = null;
  protected disposed = false;
  /** Invalidates callbacks retained by a disposed backend after an engine swap. */
  protected backendGeneration = 0;
  /** Everything before this transcript index is known settled (non-permission, or resolved) — the
   *  pendingPermission getter never re-walks it. Monotonic; valid because the transcript is append-only
   *  and a pointer entry only flips pending→resolved. */
  protected pendingPermissionScanFrom = 0;
  /** False only while a fresh Codex backend still needs IBR at prompt position zero. */
  protected ibrFoundationDeliveredToBackend = true;

  /** The engine currently answering — the registry's RESOLVED engine, passed by the factory at
   *  construction and updated on every swap. Stamped onto each assistant/permission entry as it opens,
   *  so the transcript records who PRODUCED each turn (history keeps its label across switches).
   *  Defaults to 'claude' (the only engine that existed before the stamp) for direct construction. */
  protected currentEngine: ResolvedEngine;

  constructor(
    protected backend: AgentBackend,
    activeEngine: ResolvedEngine = 'claude',
    protected readonly workspaceRoot: string = process.cwd(),
    protected readonly ibrFoundation: AgentIbrFoundationResolution | null = null,
  ) {
    this.currentEngine = activeEngine;
    this.wireBackend();
  }

  /** The engine currently answering (the pane title + greeting read this when no engine port is bound). */
  get activeEngine(): ResolvedEngine {
    return this.currentEngine;
  }

  /** The per-workspace foundation decision retained for backend parity and observability. */
  get ibrFoundationState(): AgentIbrFoundationState {
    if (this.ibrFoundation === null) return 'unavailable';
    if (this.backend.ibrFoundationDelivery === 'append-system-prompt') {
      return 'append-system-prompt';
    }
    if (this.backend.ibrFoundationDelivery === 'prepend-every-prompt') {
      return 'prepend-every-prompt';
    }
    return this.ibrFoundationDeliveredToBackend
      ? 'prepend-prompt-sent'
      : 'prepend-prompt-pending';
  }

  get ibrFoundationPath(): string | null {
    return this.ibrFoundation?.path ?? null;
  }

  /** Bumped on every folded event — the reactive paint signal the frame effect observes so async
   *  agent output repaints on its own. */
  get renderRevision() {
    return ref(0);
  }

  /** The lifecycle state derived from the event stream (idle → streaming → awaiting-tool → …). */
  get status() {
    return ref<AgentStatus>('idle');
  }

  /** User-facing turn liveness, including the watchdog-only stalled state and sticky canceled state. */
  get turnState() {
    return ref<AgentTurnState>('idle');
  }

  /** Read-only view of the transcript — the projection surface every UI reads. */
  get transcript(): readonly TranscriptEntry[] {
    return this.entries;
  }

  get workspaceDirectory(): string {
    return this.workspaceRoot;
  }

  /** True while a user-visible turn is in flight. Every projection reads this one predicate. */
  get turnInFlight(): boolean {
    return (
      this.turnState.value === 'running' || this.turnState.value === 'stalled'
    );
  }

  /** Compatibility vocabulary for queueing and non-indicator consumers. */
  get busy(): boolean {
    return this.turnInFlight;
  }

  /** Count is derived from transcript delivery state, so no parallel queue tally can drift. */
  get queuedMessageCount(): number {
    let count = 0;
    for (const entry of this.entries) {
      if (entry.role === 'user' && entry.delivery === 'queued') count += 1;
    }
    return count;
  }

  /** The OLDEST still-pending permission request (the one the y/n/a keys answer), or null. Derived from
   *  the transcript (no parallel pending list) — but scanned from a monotonic POINTER, not entry zero:
   *  this getter runs on every status publish, and the transcript is append-only with permissions
   *  resolving in order, so everything before the pointer is settled forever (the reviewed
   *  full-history-walk-per-paint cost). */
  get pendingPermission(): {
    id: string;
    toolName: string;
    input: unknown;
  } | null {
    while (this.pendingPermissionScanFrom < this.entries.length) {
      const entry = this.entries[this.pendingPermissionScanFrom]!;
      if (entry.role === 'permission-request' && entry.status === 'pending') {
        return { id: entry.id, toolName: entry.toolName, input: entry.input };
      }
      this.pendingPermissionScanFrom += 1; // settled or non-permission — never worth revisiting
    }
    return null;
  }

  /** Whether the ACTIVE backend can pause tools for interactive approval (ask-mode is claude/SDK-only;
   *  the mode line reads this so it never promises prompts a backend cannot deliver). */
  get permissionPromptsSupported(): boolean {
    return this.backend.supportsPermissionPrompts === true;
  }

  /** Resolve a pending permission request with the user's decision. Routes the answer into the backend's
   *  paused canUseTool callback (exactly once) and records the outcome on the transcript entry. */
  respondToPermission(id: string, decision: PermissionDecision): void {
    const respond = this.pendingPermissionResponders.get(id);
    if (!respond) return;
    this.pendingPermissionResponders.delete(id);
    for (const entry of this.entries) {
      if (entry.role === 'permission-request' && entry.id === id) {
        entry.status = decision === 'deny' ? 'denied' : 'allowed';
      }
    }
    this.renderRevision.value++;
    respond(decision);
  }

  /** Swap the underlying backend mid-session (an engine switch), KEEPING the transcript. The old backend
   *  is disposed, the new one wired, a visible system note is appended, and a bounded context preamble is
   *  armed so the new engine inherits the conversation on the next send. Ignored while a turn is busy
   *  (switch only at rest). Returns whether the swap happened. */
  swapBackend(nextBackend: AgentBackend, nextEngine: ResolvedEngine): boolean {
    if (this.busy || nextBackend === this.backend) return false;
    // Serialize the conversation BEFORE the switch note, so the preamble carries real context only.
    const preamble = TranscriptContextSerializer.Class.serialize(this.entries);
    this.backend.dispose();
    this.backend = nextBackend;
    this.currentEngine = nextEngine; // entries from here on are stamped with the NEW producer
    this.assistantTurnOpen = false;
    this.wireBackend();
    this.entries.push({
      role: 'system',
      text: `switched to ${nextEngine} — context ported`,
    });
    this.ingestContext(preamble);
    this.renderRevision.value++;
    return true;
  }

  /** Submit or queue a user turn. Empty input explicitly releases the queued head after cancellation.
   *  After an engine swap, the first delivered prompt prepends the context preamble to what the BACKEND
   *  receives (the user's own entry stays clean — the preamble is machinery). */
  send(prompt: string): boolean {
    const trimmed = prompt.trim();
    if (!trimmed) return this.sendQueuedMessage();
    const turnPrompt = prompt.startsWith('/') ? prompt : trimmed;
    if (
      this.backendTurnActive ||
      this.queuedMessagesHeld ||
      this.queuedMessageCount > 0
    ) {
      this.assistantTurnOpen = false;
      this.entries.push({ role: 'user', text: turnPrompt, delivery: 'queued' });
      this.renderRevision.value++;
      return true;
    }
    this.assistantTurnOpen = false;
    this.entries.push({ role: 'user', text: turnPrompt });
    this.startBackendTurn(turnPrompt);
    return true;
  }

  /** Explicitly release the OLDEST queued user message. A click may name any queued entry, but order
   *  remains authoritative: only the head can be released. */
  sendQueuedMessage(entryIndex?: number): boolean {
    const queuedEntryIndex = this.firstQueuedMessageIndex();
    if (queuedEntryIndex < 0) return false;
    if (entryIndex !== undefined && this.entries[entryIndex]?.role !== 'user') {
      return false;
    }
    if (
      entryIndex !== undefined &&
      this.entries[entryIndex]?.role === 'user' &&
      this.entries[entryIndex].delivery !== 'queued'
    ) {
      return false;
    }
    this.queuedMessagesHeld = false;
    if (this.backendTurnActive) {
      this.queuedDispatchRequested = true;
      this.renderRevision.value++;
      return true;
    }
    return this.dispatchQueuedMessage();
  }

  ingestContext(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const combined = this.pendingContextPreamble
      ? `${this.pendingContextPreamble}\n\n${trimmed}`
      : trimmed;
    const agentSessionClass = this.constructor as typeof $AgentSession;
    this.pendingContextPreamble = combined.slice(
      -agentSessionClass.maximumPendingContextCharacters,
    );
  }

  requestExternalResponse(prompt: string): boolean {
    const trimmed = prompt.trim();
    if (!trimmed) return false;
    this.pendingExternalPrompts.push(trimmed);
    if (this.turnState.value !== 'canceled') {
      this.dispatchPendingExternalPrompt();
    }
    return true;
  }

  appendSystemNote(text: string): void {
    if (!text) return;
    this.assistantTurnOpen = false;
    this.entries.push({ role: 'system', text });
    this.renderRevision.value++;
  }

  /** Request the in-flight turn stop. The visible state changes synchronously; backend process/stream
   *  teardown finishes behind the seam and reports its matching session-end afterward. */
  interrupt(): boolean {
    if (!this.backendTurnActive || this.cancellationRequested) return false;
    this.cancellationRequested = true;
    this.queuedMessagesHeld = true;
    this.queuedDispatchRequested = false;
    this.assistantTurnOpen = false;
    this.clearInactivityWatchdog();
    this.resolveDanglingPermissions();
    this.entries.push({ role: 'system', text: 'canceled' });
    this.status.value = 'idle';
    this.turnState.value = 'canceled';
    this.renderRevision.value++;
    this.backend.interrupt();
    this.publishCanceledStateAfterTeardown();
    return true;
  }

  /** Publish once after the synchronous key/backend stack has unwound. A
   *  cancellation can stop the spinner while the renderer is settling its
   *  current frame; every synchronous pulse then belongs to that frame and the
   *  status channel retains the preceding running snapshot. */
  protected publishCanceledStateAfterTeardown(): void {
    queueMicrotask(() => {
      if (this.disposed || this.turnState.value !== 'canceled') return;
      this.renderRevision.value++;
    });
  }

  /** Fold one backend event into the transcript + derived status. The whole state machine lives here. */
  protected fold(event: AgentEvent): void {
    if (this.cancellationRequested && event.kind !== 'session-end') return;
    if (event.kind === 'session-end') {
      this.completeBackendTurn(event.reason);
      return;
    }
    if (!this.backendTurnActive) this.backendTurnActive = true;
    if (this.backendTurnActive) this.recordBackendActivity();
    switch (event.kind) {
      case 'session-start':
        this.status.value = 'streaming';
        break;
      case 'text-delta':
        if (!this.assistantTurnOpen) {
          this.entries.push({
            role: 'assistant',
            text: '',
            engine: this.currentEngine,
          });
          this.assistantTurnOpen = true;
        }
        {
          const last = this.entries[this.entries.length - 1];
          if (last && last.role === 'assistant') last.text += event.text;
        }
        this.status.value = 'streaming';
        break;
      case 'tool-use':
        this.assistantTurnOpen = false;
        this.entries.push({
          role: 'tool-use',
          id: event.id,
          name: event.name,
          input: event.input,
        });
        this.status.value = 'awaiting-tool';
        break;
      case 'tool-result':
        this.assistantTurnOpen = false;
        this.entries.push({
          role: 'tool-result',
          id: event.id,
          result: event.result,
          isError: event.isError,
        });
        this.status.value = 'streaming';
        break;
      case 'permission-request':
        this.assistantTurnOpen = false;
        this.entries.push({
          role: 'permission-request',
          id: event.id,
          toolName: event.toolName,
          input: event.input,
          status: 'pending',
          engine: this.currentEngine,
        });
        this.pendingPermissionResponders.set(event.id, event.respond);
        this.status.value = 'awaiting-tool'; // the turn is paused on a gated tool
        break;
      case 'error':
        this.assistantTurnOpen = false;
        this.entries.push({ role: 'error', text: event.message });
        break;
    }
    this.renderRevision.value++;
  }

  protected completeBackendTurn(
    reason: 'completed' | 'interrupted' | 'error',
  ): void {
    if (!this.backendTurnActive) return;
    this.backendTurnActive = false;
    this.clearInactivityWatchdog();
    this.assistantTurnOpen = false;
    this.resolveDanglingPermissions();
    const canceled = this.cancellationRequested;
    this.cancellationRequested = false;
    if (!canceled) {
      this.status.value = reason === 'error' ? 'ended' : 'idle';
      this.turnState.value = 'idle';
    }
    this.renderRevision.value++;
    if (canceled) {
      if (this.queuedDispatchRequested) {
        this.queuedDispatchRequested = false;
        this.queuedMessagesHeld = false;
        this.dispatchQueuedMessage();
      } else if (this.queuedMessageCount === 0) {
        this.queuedMessagesHeld = false;
      }
      return;
    }
    if (!this.dispatchQueuedMessage()) this.dispatchPendingExternalPrompt();
  }

  protected wireBackend(): void {
    this.backendGeneration += 1;
    this.ibrFoundationDeliveredToBackend =
      this.ibrFoundation === null ||
      this.backend.ibrFoundationDelivery === 'append-system-prompt';
    const connectedBackend = this.backend;
    const connectedGeneration = this.backendGeneration;
    connectedBackend.onEvent((event) => {
      if (
        this.backend !== connectedBackend ||
        this.backendGeneration !== connectedGeneration
      ) {
        return;
      }
      this.fold(event);
    });
  }

  /** Deny-resolve any permission request still pending when the turn ends (interrupt/error/crash) so no
   *  paused backend promise leaks and no prompt renders against a dead turn. */
  protected resolveDanglingPermissions(): void {
    for (const [id, respond] of [...this.pendingPermissionResponders]) {
      this.pendingPermissionResponders.delete(id);
      for (const entry of this.entries) {
        if (entry.role === 'permission-request' && entry.id === id)
          entry.status = 'denied';
      }
      respond('deny');
    }
  }

  protected dispatchPendingExternalPrompt(): void {
    if (
      this.backendTurnActive ||
      this.queuedMessagesHeld ||
      this.queuedMessageCount > 0
    ) {
      return;
    }
    const prompt = this.pendingExternalPrompts.shift();
    if (!prompt) return;
    this.assistantTurnOpen = false;
    this.entries.push({ role: 'user', text: prompt });
    this.startBackendTurn(prompt);
  }

  protected firstQueuedMessageIndex(): number {
    return this.entries.findIndex(
      (entry) => entry.role === 'user' && entry.delivery === 'queued',
    );
  }

  protected dispatchQueuedMessage(): boolean {
    if (this.backendTurnActive || this.queuedMessagesHeld) return false;
    const entryIndex = this.firstQueuedMessageIndex();
    if (entryIndex < 0) return false;
    const entry = this.entries[entryIndex]!;
    if (entry.role !== 'user') return false;
    delete entry.delivery;
    this.startBackendTurn(entry.text);
    return true;
  }

  protected startBackendTurn(prompt: string): void {
    this.backendTurnActive = true;
    this.cancellationRequested = false;
    this.status.value = 'streaming';
    this.turnState.value = 'running';
    this.armInactivityWatchdog();
    this.renderRevision.value++;
    const resolvedPrompt = AgentPromptResolver.Class.resolve(
      this.workspaceRoot,
      prompt,
    );
    this.backend.send(this.promptForCurrentBackend(resolvedPrompt));
  }

  protected recordBackendActivity(): void {
    this.turnState.value = 'running';
    this.armInactivityWatchdog();
  }

  protected armInactivityWatchdog(): void {
    this.clearInactivityWatchdog();
    const agentSessionClass = this.constructor as typeof $AgentSession;
    this.inactivityTimerHandle = setTimeout(() => {
      this.inactivityTimerHandle = null;
      if (
        this.disposed ||
        !this.backendTurnActive ||
        this.cancellationRequested
      ) {
        return;
      }
      this.turnState.value = 'stalled';
      this.renderRevision.value++;
    }, agentSessionClass.streamInactivityThresholdMilliseconds);
    (
      this.inactivityTimerHandle as ReturnType<typeof setTimeout> & {
        unref?: () => void;
      }
    ).unref?.();
  }

  protected clearInactivityWatchdog(): void {
    if (this.inactivityTimerHandle === null) return;
    clearTimeout(this.inactivityTimerHandle);
    this.inactivityTimerHandle = null;
  }

  protected promptForCurrentBackend(prompt: string): string {
    const promptParts: string[] = [];
    if (
      (!this.ibrFoundationDeliveredToBackend ||
        this.backend.ibrFoundationDelivery === 'prepend-every-prompt') &&
      this.ibrFoundation !== null
    ) {
      promptParts.push(this.ibrFoundation.content);
      this.ibrFoundationDeliveredToBackend = true;
    }
    if (this.pendingContextPreamble) {
      promptParts.push(this.pendingContextPreamble);
    }
    promptParts.push(prompt);
    this.pendingContextPreamble = null;
    return promptParts.join('\n\n');
  }

  protected static get maximumPendingContextCharacters(): number {
    return 32 * 1024;
  }

  protected static get streamInactivityThresholdMilliseconds(): number {
    const injectedThreshold = Number(
      process.env.INVAR_AGENT_STREAM_INACTIVITY_MS,
    );
    return Number.isFinite(injectedThreshold) && injectedThreshold > 0
      ? injectedThreshold
      : 120_000;
  }

  dispose(): void {
    this.disposed = true;
    this.clearInactivityWatchdog();
    this.resolveDanglingPermissions();
    this.backend.dispose();
  }
}

export namespace AgentSession {
  export const $Class = Static($AgentSession);
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
  export type Model = InstanceType<typeof Class>;
}

export type AgentIbrFoundationState =
  | 'unavailable'
  | 'append-system-prompt'
  | 'prepend-every-prompt'
  | 'prepend-prompt-pending'
  | 'prepend-prompt-sent';
