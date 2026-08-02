import { Static } from 'ivue/extras';
import { isRef, type Ref } from 'vue';
// Live object-graph reads for the driven harness (task #469). The status
// projection publishes only what somebody pre-exported; the app itself is an
// ivue class graph whose state is reachable by ordinary property access. This
// channel walks a path over that live graph on request, so a drive can ask
// questions nobody anticipated — without a publish tax per surface.
//
// READS NEVER MUTATE. get/waitFor cannot change app state — resolving a path
// only reads, discovery lists never evaluate. Mutation exists ONLY as the
// separate explicit `set` request shape (user decision 2026-08-02: agents may
// set a graph value to quickly confirm a hypothesis). A set is an EXPERIMENT
// primitive: it bypasses the user's input path, so verification smokes keep
// using real PTY gestures — a set proves "the state can cause the symptom",
// never "the app behaves".
// invariant: Graph observation reads and never mutates (src/modules/system/system.invariants.md)
//
// Enablement is StatusChannel's: inert in a shipped binary, alive only when
// the harness sets TUI_OBSERVE=1 or TUI_STATUS_PATH. Same file family too —
// requests and responses live beside the status file, written atomically
// (write-temp + rename) in both directions.
// invariant: Observability never crashes the app (src/modules/system/system.invariants.md)
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { StatusChannel } from './StatusChannel';

class $GraphChannel {
  protected static roots: Record<string, unknown> | null = null;
  protected static requestRender: (() => void) | null = null;
  protected static pollTimer: ReturnType<typeof setInterval> | null = null;
  protected static lastServicedId = 0;
  protected static pendingSettleRequest: GraphRequest | null = null;

  protected static get requestPath(): string {
    return `${StatusChannel.Class.path}.graph-request.json`;
  }

  protected static get responsePath(): string {
    return `${StatusChannel.Class.path}.graph-response.json`;
  }

  /** Arm the servicer over the app's named roots. Inert unless observing is
   *  enabled — a shipped binary never exposes its object graph. */
  static arm(options: {
    roots: Record<string, unknown>;
    requestRender?: () => void;
  }): void {
    if (!StatusChannel.Class.observing) return;
    this.roots = options.roots;
    this.requestRender = options.requestRender ?? null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    const timer = setInterval(() => this.poll(), 20);
    // The timer must never hold the process alive past the app's own life.
    timer.unref?.();
    this.pollTimer = timer;
  }

  static disarm(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.roots = null;
    this.requestRender = null;
    this.pendingSettleRequest = null;
  }

  /** Read the request file; answer 'now' requests directly, park 'settle'
   *  requests for the next frame boundary (and request that frame, so an idle
   *  app still produces one — a wait must be reachable, never pre-satisfied
   *  into a hang). */
  static poll(): void {
    if (!this.roots) return;
    const request = this.readRequest();
    if (!request || request.id <= this.lastServicedId) return;
    this.lastServicedId = request.id;
    if (request.mode === 'settle') {
      this.pendingSettleRequest = request;
      this.requestRender?.();
      return;
    }
    this.respond(request, false);
  }

  /** Called from the frame tick beside StatusChannel.settle — the one point
   *  where the graph is known to match a completed frame. */
  static settle(): void {
    const request = this.pendingSettleRequest;
    if (!request) return;
    this.pendingSettleRequest = null;
    this.respond(request, true);
  }

