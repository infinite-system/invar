import { Static } from 'ivue/extras';
import type { AgentEvent } from './AgentEvents.interface';

// invariant: An agent session is a structured event stream, not a screen (src/modules/agent/agent.invariants.md)

class $CodexStreamMapping {
  /** Best-effort text extraction from a codex item (string field under a few likely names). */
  protected static itemText(item: Record<string, unknown>): string {
    const candidate = item.text ?? item.message ?? item.content;
    return typeof candidate === 'string'
      ? candidate
      : candidate == null
        ? ''
        : JSON.stringify(candidate);
  }

  /** Map ONE parsed codex stream-json object to zero or more AgentEvents. Pure and total. */
  static mapEvent(raw: unknown): AgentEvent[] {
    if (!raw || typeof raw !== 'object') return [];
    const record = raw as Record<string, unknown>;
    switch (record.type) {
      case 'thread.started':
        return [{ kind: 'session-start' }];
      case 'turn.completed':
        return [{ kind: 'session-end', reason: 'completed' }];
      case 'turn.failed': {
        const message = (record.error as { message?: unknown })?.message;
        const events: AgentEvent[] = [];
        if (typeof message === 'string' && message)
          events.push({ kind: 'error', message });
        events.push({ kind: 'session-end', reason: 'error' });
        return events;
      }
      case 'error': {
        const message =
          typeof record.message === 'string' ? record.message : 'codex error';
        return [{ kind: 'error', message }];
      }
      case 'item.completed': {
        const item = record.item;
        if (!item || typeof item !== 'object') return [];
        const itemRecord = item as Record<string, unknown>;
        switch (itemRecord.type) {
          case 'assistant_message':
          case 'agent_message': {
            const text = this.itemText(itemRecord);
            return text ? [{ kind: 'text-delta', text }] : [];
          }
          case 'command_execution': {
            const id = String(itemRecord.id ?? '');
            const command = itemRecord.command ?? itemRecord.parsed_cmd ?? '';
            const output =
              itemRecord.aggregated_output ?? itemRecord.output ?? '';
            const events: AgentEvent[] = [
              { kind: 'tool-use', id, name: 'command', input: command },
            ];
            const resultText =
              typeof output === 'string' ? output : JSON.stringify(output);
            events.push({
              kind: 'tool-result',
              id,
              result: resultText,
              isError:
                itemRecord.exit_code != null && itemRecord.exit_code !== 0,
            });
            return events;
          }
          case 'error': {
            const text = this.itemText(itemRecord);
            return text ? [{ kind: 'error', message: text }] : [];
          }
          default:
            return []; // reasoning, file_change, todo_list, web_search, … not projected in tier S
        }
      }
      default:
        return []; // turn.started, item.started/updated, and unknowns
    }
  }

  /** The thread id from a thread.started event (captured by the backend for `codex exec resume`). */
  static threadIdOf(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as Record<string, unknown>;
    if (
      record.type === 'thread.started' &&
      typeof record.thread_id === 'string'
    )
      return record.thread_id;
    return null;
  }
}

export namespace CodexStreamMapping {
  export const $Class = Static($CodexStreamMapping);
  export const Class = $Class;
}
