// The real (subscription-billed) agent backend: it drives `claude -p --output-format stream-json`,
// reads the newline-delimited JSON event stream, and maps each object to an AgentEvent — the SAME seam
// the MockAgentBackend and EchoAgentBackend implement, so AgentSession and the pane are unchanged. This
// is phase 2 of the harness: the pane now talks to real Claude. Conversation continuity is preserved by
// capturing `session_id` from the init event and passing `--resume` on the next turn.
//
// The line→event MAPPING is a pure exported function (mapClaudeStreamEvent) tested against recorded
// fixtures; only the subprocess pumping is shell-bound (verified by driving). No ANSI anywhere.
//
// invariant: Agent events cross exactly one backend seam (src/modules/agent/agent.invariants.md)
// invariant: Process exit and stream closure are independent (src/modules/agent/agent.invariants.md)
// invariant: Every agent turn reaches a terminal state (src/modules/agent/agent.invariants.md)
import type { AgentBackend } from "./AgentBackend.interface";
import { AgentPermissions } from "./AgentPermissions";
import type { AgentEndReason, AgentEvent } from "./AgentEvents.interface";
import { ClaudeStreamMapping } from "./ClaudeStreamMapping";
import { Processes, type SpawnedProcess } from "../system/Processes";

class $CliStreamBackend implements AgentBackend {
  protected eventCallback: ((event: AgentEvent) => void) | null = null;
  protected child: CliStreamProcess | null = null;
  protected sessionId: string | null = null;
  protected streamEndReason: AgentEndReason | null = null;
  protected interrupting = false;
  protected disposed = false;
  /** Tail of the child's stderr, so a non-zero exit can surface a useful reason (e.g. not logged in). */
  protected stderrTail = "";

  constructor(protected readonly options: CliStreamOptions) {}

  protected authHintFor(stderr: string): string | null {
    const lower = stderr.toLowerCase();
    if (
      /not logged in|unauthenticated|no api key|authentication|login|oauth|credential|invalid.*key|401|unauthorized/.test(
        lower,
      )
    ) {
      return "Claude is not authenticated. Run `claude login` in a terminal (or set ANTHROPIC_API_KEY), then send again.";
    }
    return null;
  }

  send(prompt: string): void {
    if (this.disposed || this.child) return; // one turn at a time (AgentSession also guards this)
    this.streamEndReason = null;
    this.interrupting = false;
    this.stderrTail = "";
    const args = ["-p", prompt, "--output-format", "stream-json", "--verbose"];
    // Resolve the permission mode LIVE at send time so a Shift+Tab toggle since creation is honored.
    if (AgentPermissions.Class.resolveLive(this.options.skipPermissions))
      args.push("--dangerously-skip-permissions");
    if (this.options.model) args.push("--model", this.options.model);
    if (this.sessionId) args.push("--resume", this.sessionId); // continue the conversation
    let child: CliStreamProcess;
    try {
      child = this.spawn(args);
    } catch (error) {
      this.emit({
        kind: "error",
        message: `Failed to launch claude: ${String(error)}`,
      });
      this.emit({ kind: "session-end", reason: "error" });
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

  protected spawn(argumentsAfterExecutable: string[]): CliStreamProcess {
    return Processes.Class.spawn(
      [this.options.claudePath, ...argumentsAfterExecutable],
      {
        cwd: this.options.cwd,
        detached: true,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
      },
    );
  }

  protected async pumpStdout(child: CliStreamProcess): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for await (const chunk of child.stdout as AsyncIterable<Uint8Array>) {
        if (this.child !== child) return;
        buffer += decoder.decode(chunk, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          this.consumeLine(child, buffer.slice(0, newlineIndex));
          buffer = buffer.slice(newlineIndex + 1);
        }
      }
      this.consumeLine(child, buffer);
    } catch (error) {
      if (this.child === child && !this.interrupting && !this.disposed) {
        this.emit({ kind: "error", message: String(error) });
      }
    }
  }

  protected completeChildExit(
    child: CliStreamProcess,
    exitCode: number,
    exitError?: unknown,
  ): void {
    if (this.child !== child) return;
    this.child = null;
    if (this.disposed) return;
    const interrupted = this.interrupting;
    const reason = interrupted
      ? "interrupted"
      : (this.streamEndReason ?? (exitCode === 0 ? "completed" : "error"));
    if (!interrupted && reason === "error") {
      const hint = this.authHintFor(this.stderrTail);
      this.emit({
        kind: "error",
        message:
          hint ??
          (this.stderrTail.trim().slice(-400) ||
            (exitError ? String(exitError) : "claude exited with an error")),
      });
    }
    this.emit({ kind: "session-end", reason });
  }

  /** Drain the child's stderr into a bounded tail — never emitted verbatim unless the turn fails. */
  protected async drainStderr(child: CliStreamProcess): Promise<void> {
    if (!child.stderr) return;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of child.stderr as AsyncIterable<Uint8Array>) {
        this.stderrTail = (
          this.stderrTail + decoder.decode(chunk, { stream: true })
        ).slice(-2000);
      }
    } catch {
      /* stderr closed — ignore */
    }
  }

  protected consumeLine(child: CliStreamProcess, line: string): void {
    if (this.child !== child) return;
    const trimmed = line.trim();
    if (!trimmed) return;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return; // non-JSON diagnostic noise on stdout — ignore
    }
    const sessionId = ClaudeStreamMapping.Class.sessionIdOf(raw);
    if (sessionId) this.sessionId = sessionId; // captured for --resume on the next turn
    for (const event of ClaudeStreamMapping.Class.mapEvent(raw)) {
      if (event.kind === "session-end") {
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

  protected terminateChild(child: CliStreamProcess): void {
    if (process.platform !== "win32" && child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
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

export namespace CliStreamBackend {
  export const $Class = $CliStreamBackend;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface CliStreamOptions {
  claudePath: string;
  cwd?: string;
  skipPermissions?: boolean | (() => boolean);
  model?: string;
}

type CliStreamProcess = SpawnedProcess<"ignore", "pipe", "pipe">;