  protected static readRequest(): GraphRequest | null {
    try {
      const raw = readFileSync(this.requestPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<GraphRequest>;
      if (typeof parsed.id !== 'number' || typeof parsed.path !== 'string') {
        return null;
      }
      return {
        id: parsed.id,
        path: parsed.path,
        mode: parsed.mode === 'settle' ? 'settle' : 'now',
        ...(parsed.set && typeof parsed.set === 'object'
          ? { set: { value: (parsed.set as { value: unknown }).value } }
          : {}),
      };
    } catch {
      // No request file, or a half-written one: both mean "nothing to do".
      return null;
    }
  }

  protected static respond(request: GraphRequest, settled: boolean): void {
    const frame = StatusChannel.Class.snapshot.frame;
    let response: GraphResponse;
    try {
      response = {
        ...(request.set
          ? this.write(request.path, request.set.value)
          : this.resolve(request.path)),
        id: request.id,
        frame,
        settled,
      };
    } catch (thrown) {
      response = {
        id: request.id,
        resolved: false,
        error: thrown instanceof Error ? thrown.message : String(thrown),
        frame,
        settled,
      };
    }
    try {
      const temporaryPath = `${this.responsePath}.tmp`;
      writeFileSync(temporaryPath, JSON.stringify(response, null, 2));
      renameSync(temporaryPath, this.responsePath);
    } catch {
      // invariant: Observability never crashes the app (src/modules/system/system.invariants.md)
    }
  }

  /** Walk a dotted/indexed path over the live graph. Refs and Computeds are
   *  unwrapped IN the walk — a caller writing `.value` into a path string is
   *  the leak this resolver exists to prevent. ivue getters evaluate on read,
   *  so every step observes the live value. */
  static resolve(
    path: string,
  ): Pick<
    GraphResponse,
    'resolved' | 'value' | 'diedAt' | 'available' | 'error'
  > {
    if (!this.roots) {
      return { resolved: false, error: 'graph channel is not armed' };
    }
    const segments = path
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .filter((segment) => segment !== '');
    if (segments.length === 0) {
      return {
        resolved: false,
        diedAt: '<root>',
        available: Object.keys(this.roots).sort(),
        error: 'empty path',
      };
    }
    const outcome = this.walk(this.roots, segments);
    if (!outcome.ok) return outcome.miss;
    return {
      resolved: true,
      value: this.serialize(this.unwrap(outcome.node), 4, new WeakSet()),
    };
  }

  /** The EXPERIMENT primitive (user decision 2026-08-02): assign a value into
   *  the live graph so an agent can quickly confirm a hypothesis. Writes
   *  through a Ref when the target is one (reactive — the app repaints);
   *  plain fields assign silently and the response says so. Never part of
   *  verification: a set bypasses the user's own input path. */
  static write(
    path: string,
    value: unknown,
  ): Pick<
    GraphResponse,
    'resolved' | 'value' | 'diedAt' | 'available' | 'error' | 'reactive'
  > {
    if (!this.roots) {
      return { resolved: false, error: 'graph channel is not armed' };
    }
    const segments = path
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .filter((segment) => segment !== '');
    if (segments.length === 0) {
      return { resolved: false, diedAt: '<root>', error: 'empty path' };
    }
    const targetSegment = segments[segments.length - 1]!;
    const outcome = this.walk(this.roots, segments.slice(0, -1));
    if (!outcome.ok) return outcome.miss;
    const parent = this.unwrap(outcome.node);
    if (parent === null || typeof parent !== 'object') {
      return {
        resolved: false,
        diedAt: segments.slice(0, -1).join('.') || '<root>',
        error: `the set target's parent is a ${parent === null ? 'null' : typeof parent}`,
      };
    }
    const container = parent as Record<string, unknown>;
    if (!(targetSegment in container)) {
      return {
        resolved: false,
        diedAt: segments.slice(0, -1).join('.') || '<root>',
        available: this.availableKeys(container),
        error: `no property ${JSON.stringify(targetSegment)} to set`,
      };
    }
    try {
      const existing = container[targetSegment];
      if (isRef(existing)) {
        (existing as Ref<unknown>).value = value;
        return {
          resolved: true,
          reactive: true,
          value: this.serialize(this.unwrap(existing), 4, new WeakSet()),
        };
      }
      container[targetSegment] = value;
      return {
        resolved: true,
        reactive: false,
        value: this.serialize(container[targetSegment], 4, new WeakSet()),
      };
    } catch (thrown) {
      // A readonly accessor, a frozen object, a setter that throws: all answer
      // as a loud error, never as a crash or a silent no-op.
      return {
        resolved: false,
        diedAt: segments.join('.'),
        error: thrown instanceof Error ? thrown.message : String(thrown),
      };
    }
  }

  /** One walk for reads and writes — the two cannot drift apart. */
  protected static walk(
    root: Record<string, unknown>,
    segments: readonly string[],
  ):
    | { ok: true; node: unknown }
    | {
        ok: false;
        miss: Pick<
          GraphResponse,
          'resolved' | 'diedAt' | 'available' | 'error'
        >;
      } {
    let current: unknown = root;
    const walked: string[] = [];
    for (const segment of segments) {
      current = this.unwrap(current);
      if (current === null || typeof current !== 'object') {
        return {
          ok: false,
          miss: {
            resolved: false,
            diedAt: walked.length > 0 ? walked.join('.') : '<root>',
            available: [],
            error: `the walk reached a ${current === null ? 'null' : typeof current} before segment ${JSON.stringify(segment)}`,
          },
        };
      }
      const container = current as Record<string, unknown>;
      if (!(segment in container)) {
        return {
          ok: false,
          miss: {
            resolved: false,
            diedAt: walked.length > 0 ? walked.join('.') : '<root>',
            available: this.availableKeys(container),
          },
        };
      }
      try {
        current = container[segment];
      } catch (thrown) {
        return {
          ok: false,
          miss: {
            resolved: false,
            diedAt: [...walked, segment].join('.'),
            error: thrown instanceof Error ? thrown.message : String(thrown),
          },
        };
      }
      walked.push(segment);
    }
    return { ok: true, node: current };
  }

  protected static unwrap(value: unknown): unknown {
    return isRef(value) ? (value as Ref<unknown>).value : value;
  }

  /** What is addressable at a node: own enumerable keys plus prototype-chain
   *  getters (ivue state and derivations live as getters). Never EVALUATES a
   *  property to classify it — evaluation can run store injections and heavy
   *  deriveds, and a discovery list must not mutate the app. On ivue classes
   *  the engine also exposes bound methods through getters, so method names
   *  appear here too; they are addressable, not callable through this channel. */
  protected static availableKeys(node: object): string[] {
    const keys = new Set<string>(Object.keys(node));
    let prototype = Object.getPrototypeOf(node) as object | null;
    while (prototype && prototype !== Object.prototype) {
      const descriptors = Object.getOwnPropertyDescriptors(prototype);
      for (const [name, descriptor] of Object.entries(descriptors)) {
        if (name === 'constructor') continue;
        if (descriptor.get) keys.add(name);
      }
      prototype = Object.getPrototypeOf(prototype);
    }
    return [...keys].sort();
  }

  /** JSON-safe projection of a live value. Plain objects and arrays expand to
   *  a bounded depth; class instances do NOT auto-expand (evaluating every
   *  getter on an arbitrary instance can run store injections and heavy
   *  derivations — reads must stay surgical). An instance names its class and
   *  its addressable keys, and the caller drills in BY PATH, so only the
   *  getters actually named ever evaluate. */
  protected static serialize(
    value: unknown,
    depth: number,
    seen: WeakSet<object>,
  ): unknown {
    const unwrapped = this.unwrap(value);
    if (unwrapped === null || typeof unwrapped === 'undefined') {
      return unwrapped ?? null;
    }
    if (typeof unwrapped === 'function') return '<function>';
    if (typeof unwrapped === 'bigint') return unwrapped.toString();
    if (typeof unwrapped !== 'object') return unwrapped;
    if (seen.has(unwrapped)) return '<cycle>';
    seen.add(unwrapped);
    if (depth <= 0) {
      return Array.isArray(unwrapped)
        ? `<array of ${unwrapped.length}>`
        : `<${unwrapped.constructor?.name ?? 'object'}>`;
    }
    if (Array.isArray(unwrapped)) {
      return unwrapped.map((entry) => this.serialize(entry, depth - 1, seen));
    }
    if (unwrapped instanceof Map) {
      return `<Map of ${unwrapped.size}>`;
    }
    if (unwrapped instanceof Set) {
      return `<Set of ${unwrapped.size}>`;
    }
    const prototype = Object.getPrototypeOf(unwrapped) as object | null;
    const isPlain = prototype === Object.prototype || prototype === null;
    if (!isPlain) {
      return {
        '<instance>': (unwrapped as object).constructor?.name ?? 'unknown',
        '<keys>': this.availableKeys(unwrapped as object),
      };
    }
    const projection: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      unwrapped as Record<string, unknown>,
    )) {
      projection[key] = this.serialize(entry, depth - 1, seen);
    }
    return projection;
  }
}

