// The Claude Agent SDK backend — the interactive-approval path the AgentBackend seam anticipated
// ("ClaudeSdkBackend"). It drives @anthropic-ai/claude-agent-sdk's query() (which wraps the bundled CLI,
// so the user's subscription OAuth works headless) and maps each SDK message through the SAME
// ClaudeStreamMapping the CLI backend uses — the SDK yields the very objects `--output-format
// stream-json` prints, so there is ONE Claude dialect translation, not a fork.
//
// PERMISSIONS are the point of this backend: in ask-mode it passes canUseTool, which PAUSES a gated tool
// call until the user answers; the pause surfaces as a 'permission-request' AgentEvent whose respond()
// resolves the SDK callback (allow runs the tool, deny blocks it and the turn continues with the denial
// visible to the agent). 'always-allow' adds the tool to a session-scoped auto-allow set so future calls
// skip the prompt. In bypass-mode it runs permissionMode 'bypassPermissions' with no gating. The mode is
// resolved LIVE per send() (each turn is a fresh query() resumed by session id), so a Shift+Tab toggle
// takes effect on the next turn — one backend for both modes, never a frozen creation-time choice.
//
// SDK REALITIES (verified by driving on this box): subscription auth works headless (apiKeySource
// "none"); an auto-mode classifier approves SAFE read-only commands without consulting canUseTool (only
// consequential calls prompt — no prompt spam); bare `allowedTools` entries would SHADOW canUseTool, so
// this backend never passes them.
//
// invariant: Agent events cross exactly one backend seam (src/modules/agent/agent.invariants.md)
// invariant: Every agent turn reaches a terminal state (src/modules/agent/agent.invariants.md)
import {
  createSdkMcpServer,
  query,
  tool,
  type Query,
  type PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { AgentBackend } from "./AgentBackend.interface";
import { AgentPermissions } from "./AgentPermissions";
import type {
  AgentEndReason,
  AgentEvent,
  PermissionDecision,
} from "./AgentEvents.interface";
import { ClaudeStreamMapping } from "./ClaudeStreamMapping";
import {
  AgentTerminalTools,
  type AgentTerminalToolPort,
} from "./AgentTerminalTools";

class $SdkStreamBackend implements AgentBackend {
  readonly supportsPermissionPrompts = true;

  protected eventCallback: ((event: AgentEvent) => void) | null = null;
  protected activeQuery: Query | null = null;
  protected sessionId: string | null = null;
  protected streamEndReason: AgentEndReason | null = null;
  protected interrupting = false;
  protected disposed = false;
  /** Session-scoped auto-allow: tools the user answered 'always-allow' for — future calls skip the prompt. */
  protected readonly autoAllowedTools = new Set<string>();
  protected permissionRequestCounter = 0;

  constructor(protected readonly options: SdkStreamOptions) {}

  send(prompt: string): void {
    if (this.disposed || this.activeQuery) return; // one turn at a time (AgentSession also guards this)
    this.streamEndReason = null;
    this.interrupting = false;
    const bypass = AgentPermissions.Class.resolveLive(
      this.options.skipPermissions,
    );
    const terminalToolDefinitions = this.options.terminalTools
      ? AgentTerminalTools.Class.definitions(bypass, this.options.terminalTools)
      : [];
    const terminalToolServer =
      terminalToolDefinitions.length > 0
        ? createSdkMcpServer({
            name: "invar-terminal",
            version: "1.0.0",
            alwaysLoad: true,
            tools: terminalToolDefinitions.map((definition) =>
              tool(
                definition.name,
                definition.description,
                definition.requiresCommand
                  ? { command: z.string() }
                  : definition.name === "readTerminalScrollback"
                    ? {
                        lineCount: z.number().int().positive().optional(),
                        range: z
                          .object({
                            startLine: z.number().int().positive(),
                            endLine: z.number().int().positive(),
                          })
                          .optional(),
                      }
                    : {},
                async (input) => ({
                  content: [
                    { type: "text", text: await definition.invoke(input) },
                  ],
                }),
                { alwaysLoad: true },
              ),
            ),
          })
        : null;
    let turn: Query;
    try {
      turn = query({
        prompt,
        options: {
          cwd: this.options.cwd,
          model: this.options.model || undefined,
          resume: this.sessionId ?? undefined,
          ...(terminalToolServer
            ? { mcpServers: { "invar-terminal": terminalToolServer } }
            : {}),
          ...(bypass
            ? {
                permissionMode: "bypassPermissions" as const,
                allowDangerouslySkipPermissions: true,
              }
            : {
                permissionMode: "default" as const,
                canUseTool: (toolName, input) =>
                  this.gateToolCall(toolName, input),
              }),
        },
      });
    } catch (error) {
      this.emit({
        kind: "error",
        message: `Failed to start the Claude SDK session: ${String(error)}`,
      });
      this.emit({ kind: "session-end", reason: "error" });
      return;
    }
    this.activeQuery = turn;
    void this.pump(turn);
  }

  /** The SDK's canUseTool: pause the gated call as a 'permission-request' event until respond() answers.
   *  Auto-allowed tools (a previous 'always-allow') resolve immediately with no prompt. */
  protected async gateToolCall(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<PermissionResult> {
    if (this.disposed) return { behavior: "deny", message: "Session closed" };
    if (AgentTerminalTools.Class.isLowPermissionToolName(toolName)) {
      return { behavior: "allow", updatedInput: input };
    }
    if (this.autoAllowedTools.has(toolName))
      return { behavior: "allow", updatedInput: input };
    return new Promise<PermissionResult>((resolve) => {
      this.permissionRequestCounter += 1;
      const id = `permission-${this.permissionRequestCounter}`;
      let settled = false;
      this.emit({
        kind: "permission-request",
        id,
        toolName,
        input,
        respond: (decision: PermissionDecision) => {
          if (settled) return; // exactly-once (the session also guards, belt and braces)
          settled = true;
          if (decision === "always-allow") this.autoAllowedTools.add(toolName);
          resolve(
            decision === "deny"
              ? { behavior: "deny", message: "The user denied this tool call." }
              : { behavior: "allow", updatedInput: input },
          );
        },
      });
    });
  }

  protected async pump(turn: Query): Promise<void> {
    let streamFailed = false;
    try {
      for await (const message of turn) {
        if (this.activeQuery !== turn) return;
        const sessionId = ClaudeStreamMapping.Class.sessionIdOf(message);
        if (sessionId) this.sessionId = sessionId; // captured for `resume` on the next turn
        for (const event of ClaudeStreamMapping.Class.mapEvent(message)) {
          if (event.kind === "session-end") {
            this.streamEndReason = event.reason;
            if (this.activeQuery !== turn) return;
            this.activeQuery = null;
            this.emit(event);
            return;
          } else {
            this.emit(event);
          }
        }
      }
    } catch (error) {
      streamFailed = true;
      if (this.activeQuery === turn && !this.interrupting && !this.disposed) {
        this.emit({ kind: "error", message: String(error) });
      }
    }
    if (this.activeQuery !== turn) return;
    this.activeQuery = null;
    if (!this.disposed) {
      this.emit({
        kind: "session-end",
        reason: this.interrupting
          ? "interrupted"
          : (this.streamEndReason ?? (streamFailed ? "error" : "completed")),
      });
    }
  }

  onEvent(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
  }

  interrupt(): void {
    if (this.activeQuery) {
      const interruptedQuery = this.activeQuery;
      this.interrupting = true;
      // Detach the stream before awaiting SDK teardown: cancellation is immediately reusable even if
      // the SDK's internal child takes time to acknowledge the abort. The pump's identity guard drops
      // every late message from this query.
      this.activeQuery = null;
      void interruptedQuery.interrupt().catch(() => {
        /* already ending — the local terminal event was still emitted exactly once */
      });
      this.emit({ kind: "session-end", reason: "interrupted" });
    }
  }

  dispose(): void {
    this.disposed = true;
    void this.activeQuery?.interrupt().catch(() => {
      /* already gone */
    });
    this.activeQuery = null;
    this.eventCallback = null;
  }

  protected emit(event: AgentEvent): void {
    if (!this.disposed) this.eventCallback?.(event);
  }
}

export namespace SdkStreamBackend {
  export const $Class = $SdkStreamBackend;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface SdkStreamOptions {
  cwd?: string;
  skipPermissions?: boolean | (() => boolean);
  model?: string;
  terminalTools?: AgentTerminalToolPort;
}
