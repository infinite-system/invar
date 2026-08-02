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
    mode: 'now' | 'settle' | 'await' | 'transition',
    options: {
      deadline?: number;
      set?: { value: unknown };
      expect?: { value: unknown };
      expiresAtMilliseconds?: number;
    } = {},
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
      JSON.stringify({
        id,
        path,
        mode,
        set: options.set,
        expect: options.expect,
        expiresAtMilliseconds: options.expiresAtMilliseconds,
      }),
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
   *  boundaries — a condition with a deadline, never a sleep.
   *
   *  The condition is PARKED IN THE APP: one request buys every sample, so a
   *  long wait costs no repeated request traffic and no off-frame path
   *  resolution. That matters most on the contention tier, where the
   *  instrument's own load would otherwise perturb what it measures. */
  static async awaitValue(
    statusPath: string,
    path: string,
    expectedValue: unknown,
    timeoutMilliseconds = 15_000,
  ): Promise<void> {
    const expiresAtMilliseconds = Date.now() + timeoutMilliseconds;
    try {
      await this.query(statusPath, path, 'await', {
        expect: { value: expectedValue },
        expiresAtMilliseconds,
        // Outlive the app's own deadline, so the app's answer (which names the
        // last settled value) wins over a bare client-side timeout.
        deadline: expiresAtMilliseconds + 2_000,
      });
    } catch (thrown) {
      throw new Error(
        `graph wait ${JSON.stringify(path)} did not reach ` +
          `${JSON.stringify(expectedValue)} within ${timeoutMilliseconds}ms.\n` +
          (thrown instanceof Error ? thrown.message : String(thrown)),
      );
    }
  }

  /** Wait for a value the app only PASSES THROUGH — a blink no completed frame
   *  necessarily shows: a self-dismissing toast, a transient error, an
   *  intermediate lifecycle tier.
   *
   *  Reach for `awaitValue` first, always. This verb subscribes inside the app
   *  (a real edge in its reactive graph) and reports states mid-update, so a
   *  gesture sequenced on it can act on geometry the user never saw. Its whole
   *  and only advantage is that sampling at frame boundaries CANNOT see a
   *  value that rises and falls between two samples.
   *
   *  It never fires on the value the path already holds: "is X" and "became X"
   *  are different questions, and answering the first here would be the
   *  pre-satisfied wait this instrument exists to kill. */
  static async awaitTransition(
    statusPath: string,
    path: string,
    expectedValue: unknown,
    timeoutMilliseconds = 15_000,
  ): Promise<void> {
    const expiresAtMilliseconds = Date.now() + timeoutMilliseconds;
    try {
      await this.query(statusPath, path, 'transition', {
        expect: { value: expectedValue },
        expiresAtMilliseconds,
        deadline: expiresAtMilliseconds + 2_000,
      });
    } catch (thrown) {
      throw new Error(
        `graph transition ${JSON.stringify(path)} never became ` +
          `${JSON.stringify(expectedValue)} within ${timeoutMilliseconds}ms.\n` +
          (thrown instanceof Error ? thrown.message : String(thrown)),
      );
    }
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