export namespace GraphChannel {
  export const $Class = Static($GraphChannel);
  export let Class = $Class;
}

/** One inbound question: walk `path` from the named roots. `mode: 'now'`
 *  answers from the next event-loop poll (a consistent single-task read, but
 *  possibly a between-frames transient). `mode: 'settle'` answers only at the
 *  next frame settle — the same boundary the status projection publishes at —
 *  so condition waits never observe a state that no completed frame had. */
export interface GraphRequest {
  readonly id: number;
  readonly path: string;
  readonly mode: 'now' | 'settle';
  /** Present = this is a WRITE experiment, not an observation. The wrapper
   *  object distinguishes "set to undefined" from "no set requested". */
  readonly set?: { readonly value: unknown };
}

export interface GraphResponse {
  readonly id: number;
  readonly resolved: boolean;
  readonly value?: unknown;
  /** On a miss: the path prefix that still resolved (the node the walk died AT). */
  readonly diedAt?: string;
  /** On a miss: what WAS addressable at the dead node. */
  readonly available?: string[];
  /** On a resolver throw: the getter's own error, attributed to its segment. */
  readonly error?: string;
  readonly frame: number;
  /** True when this answer was produced at a frame-settle boundary. */
  readonly settled: boolean;
  /** On a set: true when the write went through a reactive Ref (the app will
   *  repaint), false when it hit a plain field (nothing observes plain-field
   *  writes — the agent must know why the screen did not move). */
  readonly reactive?: boolean;
}
