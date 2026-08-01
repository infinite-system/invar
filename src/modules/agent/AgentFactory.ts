import { Static } from 'ivue/extras';
import type { AgentBackend } from './AgentBackend.interface';
import { EchoAgentBackend } from './EchoAgentBackend';
import { CliStreamBackend } from './CliStreamBackend';
import { CodexStreamBackend } from './CodexStreamBackend';
import { SdkStreamBackend } from './SdkStreamBackend';
import { AgentProviderRegistry } from './AgentProviderRegistry';
import { CodexAppServerBackend } from './CodexAppServerBackend';
import { AgentSession } from './AgentSession';
import { AgentPaneContent } from './AgentPaneContent';
import type { AgentProvider } from '../settings/Settings';
import type { AgentTerminalToolPort } from './AgentTerminalTools';
import {
  AgentIbrFoundation,
  type AgentIbrFoundationResolution,
} from './AgentIbrFoundation';

// invariant: Agent events cross exactly one backend seam (src/modules/agent/agent.invariants.md)
// invariant: One session is one Reactive instance (src/modules/agent/agent.invariants.md)

class $AgentFactory {
  /** Pick the backend by provider setting + CLI availability. Claude now rides the SDK backend
   *  (SdkStreamBackend — interactive permission prompts in ask-mode, bypass resolved live per turn). */
  static createBackend(options: AgentCreateOptions): AgentBackend {
    const ibrFoundation =
      options.ibrFoundation !== undefined
        ? options.ibrFoundation
        : AgentIbrFoundation.Class.resolve(options.cwd ?? process.cwd());
    if (process.env.INVAR_AGENT_BACKEND === 'echo') {
      return new EchoAgentBackend.Class({
        terminalTools: options.terminalTools,
        skipPermissions: options.skipPermissions,
      });
    }
    const resolved = AgentProviderRegistry.Class.resolve(options.provider);
    const skipPermissions = options.skipPermissions ?? true;
    const model = options.model || undefined;
    if (resolved.engine === 'claude') {
      return process.env.INVAR_AGENT_BACKEND === 'cli'
        ? new CliStreamBackend.Class({
            claudePath: resolved.binaryPath,
            cwd: options.cwd,
            ibrFoundationPath: ibrFoundation?.path,
            skipPermissions,
            model,
          })
        : new SdkStreamBackend.Class({
            cwd: options.cwd,
            ibrFoundationContent: ibrFoundation?.content,
            skipPermissions,
            model,
            terminalTools: options.terminalTools,
          });
    }
    if (resolved.engine === 'codex') {
      return process.env.INVAR_AGENT_BACKEND === 'cli'
        ? new CodexStreamBackend.Class({
            codexPath: resolved.binaryPath,
            cwd: options.cwd,
            skipPermissions,
            model,
          })
        : new CodexAppServerBackend.Class({
            codexPath: resolved.binaryPath,
            cwd: options.cwd,
            skipPermissions,
            model,
            terminalTools: options.terminalTools,
          });
    }
    return new EchoAgentBackend.Class({
      terminalTools: options.terminalTools,
      skipPermissions: options.skipPermissions,
    });
  }

  /** Wire backend + session into a ready AgentPaneContent. */
  static create(options: AgentCreateOptions = {}): AgentPaneContent.Model {
    const ibrFoundation =
      options.ibrFoundation !== undefined
        ? options.ibrFoundation
        : AgentIbrFoundation.Class.resolve(options.cwd ?? process.cwd());
    const backend =
      options.backend ?? this.createBackend({ ...options, ibrFoundation });
    const session = new AgentSession.Class(
      backend,
      AgentProviderRegistry.Class.resolve(options.provider).engine,
      options.cwd ?? process.cwd(),
      ibrFoundation,
    );
    return new AgentPaneContent.Class(session, {
      identifier: options.identifier,
      label: options.label,
      onExit: options.onExit,
    });
  }
}

export namespace AgentFactory {
  export const $Class = Static($AgentFactory);
  export let Class = $Class;
}

export interface AgentCreateOptions {
  identifier?: string;
  label?: string;
  onExit?: (identifier: string) => void;
  /** Inject a specific backend (tests pass a MockAgentBackend; a host may pass any implementation). */
  backend?: AgentBackend;
  /** The workspace root — the cwd the real agent CLI runs in, so it operates in the user's project. */
  cwd?: string;
  /** Which engine to use ('auto' picks the first CLI on PATH, Claude preferred). */
  provider?: AgentProvider;
  /** Run the agent without permission prompts (provider-neutral; each backend maps it to its flag).
   *  Pass a GETTER (`() => setting.value`) so a live Shift+Tab toggle is honored on the next turn. */
  skipPermissions?: boolean | (() => boolean);
  /** Model override; empty uses the provider default. */
  model?: string;
  /** Visible integrated-terminal tools exposed to the model through each provider's native tool path. */
  terminalTools?: AgentTerminalToolPort;
  /** Resolved once per workspace and shared by backend construction and session parity. */
  ibrFoundation?: AgentIbrFoundationResolution | null;
}
