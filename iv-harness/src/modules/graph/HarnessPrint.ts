import { Static } from 'ivue/extras';

/**
 * Bounded printing for graph answers: one serializer rule for every
 * domain. Arrays and many-keyed objects over the print limit truncate
 * LOUDLY, with a marker that teaches the narrower query. The graph
 * node itself stays whole — truncation is presentation, applied at
 * print time by the CLI, identically attached and cold.
 */
// invariant: Disk is the store and the graph is a projection (iv-harness/iv-harness.invariants.md)
class $HarnessPrint {
  static get DEFAULT_PRINT_LIMIT(): number {
    return 25;
  }

  static get TRUNCATION_KEY(): string {
    return '…truncated';
  }

  static boundedClone(value: unknown, options: PrintOptions): unknown {
    if (options.full) return value;
    const limit = options.limit ?? this.DEFAULT_PRINT_LIMIT;
    const offset = options.offset ?? 0;
    return this.boundNode(value, limit, offset, true);
  }

  static boundNode(
    value: unknown,
    limit: number,
    offset: number,
    isRoot: boolean,
  ): unknown {
    // The offset window applies at the ROOT container only — nested
    // containers always show their head, so one page stays one page.
    const windowStart = isRoot ? offset : 0;
    if (Array.isArray(value)) {
      if (value.length <= limit && windowStart === 0) {
        return value.map((item) => this.boundNode(item, limit, 0, false));
      }
      const window = value
        .slice(windowStart, windowStart + limit)
        .map((item) => this.boundNode(item, limit, 0, false));
      window.push(
        this.truncationMessage(value.length, window.length, windowStart),
      );
      return window;
    }
    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length <= limit && windowStart === 0) {
        return Object.fromEntries(
          entries.map(([key, child]) => [
            key,
            this.boundNode(child, limit, 0, false),
          ]),
        );
      }
      const window = entries.slice(windowStart, windowStart + limit);
      const bounded = Object.fromEntries(
        window.map(([key, child]) => [
          key,
          this.boundNode(child, limit, 0, false),
        ]),
      );
      bounded[this.TRUNCATION_KEY] = this.truncationMessage(
        entries.length,
        window.length,
        windowStart,
      );
      return bounded;
    }
    return value;
  }

  static truncationMessage(
    total: number,
    shown: number,
    offset: number,
  ): string {
    const window =
      offset === 0
        ? `showing ${shown}`
        : `showing ${shown} from offset ${offset}`;
    return (
      `truncated: ${total} total, ${window} — ` +
      'narrow the path, or use --limit/--offset/--full'
    );
  }
}

export namespace HarnessPrint {
  export const $Class = Static($HarnessPrint);
  export let Class = $Class;
}

export interface PrintOptions {
  limit?: number;
  offset?: number;
  full?: boolean;
}
