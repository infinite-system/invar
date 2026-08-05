import { Static } from 'ivue/extras';
import { isRef, watch, type Ref } from 'vue';
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
  protected static lastSettleAtMilliseconds = 0;
  protected static transitionRequest: GraphRequest | null = null;
  protected static transitionStop: (() => void) | null = null;
  /** How long a parked condition tolerates a quiet renderer before nudging. */
  // Hot graph-wait polling path: this fixed cadence never varies by subclass.
  protected static readonly QUIET_NUDGE_MILLISECONDS = 250;

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
    // The quiet-nudge clock starts when the channel is armed; leaving it at
    // zero makes the very first poll look like an eternity of silence.
    this.lastSettleAtMilliseconds = Date.now();
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
    this.stopTransition();
  }

  /** Read the request file; answer 'now' requests directly, park 'settle' and
   *  'await' requests for the frame boundary (and request that frame, so an
   *  idle app still produces one — a wait must be reachable, never
   *  pre-satisfied into a hang).
   *
   *  Also the liveness nudge for a parked CONDITION: a repaint normally
   *  follows any state change, but a change nothing reactive observes would
   *  otherwise leave the condition unevaluated until the deadline. One nudge
   *  per quiet interval bounds that staleness without spinning the renderer —
   *  spinning would perturb the very app the harness measures. */
  static poll(): void {
    if (!this.roots) return;
    const request = this.readRequest();
    if (request && request.id > this.lastServicedId) {
      this.lastServicedId = request.id;
      if (request.mode === 'transition') {
        this.parkTransition(request);
      } else if (request.mode === 'settle' || request.mode === 'await') {
        this.pendingSettleRequest = request;
        this.requestRender?.();
      } else {
        this.respond(request, false);
      }
    }
    this.expireTransition();
    if (
      this.pendingSettleRequest &&
      Date.now() - this.lastSettleAtMilliseconds > this.QUIET_NUDGE_MILLISECONDS
    ) {
      this.lastSettleAtMilliseconds = Date.now();
      this.requestRender?.();
    }
  }

  /** Called from the frame tick beside StatusChannel.settle — the one point
   *  where the graph is known to match a completed frame.
   *
   *  A parked CONDITION ('await') is evaluated here and only here: one request
   *  buys every sample, so a wait costs no request traffic and no off-frame
   *  path resolution. A path that does not resolve YET is not a failure — a
   *  node can mount late — so the condition keeps waiting and the last outcome
   *  becomes the answer if the deadline passes. */
  static settle(): void {
    this.lastSettleAtMilliseconds = Date.now();
    const request = this.pendingSettleRequest;
    if (!request) return;
    if (request.mode !== 'await') {
      this.pendingSettleRequest = null;
      this.respond(request, true);
      return;
    }
    const outcome = this.resolve(request.path);
    const wanted = JSON.stringify(request.expect?.value);
    if (outcome.resolved === true && JSON.stringify(outcome.value) === wanted) {
      this.pendingSettleRequest = null;
      this.writeResponse({
        ...outcome,
        id: request.id,
        frame: StatusChannel.Class.snapshot.frame,
        settled: true,
      });
      return;
    }
    if (
      typeof request.expiresAtMilliseconds === 'number' &&
      Date.now() >= request.expiresAtMilliseconds
    ) {
      this.pendingSettleRequest = null;
      this.writeResponse({
        ...outcome,
        resolved: false,
        error:
          outcome.resolved === true
            ? `graph await timed out: wanted ${wanted}, last settled value was ${JSON.stringify(outcome.value)}`
            : (outcome.error ??
              `graph await timed out: wanted ${wanted}, and the path never resolved`),
        id: request.id,
        frame: StatusChannel.Class.snapshot.frame,
        settled: true,
      });
    }
  }

  // ---- 'transition': the SUBSCRIBING verb. Read this before using it. ----
  //
  // USE IT ONLY FOR A VALUE THAT DOES NOT SURVIVE TO A FRAME — a state the app
  // passes THROUGH: a toast that self-dismisses, a transient error, an
  // intermediate lifecycle tier, a counter that ticks past a number. Sampling
  // at frame boundaries structurally cannot see those: the value can rise and
  // fall between two samples, and the wait then hangs to its deadline while
  // the thing it wanted really did happen.
  //
  // DO NOT USE IT FOR A STATE THE APP REACHES AND HOLDS. For that use 'await'
  // (GraphClient.awaitValue), and here is the reason, which is not a
  // preference:
  //
  //   1. A watcher fires DURING the mutation, so it reports states no
  //      completed frame ever showed. Wait on one of those and the next
  //      gesture acts on geometry the user could never have seen — the
  //      torn-read class the settle boundary exists to remove.
  //   2. A watcher SUBSCRIBES. It adds an edge to the app's reactive graph,
  //      which keeps computeds alive and can change when they recompute. The
  //      observer becomes part of what it observes. 'await' reads and adds
  //      nothing.
  //   3. A subscription has a lifetime. It leaks if nobody stops it. 'await'
  //      is stateless per request.
  //
  // So: 'transition' buys the ONE thing sampling cannot do, and pays for it in
  // observer effect. Spend that only when the blink is the actual question.
  //
  // A transition NEVER fires on the value the path already has. "It is already
  // X" and "it BECAME X" are different questions, and answering the first here
  // would be a pre-satisfied wait — the exact defect this whole channel was
  // built to kill. If you want reach-or-already-be, that is 'await'.
  protected static parkTransition(request: GraphRequest): void {
    this.stopTransition();
    const wanted = JSON.stringify(request.expect?.value);
    this.transitionRequest = request;
    this.transitionStop = watch(
      () => {
        // The getter runs inside the watcher's effect, so every leaf the walk
        // reads is tracked. A path that does not resolve yet is a legal
        // observation, not a crash: it simply is not the wanted value.
        try {
          const outcome = this.resolve(request.path);
          return outcome.resolved === true
            ? JSON.stringify(outcome.value)
            : '<unresolved>';
        } catch {
          return '<threw>';
        }
      },
      (serialized) => {
        if (serialized !== wanted) return;
        const answered = this.transitionRequest;
        this.stopTransition();
        if (!answered) return;
        this.writeResponse({
          ...this.resolve(answered.path),
          id: answered.id,
          frame: StatusChannel.Class.snapshot.frame,
          // FALSE, and the flag is load-bearing: this value was observed
          // mid-update. No completed frame is claimed to have shown it.
          settled: false,
        });
      },
      // SYNC flush is the whole point. The default 'pre' flush coalesces
      // changes within a tick, so a value that rises and falls in one tick —
      // precisely the blink this verb exists for — would never be seen.
      { flush: 'sync' },
    );
  }

  protected static expireTransition(): void {
    const request = this.transitionRequest;
    if (!request) return;
    if (
      typeof request.expiresAtMilliseconds !== 'number' ||
      Date.now() < request.expiresAtMilliseconds
    ) {
      return;
    }
    this.stopTransition();
    this.writeResponse({
      ...this.resolve(request.path),
      resolved: false,
      error:
        `graph transition timed out: ${JSON.stringify(request.path)} never ` +
        `became ${JSON.stringify(request.expect?.value)} while subscribed`,
      id: request.id,
      frame: StatusChannel.Class.snapshot.frame,
      settled: false,
    });
  }

  /** Every exit path stops the watcher: answered, expired, superseded, or the
   *  channel disarmed. A subscription that outlives its question is the leak
   *  this verb is otherwise prone to. */
  protected static stopTransition(): void {
    this.transitionStop?.();
    this.transitionStop = null;
    this.transitionRequest = null;
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
        mode:
          parsed.mode === 'settle' ||
          parsed.mode === 'await' ||
          parsed.mode === 'transition'
            ? parsed.mode
            : 'now',
        ...(parsed.set && typeof parsed.set === 'object'
          ? { set: { value: (parsed.set as { value: unknown }).value } }
          : {}),
        ...(parsed.expect && typeof parsed.expect === 'object'
          ? { expect: { value: (parsed.expect as { value: unknown }).value } }
          : {}),
        ...(typeof parsed.expiresAtMilliseconds === 'number'
          ? { expiresAtMilliseconds: parsed.expiresAtMilliseconds }
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
    this.writeResponse(response);
  }

  protected static writeResponse(response: GraphResponse): void {
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
  /** 'now' answers from the next poll; 'settle' answers once at the next
   *  frame boundary; 'await' PARKS the condition and answers at the first
   *  frame boundary where the value matches `expect` (one request buys every
   *  sample — no repeated request traffic, no off-frame resolution);
   *  'transition' SUBSCRIBES and answers the instant the value becomes
   *  `expect`, including values that never survive to a frame. */
  readonly mode: 'now' | 'settle' | 'await' | 'transition';
  /** 'await' only: the value the parked condition is waiting for. */
  readonly expect?: { readonly value: unknown };
  /** 'await' only: when to give up and answer with the last outcome, so a
   *  parked condition can never outlive its asker. */
  readonly expiresAtMilliseconds?: number;
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
