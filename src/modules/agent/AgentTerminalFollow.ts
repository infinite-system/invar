import type { Ref } from 'vue';
import type { AgentTerminalFollowMode } from '../settings/Settings';
import type { AgentSession } from './AgentSession';

// invariant: Terminal follow obeys the live user mode (src/modules/agent/agent.invariants.md)
class $AgentTerminalFollow {
  protected readonly stopObservation: () => void;
  protected disposed = false;

  constructor(
    protected readonly session: AgentSession.Model,
    protected readonly observationPort: AgentTerminalObservationPort,
    readonly mode: Ref<AgentTerminalFollowMode>,
    protected readonly onModeChanged: () => void = () => {},
  ) {
    this.stopObservation = this.observationPort.onTerminalObservation((event) =>
      this.observe(event),
    );
  }

  get currentMode(): AgentTerminalFollowMode {
    return this.mode.value;
  }

  cycle(): AgentTerminalFollowMode {
    const agentTerminalFollowClass = this
      .constructor as typeof $AgentTerminalFollow;
    this.mode.value = agentTerminalFollowClass.nextMode(this.mode.value);
    this.onModeChanged();
    return this.mode.value;
  }

  label(): string {
    const agentTerminalFollowClass = this
      .constructor as typeof $AgentTerminalFollow;
    return agentTerminalFollowClass.labelFor(this.mode.value);
  }

  static nextMode(mode: AgentTerminalFollowMode): AgentTerminalFollowMode {
    const currentIndex = this.MODE_ORDER.indexOf(mode);
    const nextIndex =
      currentIndex < 0 ? 0 : (currentIndex + 1) % this.MODE_ORDER.length;
    return this.MODE_ORDER[nextIndex]!;
  }

  static labelFor(mode: AgentTerminalFollowMode): string {
    switch (mode) {
      case 'follow-all':
        return 'follow';
      case 'on-error':
        return 'on-error';
      case 'on-request':
        return 'on-request';
      case 'off':
        return 'off';
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopObservation();
  }

  protected observe(event: AgentTerminalObservation): void {
    if (this.disposed || this.observationPort.terminalExited) return;
    const modeAtCommandBoundary = this.mode.value;
    if (modeAtCommandBoundary === 'off') return;
    const message = this.observationMessage(event);
    if (modeAtCommandBoundary === 'on-request') {
      this.session.ingestContext(message);
      return;
    }
    if (
      modeAtCommandBoundary === 'on-error' &&
      (event.exitCode === null || event.exitCode === 0)
    ) {
      return;
    }
    this.session.requestExternalResponse(message);
  }

  protected observationMessage(event: AgentTerminalObservation): string {
    const deliveredLines = [
      ...event.output.headLines,
      ...event.output.tailLines,
    ];
    const omittedLineCount = Math.max(
      0,
      event.output.totalLines - deliveredLines.length,
    );
    const outputLines = [
      ...event.output.headLines,
      ...(omittedLineCount > 0
        ? [`… ${omittedLineCount} output lines omitted …`]
        : []),
      ...event.output.tailLines,
    ];
    return [
      '[terminal command completed]',
      `command: ${event.command}`,
      `cwd: ${event.cwd || '<unknown>'}`,
      `exit code: ${event.exitCode === null ? 'unknown' : event.exitCode}`,
      `boundary: ${event.boundarySource}`,
      `output (${event.output.totalLines} lines${event.output.truncated ? ', truncated' : ''}):`,
      ...(outputLines.length > 0 ? outputLines : ['<no output>']),
    ].join('\n');
  }

  protected static get MODE_ORDER(): readonly AgentTerminalFollowMode[] {
    return ['follow-all', 'on-error', 'on-request', 'off'];
  }
}

export namespace AgentTerminalFollow {
  export const $Class = $AgentTerminalFollow;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface AgentTerminalObservationPort {
  /** Read at delivery time so output parsed after process death cannot start a misleading turn. */
  readonly terminalExited: boolean;
  onTerminalObservation(
    callback: (event: AgentTerminalObservation) => void,
  ): () => void;
}

export interface AgentTerminalObservation {
  readonly command: string;
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly boundarySource: 'osc133' | 'heuristic';
  readonly output: {
    readonly headLines: readonly string[];
    readonly tailLines: readonly string[];
    readonly totalLines: number;
    readonly truncated: boolean;
  };
}
