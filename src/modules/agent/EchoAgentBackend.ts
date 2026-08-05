// The Tier-S default backend: a local, no-network echo. It implements the SAME AgentBackend seam as the
// real backends will, so it exercises the whole projection pipeline (send → structured events →
// transcript → pane) end-to-end without any subprocess. It is deliberately honest about being a
// placeholder — every reply says so — and is swapped for CliStreamBackend (`claude -p
// --output-format stream-json`, subscription-billed) in phase 2 with ZERO change above the seam. This
// is the whole point of the one-seam invariant: the live app runs today, the real agent drops in later.
//
// invariant: Agent events cross exactly one backend seam (src/modules/agent/agent.invariants.md)
import type { AgentBackend } from './AgentBackend.interface';
import type { AgentEvent } from './AgentEvents.interface';
import { AgentPermissions } from './AgentPermissions';
import {
  AgentTerminalTools,
  type AgentTerminalToolPort,
} from './AgentTerminalTools';

class $EchoAgentBackend implements AgentBackend {
  constructor(protected readonly options: EchoAgentOptions = {}) {}

  /** The echo can PAUSE a scripted tool behind a permission prompt (env-gated), so the whole ask-mode
   *  UI loop is drivable hermetically — no SDK, no billing. */
  readonly supportsPermissionPrompts = true;

  protected eventCallback: ((event: AgentEvent) => void) | null = null;
  protected disposed = false;
  /** Pending delayed-completion timer (only armed in the demo/driving path). */
  protected pendingTimer: ReturnType<typeof setTimeout> | null = null;
  /** Session-scoped auto-allow (mirrors the SDK backend's 'always-allow' semantics for the smoke). */
  protected readonly autoAllowedTools = new Set<string>();

