import { Static } from 'ivue/extras';
import type { AgentEvent } from './AgentEvents.interface';

// invariant: An agent session is a structured event stream, not a screen (src/modules/agent/agent.invariants.md)

class $ClaudeStreamMapping {
  /** Extract plain text from a tool_result block's `content` (a string, or an array of text parts). */
  protected static toolResultText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) =>
          part && typeof part === 'object' && 'text' in part
            ? String((part as { text?: unknown }).text ?? '')
            : '',
        )
        .join('');
    }
    return '';
  }

  /** Map ONE parsed claude stream-json object to zero or more AgentEvents. Pure and total. */
  static mapEvent(raw: unknown): AgentEvent[] {
    if (!raw || typeof raw !== 'object') return [];
    const record = raw as Record<string, unknown>;
    switch (record.type) {
    case 'system':
      return record.subtype === 'init' ? [{ kind: 'session-start' }] : [];
    case 'assistant': {
      const content = (record.message as { content?: unknown })?.content;
      if (!Array.isArray(content)) return [];
      const events: AgentEvent[] = [];
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const part = block as Record<string, unknown>;
        if (part.type === 'text' && typeof part.text === 'string' && part.text) {
          events.push({ kind: 'text-delta', text: part.text });
        } else if (part.type === 'tool_use') {
          events.push({ kind: 'tool-use', id: String(part.id ?? ''), name: String(part.name ?? 'tool'), input: part.input });
        }
      }
      return events;
    }
    case 'user': {
      const content = (record.message as { content?: unknown })?.content;
      if (!Array.isArray(content)) return [];
      const events: AgentEvent[] = [];
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const part = block as Record<string, unknown>;
        if (part.type === 'tool_result') {
          events.push({
            kind: 'tool-result',
            id: String(part.tool_use_id ?? ''),
            result: this.toolResultText(part.content),
            isError: part.is_error === true,
          });
        }
      }
      return events;
    }
    case 'result':
      return [{ kind: 'session-end', reason: record.is_error === true ? 'error' : 'completed' }];
    default:
      return [];
    }
  }

  /** Whether an init object carries a session id (captured by the backend for `--resume`). */
  static sessionIdOf(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as Record<string, unknown>;
    if (
      record.type === 'system' &&
      record.subtype === 'init' &&
      typeof record.session_id === 'string'
    ) {
      return record.session_id;
    }
    return null;
  }
}

export namespace ClaudeStreamMapping {
  export const $Class = $ClaudeStreamMapping;
  export const Class = Static($ClaudeStreamMapping);
}
