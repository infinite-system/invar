import { Static } from 'ivue/extras';

// invariant: Seams are drawn at the shared generator (project.invariants.md)
// invariant: Terminal tools have explicit permission tiers (src/modules/agent/agent.invariants.md)
class $AgentTerminalTools {
  static get readTerminalInputDescription(): string {
    return "Read the user's current terminal command and about 40 recent terminal output lines without changing anything. Use this before fixing a command; when a correction is needed, call replaceTerminalInput with the complete replacement.";
  }

  static get stageTerminalCommandDescription(): string {
    return 'Default courtesy for terminal work. Use stageTerminalCommand when a command should be visible for human review: Invar sanitizes the full command before writing any byte, waits until the terminal prompt is idle and its input buffer is empty, then types it into the real shell without Enter. The terminal header shows the cwd where it will run. The user may edit the real readline buffer, press Enter to execute, or press Ctrl+C to reject; Ctrl+C during animated typing aborts the staging. Prefer this tool unless the user has explicitly allowed autonomous execution.';
  }

  static get runTerminalCommandDescription(): string {
    return 'Use runTerminalCommand only when the current allow/bypass permission mode authorizes autonomous execution. Invar uses the same visible, sanitized terminal pathway as staging, waits for an idle prompt and empty input buffer, types the command where the terminal header cwd says it will run, then sends Enter itself after the entire command is present. The user can press Ctrl+C during animated typing to abort before execution. In ask mode this tool is unavailable; use stageTerminalCommand so Enter remains the human grant.';
  }

  static get replaceTerminalInputDescription(): string {
    return "Fix the user's current command without executing it. Invar sends exactly one Ctrl+U to clear the readline input, sanitizes the complete replacement, then uses the same grapheme-safe visible staging path as stageTerminalCommand. No Enter is sent; the user may edit, execute, or reject the replacement.";
  }

  static definitions(
    bypassPermissions: boolean,
    terminal: AgentTerminalToolPort,
  ): AgentTerminalToolDefinition[] {
    const definitions: AgentTerminalToolDefinition[] = [
      this.readDefinition(terminal),
      this.commandDefinition(
        'stageTerminalCommand',
        this.stageTerminalCommandDescription,
        (command) => terminal.stageTerminalCommand(command),
      ),
      this.commandDefinition(
        'replaceTerminalInput',
        this.replaceTerminalInputDescription,
        (command) => terminal.replaceTerminalInput(command),
      ),
    ];
    if (bypassPermissions) {
      definitions.push(
        this.commandDefinition(
          'runTerminalCommand',
          this.runTerminalCommandDescription,
          (command) => terminal.runTerminalCommand(command),
        ),
      );
    }
    return definitions;
  }

  static definitionFor(
    name: string,
    bypassPermissions: boolean,
    terminal: AgentTerminalToolPort,
  ): AgentTerminalToolDefinition | null {
    return this.definitions(bypassPermissions, terminal).find(
      (definition) => definition.name === name,
    ) ?? null;
  }

  static isStageToolName(name: string): boolean {
    return name === 'stageTerminalCommand' || name.endsWith('__stageTerminalCommand');
  }

  static isLowPermissionToolName(name: string): boolean {
    return [
      'readTerminalInput',
      'stageTerminalCommand',
      'replaceTerminalInput',
    ].some((toolName) => name === toolName || name.endsWith(`__${toolName}`));
  }

  protected static readDefinition(
    terminal: AgentTerminalToolPort,
  ): AgentTerminalToolDefinition {
    return {
      name: 'readTerminalInput',
      description: this.readTerminalInputDescription,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      requiresCommand: false,
      invoke: async () => {
        const snapshot = terminal.readTerminalInput();
        return [
          'Recent terminal output:',
          ...snapshot.recentOutputLines,
          `Current terminal input: ${snapshot.currentInputLine ?? '<unavailable>'}`,
        ].join('\n');
      },
    };
  }

  protected static commandDefinition(
    name: Exclude<AgentTerminalToolName, 'readTerminalInput'>,
    description: string,
    invokeCommand: (command: string) => Promise<AgentTerminalCommandResult>,
  ): AgentTerminalToolDefinition {
    return {
      name,
      description,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['command'],
        properties: {
          command: {
            type: 'string',
            description: 'The single shell command to sanitize and type into the visible terminal.',
          },
        },
      },
      requiresCommand: true,
      invoke: async (input) => {
        if (
          typeof input !== 'object'
          || input === null
          || typeof (input as { command?: unknown }).command !== 'string'
        ) {
          return 'The command argument must be a string.';
        }
        const result = await invokeCommand((input as { command: string }).command);
        if (result.state === 'queued') {
          return `Queued until the terminal prompt is idle: ${result.command}`;
        }
        if (result.state === 'staged' && name === 'replaceTerminalInput') {
          return `Replaced the previous readline input and staged without Enter: ${result.command}`;
        }
        if (result.state === 'staged') {
          return `Staged without Enter for the user to edit, execute, or reject: ${result.command}`;
        }
        if (result.state === 'executed') {
          return `Typed visibly and sent Enter after the complete command: ${result.command}`;
        }
        if (result.state === 'aborted') {
          return `Aborted by user input before Enter; nothing executed: ${result.command}`;
        }
        return 'The sanitized command was empty, so nothing was written.';
      },
    };
  }
}

export namespace AgentTerminalTools {
  export const $Class = $AgentTerminalTools;
  export const Class = Static($Class);
}

export type AgentTerminalToolName =
  | 'readTerminalInput'
  | 'stageTerminalCommand'
  | 'replaceTerminalInput'
  | 'runTerminalCommand';

export interface AgentTerminalCommandResult {
  state: 'queued' | 'staged' | 'executed' | 'aborted' | 'rejected-empty';
  command: string;
}

export interface AgentTerminalToolPort {
  readTerminalInput(): AgentTerminalInputSnapshot;
  stageTerminalCommand(command: string): Promise<AgentTerminalCommandResult>;
  replaceTerminalInput(command: string): Promise<AgentTerminalCommandResult>;
  runTerminalCommand(command: string): Promise<AgentTerminalCommandResult>;
}

export interface AgentTerminalInputSnapshot {
  currentInputLine: string | null;
  recentOutputLines: readonly string[];
}

export interface AgentTerminalToolDefinition {
  name: AgentTerminalToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  requiresCommand: boolean;
  invoke(input: unknown): Promise<string>;
}