  send(prompt: string): void {
    if (this.disposed) return;
    if (prompt.startsWith('terminal-tools:')) {
      void this.handleTerminalToolPrompt(prompt);
      return;
    }
    const reply = `You said: “${prompt}”. This is the local echo backend — real Claude arrives when CliStreamBackend is wired (phase 2).`;
    // Stream the reply as word-sized deltas so the pane shows real incremental accumulation.
    for (const word of reply.split(' '))
      this.emit({ kind: 'text-delta', text: `${word} ` });

    // Permission-flow driving path (env-gated): PAUSE a scripted Bash tool behind a permission-request,
    // exactly like the SDK backend's canUseTool — allow/always-allow runs it, deny blocks it and the
    // turn continues with the denial. 'always-allow' auto-allows the tool for the REST of the session
    // (the next send() with the same tool skips the prompt), proving the session-scoped set end to end.
    if (process.env.INVAR_AGENT_ECHO_PERMISSION === '1') {
      const toolInput = { command: `echo gated for: ${prompt}` };
      const runTool = (): void => {
        this.emit({
          kind: 'tool-use',
          id: `echo-gated-${Date.now()}`,
          name: 'Bash',
          input: toolInput,
        });
        this.emit({
          kind: 'tool-result',
          id: `echo-gated-${Date.now()}`,
          result: `gated for: ${prompt}`,
          isError: false,
        });
        this.emit({ kind: 'session-end', reason: 'completed' });
      };
      if (this.autoAllowedTools.has('Bash')) {
        runTool();
        return;
      }
      let settled = false;
      this.emit({
        kind: 'permission-request',
        id: `echo-permission-${Date.now()}`,
        toolName: 'Bash',
        input: toolInput,
        respond: (decision) => {
          if (settled || this.disposed) return;
          settled = true;
          if (decision === 'always-allow') this.autoAllowedTools.add('Bash');
          if (decision === 'deny') {
            this.emit({
              kind: 'text-delta',
              text: 'Understood — I will not run that command (denied). ',
            });
            this.emit({ kind: 'session-end', reason: 'completed' });
            return;
          }
          runTool();
        },
      });
      return;
    }

    // Driving-smoke path (env-gated, off by default so the hermetic smoke-agent stays synchronous): emit
    // a scripted tool-use so the pane holds a busy state (spinner animates) and a COLLAPSIBLE tool row,
    // then finish the turn after the delay with a multi-line tool-result to expand.
    const delayMilliseconds = Number(
      process.env.INVAR_AGENT_ECHO_DELAY_MS ?? 0,
    );
    if (delayMilliseconds > 0) {
      this.emit({
        kind: 'tool-use',
        id: 'echo-demo-tool',
        name: 'Bash',
        input: {
          command: 'echo hello from the demo tool',
          note: 'scripted tool call for the agent-pane-ux smoke',
        },
      });
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null;
        this.emit({
          kind: 'tool-result',
          id: 'echo-demo-tool',
          result:
            'hello from the demo tool\nline two of the tool output\nline three of the tool output',
          isError: false,
        });
        this.emit({ kind: 'session-end', reason: 'completed' });
      }, delayMilliseconds);
      return;
    }
    this.emit({ kind: 'session-end', reason: 'completed' });
  }

  onEvent(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
  }

  interrupt(): void {
    this.clearPendingTimer();
    this.emit({ kind: 'session-end', reason: 'interrupted' });
  }

  dispose(): void {
    this.disposed = true;
    this.clearPendingTimer();
    this.eventCallback = null;
  }

  protected clearPendingTimer(): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  protected emit(event: AgentEvent): void {
    if (!this.disposed) this.eventCallback?.(event);
  }

  protected async handleTerminalToolPrompt(prompt: string): Promise<void> {
    const terminalTools = this.options.terminalTools;
    if (!terminalTools) {
      this.emit({
        kind: 'error',
        message: 'No integrated terminal tool port is attached.',
      });
      this.emit({ kind: 'session-end', reason: 'error' });
      return;
    }
    const bypassPermissions = AgentPermissions.Class.resolveLive(
      this.options.skipPermissions,
    );
    const definitions = AgentTerminalTools.Class.definitions(
      bypassPermissions,
      terminalTools,
    );
    if (prompt === 'terminal-tools:list') {
      this.emit({
        kind: 'text-delta',
        text: definitions
          .map((definition) => `${definition.name}: ${definition.description}`)
          .join('\n'),
      });
      this.emit({ kind: 'session-end', reason: 'completed' });
      return;
    }
    if (prompt === 'terminal-tools:read') {
      const definition = definitions.find(
        (candidate) => candidate.name === 'readTerminalInput',
      );
      const toolIdentifier = `echo-terminal-tool-${Date.now()}`;
      this.emit({
        kind: 'tool-use',
        id: toolIdentifier,
        name: 'readTerminalInput',
        input: {},
      });
      const result = definition
        ? await definition.invoke({})
        : 'readTerminalInput is unavailable.';
      this.emit({
        kind: 'tool-result',
        id: toolIdentifier,
        result,
        isError: !definition,
      });
      this.emit({ kind: 'session-end', reason: 'completed' });
      return;
    }
    const scrollbackMatch =
      /^terminal-tools:scrollback(?::(\d+)|:range:(\d+):(\d+))?$/.exec(prompt);
    if (scrollbackMatch) {
      const definition = definitions.find(
        (candidate) => candidate.name === 'readTerminalScrollback',
      );
      const toolIdentifier = `echo-terminal-tool-${Date.now()}`;
      const input = scrollbackMatch[1]
        ? { lineCount: Number(scrollbackMatch[1]) }
        : scrollbackMatch[2] && scrollbackMatch[3]
          ? {
              range: {
                startLine: Number(scrollbackMatch[2]),
                endLine: Number(scrollbackMatch[3]),
              },
            }
          : {};
      this.emit({
        kind: 'tool-use',
        id: toolIdentifier,
        name: 'readTerminalScrollback',
        input,
      });
      const result = definition
        ? await definition.invoke(input)
        : 'readTerminalScrollback is unavailable.';
      this.emit({
        kind: 'tool-result',
        id: toolIdentifier,
        result,
        isError: !definition,
      });
      this.emit({ kind: 'session-end', reason: 'completed' });
      return;
    }
    const match = /^terminal-tools:(stage|replace|run):(.*)$/s.exec(prompt);
    const toolName =
      match?.[1] === 'run'
        ? 'runTerminalCommand'
        : match?.[1] === 'replace'
          ? 'replaceTerminalInput'
          : match?.[1] === 'stage'
            ? 'stageTerminalCommand'
            : null;
    const definition = toolName
      ? definitions.find((candidate) => candidate.name === toolName)
      : null;
    const toolIdentifier = `echo-terminal-tool-${Date.now()}`;
    this.emit({
      kind: 'tool-use',
      id: toolIdentifier,
      name: toolName ?? 'unknownTerminalTool',
      input: { command: match?.[2] ?? '' },
    });
    if (!definition) {
      this.emit({
        kind: 'tool-result',
        id: toolIdentifier,
        result: `${toolName ?? 'The requested tool'} is unavailable in the current permission mode.`,
        isError: true,
      });
      this.emit({ kind: 'session-end', reason: 'completed' });
      return;
    }
    const encodedCommand = match?.[2] ?? '';
    const command = encodedCommand.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    const result = await definition.invoke({ command });
    this.emit({
      kind: 'tool-result',
      id: toolIdentifier,
      result,
      isError: false,
    });
    this.emit({ kind: 'session-end', reason: 'completed' });
  }
}

export namespace EchoAgentBackend {
  export const $Class = $EchoAgentBackend;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface EchoAgentOptions {
  terminalTools?: AgentTerminalToolPort;
  skipPermissions?: boolean | (() => boolean);
}
