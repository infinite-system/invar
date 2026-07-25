import { Static } from 'ivue/extras';
import type { TranscriptEntry } from './AgentEvents.interface';

// invariant: The transcript is the single source of agent session truth (src/modules/agent/agent.invariants.md)
// invariant: Seams are drawn at the shared generator (project.invariants.md)

class $TranscriptContextSerializer {
  static get defaultBudgetCharacters(): number {
    return 4000;
  }

  protected static clip(text: string, limit: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  const codePoints = Array.from(collapsed);
  return codePoints.length <= limit ? collapsed : codePoints.slice(0, Math.max(0, limit - 1)).join('') + '…';
}

/** One transcript entry → one preamble line (or null to skip: system notes, empty text). */
  protected static lineFor(entry: TranscriptEntry): string | null {
  switch (entry.role) {
    case 'user':
      return entry.text.trim() ? `User: ${this.clip(entry.text, 600)}` : null;
    case 'assistant':
      return entry.text.trim() ? `Assistant: ${this.clip(entry.text, 800)}` : null;
    case 'tool-use': {
      const input = typeof entry.input === 'string' ? entry.input : JSON.stringify(entry.input) ?? '';
      return `(tool ${entry.name}: ${this.clip(input, 200)})`;
    }
    case 'tool-result':
      return `(tool result${entry.isError ? ' [error]' : ''}: ${this.clip(entry.result, 200)})`;
    case 'permission-request':
      return `(permission ${entry.status} for ${entry.toolName})`;
    case 'system':
    case 'error':
      return null; // session-local notes / transient errors are not conversation context
  }
}

/** Serialize the transcript into a bounded, engine-agnostic preamble, or '' when there is nothing worth
 *  porting. The most RECENT turns are kept; older ones are dropped with an elision marker. */
  static serialize(
    transcript: readonly TranscriptEntry[],
    budgetCharacters = this.defaultBudgetCharacters,
  ): string {
  const lines: string[] = [];
  for (const entry of transcript) {
    const line = this.lineFor(entry);
    if (line) lines.push(line);
  }
  if (lines.length === 0) return '';

  // Keep the newest lines within budget (drop from the FRONT), tracking whether anything was elided.
  const kept: string[] = [];
  let used = 0;
  let elided = false;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    const cost = line.length + 1;
    if (used + cost > budgetCharacters && kept.length > 0) {
      elided = true;
      break;
    }
    kept.push(line);
    used += cost;
  }
  kept.reverse();

  const header = '[Context ported from the previous engine — the conversation so far:]';
  const body = (elided ? ['(…earlier turns elided…)', ...kept] : kept).join('\n');
  const footer = '[End of ported context. Continue the conversation seamlessly.]';
  return `${header}\n${body}\n${footer}`;
  }
}

export namespace TranscriptContextSerializer {
  export const $Class = $TranscriptContextSerializer;
  export const Class = Static($TranscriptContextSerializer);
}
