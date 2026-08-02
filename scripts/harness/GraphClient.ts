// The driver side of the app's GraphChannel (task #469), shared by DriveSession
// and every smoke: write a request file beside the status file, await the
// matching response. One client so the protocol cannot fork between the fluent
// driver and the smoke suite.
//
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { Static } from 'ivue/extras';

class $GraphClient {
  protected static lastRequestId = 0;

  /** One graph question. mode 'now' answers from the app's next event-loop
   *  poll; mode 'settle' answers only at a frame-settle boundary (the same
   *  point the status projection publishes at). A `set` payload makes it a
   *  write experiment instead of a read. Throws loudly on a miss — the dead
   *  node, near matches, and what was addressable there. */
  static async query(
    statusPath: string,
    path: string,
    mode: 'now' | 'settle',
    options: { deadline?: number; set?: { value: unknown } } = {},
  ): Promise<{
    value: unknown;
    frame: number;
    settled: boolean;
    reactive?: boolean;
  }> {
    const deadline = options.deadline ?? Date.now() + 10_000;
    // Time-based ids: monotone across app restarts sharing one home, so a
    // stale request file from a previous run can never shadow a fresh one.
    this.lastRequestId = Math.max(this.lastRequestId + 1, Date.now());
    const id = this.lastRequestId;
    const requestPath = `${statusPath}.graph-request.json`;
    const responsePath = `${statusPath}.graph-response.json`;
    const temporaryPath = `${requestPath}.tmp`;
    writeFileSync(
      temporaryPath,
      JSON.stringify({ id, path, mode, set: options.set }),
    );
    renameSync(temporaryPath, requestPath);
    while (Date.now() < deadline) {
      const response = this.readResponse(responsePath);
      if (response && response.id === id) {
        if (response.resolved !== true) throw this.missError(path, response);
        return {
          value: response.value,
          frame: Number(response.frame ?? -1),
          settled: response.settled === true,
          ...(typeof response.reactive === 'boolean'
            ? { reactive: response.reactive }
            : {}),
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error(
      `the app never answered graph request ${JSON.stringify(path)} ` +
        `(mode ${mode}). Is TUI_STATUS_PATH set and the app past boot?`,
    );
  }

  /** Wait until a graph path reaches a value, sampled ONLY at frame-settle
   *  boundaries — a condition with a deadline, never a sleep. */
  static async awaitValue(
    statusPath: string,
    path: string,
    expectedValue: unknown,
    timeoutMilliseconds = 15_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMilliseconds;
    let lastValue: unknown = '<never answered>';
    while (Date.now() < deadline) {
      const response = await this.query(statusPath, path, 'settle', {
        deadline,
      });
      lastValue = response.value;
      if (JSON.stringify(response.value) === JSON.stringify(expectedValue)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      `graph wait ${JSON.stringify(path)} timed out after ` +
        `${timeoutMilliseconds}ms: wanted ${JSON.stringify(expectedValue)}, ` +
        `last settled value was ${JSON.stringify(lastValue)}`,
    );
  }

  protected static readResponse(
    responsePath: string,
  ): Record<string, unknown> | null {
    try {
      return JSON.parse(readFileSync(responsePath, 'utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      return null;
    }
  }

  /** A path that does not resolve is NOT a value of undefined — name the node
   *  the walk died at and what WAS addressable there. */
  static missError(path: string, response: Record<string, unknown>): Error {
    const diedAt = String(response.diedAt ?? '<unknown>');
    const available = Array.isArray(response.available)
      ? (response.available as string[])
      : [];
    const lastSegment = path.split('.').pop() ?? path;
    const needle = lastSegment.replace(/[^a-z]/gi, '').toLowerCase();
    const near = available.filter((candidate) =>
      candidate.toLowerCase().includes(needle.slice(0, 6)),
    );
    return new Error(
      [
        `graph path ${JSON.stringify(path)} did not resolve.`,
        `  walk died at: ${diedAt}`,
        response.error ? `  error: ${String(response.error)}` : '',
        near.length > 0
          ? `  did you mean: ${near.slice(0, 6).join(', ')}?`
          : '',
        available.length > 0
          ? `  addressable there: ${available.slice(0, 40).join(', ')}${available.length > 40 ? ', …' : ''}`
          : '',
      ]
        .filter((line) => line !== '')
        .join('\n'),
    );
  }
}

export namespace GraphClient {
  export const $Class = Static($GraphClient);
  export let Class = $Class;
}
