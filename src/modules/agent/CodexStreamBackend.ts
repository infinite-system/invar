// The Codex (subscription/API-billed) agent backend: drives `codex exec --json`, reads the
// newline-delimited JSON event stream, and maps each object to an AgentEvent behind the SAME one
// backend seam as CliStreamBackend (Claude) — so AgentSession and the pane are unchanged. The neutral
// `agentSkipPermissions` maps to codex's `--dangerously-bypass-approvals-and-sandbox`; `agentModel` to
// `-m`. The line→event mapping is the pure, tested CodexStreamMapping.
//
// STATUS: envelope drive-verified; item-level mapping + turn continuity are best-effort pending a live
// run (codex was out of usage credits at build, resets 2026-07-28). v1 is stateless per turn (no
// resume) to avoid guessing the resume CLI shape before it can be verified.
//
// invariant: Agent events cross exactly one backend seam (src/modules/agent/agent.invariants.md)
// invariant: Process exit and stream closure are independent (src/modules/agent/agent.invariants.md)
// invariant: Every agent turn reaches a terminal state (src/modules/agent/agent.invariants.md)
// invariant: Every agent backend session begins from the IBR foundation (src/modules/agent/agent.invariants.md)
import type { AgentBackend } from './AgentBackend.interface';
import { AgentPermissions } from './AgentPermissions';
import type { AgentEndReason, AgentEvent } from './AgentEvents.interface';
import { CodexStreamMapping } from './CodexStreamMapping';
import { Processes, type SpawnedProcess } from '../system/Processes';

class $CodexStreamBackend implements AgentBackend {
  constructor(protected readonly options: CodexStreamOptions) {}

  readonly ibrFoundationDelivery = 'prepend-every-prompt';

  protected eventCallback: ((event: AgentEvent) => void) | null = null;
  protected child: CodexStreamProcess | null = null;
  protected threadId: string | null = null;
  protected streamEndReason: AgentEndReason | null = null;
  protected interrupting = false;
  protected disposed = false;
  protected stderrTail = '';

  send(prompt: string): void {
    if (this.disposed || this.child) return;
    this.streamEndReason = null;
    this.interrupting = false;
    this.stderrTail = '';
    const args = ['exec', '--json', '--skip-git-repo-check'];
    // Resolve the permission mode LIVE at send time so a Shift+Tab toggle since creation is honored.
    if (AgentPermissions.Class.resolveLive(this.options.skipPermissions))
      args.push('--dangerously-bypass-approvals-and-sandbox');
    if (this.options.model) args.push('-m', this.options.model);
    args.push(prompt); // prompt as the final positional argument
    let child: CodexStreamProcess;
    try {
      child = this.spawn(args);
    } catch (error) {
      this.emit({
        kind: 'error',
        message: `Failed to launch codex: ${String(error)}`,
      });
      this.emit({ kind: 'session-end', reason: 'error' });
      return;
    }
    this.child = child;
    void this.pumpStdout(child);
    void this.drainStderr(child);
    void child.exited.then(
      (exitCode) => this.completeChildExit(child, exitCode),
      (error) => this.completeChildExit(child, -1, error),
    );
  }

  protected spawn(argumentsAfterExecutable: string[]): CodexStreamProcess {
    return Processes.Class.spawn(
      [this.options.codexPath, ...argumentsAfterExecutable],
      {
        cwd: this.options.cwd,
        detached: true,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
      },
    );
  }

  protected async pumpStdout(child: CodexStreamProcess): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for await (const chunk of child.stdout as AsyncIterable<Uint8Array>) {
        if (this.child !== child) return;
        buffer += decoder.decode(chunk, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          this.consumeLine(child, buffer.slice(0, newlineIndex));
          buffer = buffer.slice(newlineIndex + 1);
        }
      }
      this.consumeLine(child, buffer);
    } catch (error) {
      if (this.child === child && !this.interrupting && !this.disposed) {
        this.emit({ kind: 'error', message: String(error) });
      }
    }
  }

  protected completeChildExit(
    child: CodexStreamProcess,
    exitCode: number,
    exitError?: unknown,
  ): void {
    if (this.child !== child) return;
    this.child = null;
    if (this.disposed) return;
    const interrupted = this.interrupting;
    const reason = interrupted
      ? 'interrupted'
      : (this.streamEndReason ?? (exitCode === 0 ? 'completed' : 'error'));
    if (!interrupted && reason === 'error') {
      this.emit({
        kind: 'error',
        message:
          this.stderrTail.trim().slice(-400) ||
          (exitError ? String(exitError) : 'codex exited with an error'),
      });
    }
    this.emit({ kind: 'session-end', reason });
  }

  protected async drainStderr(child: CodexStreamProcess): Promise<void> {
    if (!child.stderr) return;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of child.stderr as AsyncIterable<Uint8Array>) {
        this.stderrTail = (
          this.stderrTail + decoder.decode(chunk, { stream: true })
        ).slice(-2000);
      }
    } catch {
      /* ignore */
    }
  }

  protected consumeLine(child: CodexStreamProcess, line: string): void {
    if (this.child !== child) return;
    const trimmed = line.trim();
    if (!trimmed) return;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return;
    }
    const threadId = CodexStreamMapping.Class.threadIdOf(raw);
    if (threadId) this.threadId = threadId;
    for (const event of CodexStreamMapping.Class.mapEvent(raw)) {
      if (event.kind === 'session-end') {
        this.streamEndReason = event.reason;
        this.terminateChild(child);
      } else {
        this.emit(event);
      }
    }
  }

  onEvent(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
  }

  interrupt(): void {
    if (this.child) {
      this.interrupting = true;
      this.terminateChild(this.child);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.child) this.terminateChild(this.child);
    this.child = null;
    this.eventCallback = null;
  }

  protected terminateChild(child: CodexStreamProcess): void {
    if (process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
        return;
      } catch {
        /* the child may already have exited; the direct handle is the fallback */
      }
    }
    child.kill();
  }

  protected emit(event: AgentEvent): void {
    if (!this.disposed) this.eventCallback?.(event);
  }
}

export namespace CodexStreamBackend {
  export const $Class = $CodexStreamBackend;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface CodexStreamOptions {
  codexPath: string;
  cwd?: string;
  skipPermissions?: boolean | (() => boolean);
  model?: string;
}

type CodexStreamProcess = SpawnedProcess<'ignore', 'pipe', 'pipe'>;
