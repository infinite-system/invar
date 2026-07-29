// The one place terminal command events become human-readable notes. It lives with the terminal
// because the vocabulary (staged, replaced-then-staged, rejected with Ctrl+C) is terminal language;
// the host only relays the finished string to whatever surface shows notes.
import { Static } from 'ivue/extras';
import type { TerminalCommandEvent } from './TerminalCommandController';

class $TerminalCommandNote {
  static textFor(event: TerminalCommandEvent): string {
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
  }
}

export namespace TerminalCommandNote {
  export const $Class = Static($TerminalCommandNote);
  export let Class = $Class;
}
