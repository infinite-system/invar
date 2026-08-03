import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computed, ref } from 'vue';
import { GraphChannel } from './GraphChannel';
import { StatusChannel } from './StatusChannel';

// The resolver's contract, both arms every time: a path that resolves returns
// the LIVE value (present arm), and a path that does not fails loudly naming
// the dead node and what was addressable there (absent arm). A check that
// cannot tell those apart is the defect this channel exists to remove.

let statusDirectory: string;
let statusPath: string;

class $FakeHost {
  protected readonly widthRef = ref(42);
  protected readonly labelRef = ref('Terminal');

  get width() {
    return this.widthRef;
  }
  get label() {
    return this.labelRef;
  }
  get doubled() {
    return computed(() => this.widthRef.value * 2);
  }
  get spaces() {
    return [{ kind: 'terminal', label: this.labelRef.value }];
  }
  get throwing(): never {
    throw new Error('this getter is broken on purpose');
  }

  setWidth(next: number): void {
    this.widthRef.value = next;
  }
}

let host: $FakeHost;

beforeEach(() => {
  statusDirectory = mkdtempSync(join(tmpdir(), 'graph-channel-'));
  statusPath = join(statusDirectory, 'status.json');
  process.env.TUI_STATUS_PATH = statusPath;
  host = new $FakeHost();
  GraphChannel.Class.arm({ roots: { panelHost: host } });
});

afterEach(() => {
  GraphChannel.Class.disarm();
  delete process.env.TUI_STATUS_PATH;
});

test('present arm: a path resolves to the live value with refs unwrapped', () => {
  const result = GraphChannel.Class.resolve('panelHost.width');
  expect(result.resolved).toBe(true);
  expect(result.value).toBe(42);
});

test('present arm: the value is LIVE — it tracks a later change', () => {
  expect(GraphChannel.Class.resolve('panelHost.width').value).toBe(42);
  host.setWidth(7);
  expect(GraphChannel.Class.resolve('panelHost.width').value).toBe(7);
  expect(GraphChannel.Class.resolve('panelHost.doubled').value).toBe(14);
});

test('present arm: indexed segments walk into arrays and plain objects', () => {
  const result = GraphChannel.Class.resolve('panelHost.spaces[0].kind');
  expect(result.resolved).toBe(true);
  expect(result.value).toBe('terminal');
});

test('absent arm: a missing segment names the dead node and its keys', () => {
  const result = GraphChannel.Class.resolve('panelHost.wdith');
  expect(result.resolved).toBe(false);
  expect(result.diedAt).toBe('panelHost');
  expect(result.available).toContain('width');
  expect(result.available).toContain('label');
  // Methods are state-free behavior: never offered as addressable state.
  expect(result.available).not.toContain('setWidth');
});

test('absent arm: walking past a primitive says what it hit', () => {
  const result = GraphChannel.Class.resolve('panelHost.width.deeper');
  expect(result.resolved).toBe(false);
  expect(result.error).toContain('number');
});

test('absent arm: a throwing getter is attributed to its segment', () => {
  const result = GraphChannel.Class.resolve('panelHost.throwing');
  expect(result.resolved).toBe(false);
  expect(result.diedAt).toBe('panelHost.throwing');
  expect(result.error).toContain('broken on purpose');
});

test('a resolved class instance names itself instead of mass-evaluating getters', () => {
  const result = GraphChannel.Class.resolve('panelHost');
  expect(result.resolved).toBe(true);
  const value = result.value as Record<string, unknown>;
  expect(value['<instance>']).toBe('$FakeHost');
  expect(value['<keys>']).toContain('width');
});

test('file protocol: a now request round-trips through the request and response files', () => {
  const requestPath = `${statusPath}.graph-request.json`;
  writeFileSync(
    `${requestPath}.tmp`,
    JSON.stringify({ id: 1, path: 'panelHost.label', mode: 'now' }),
  );
  renameSync(`${requestPath}.tmp`, requestPath);
  GraphChannel.Class.poll();
  const response = JSON.parse(
    readFileSync(`${statusPath}.graph-response.json`, 'utf8'),
  );
  expect(response.id).toBe(1);
  expect(response.resolved).toBe(true);
  expect(response.value).toBe('Terminal');
  expect(response.settled).toBe(false);
});

test('file protocol: a settle request is parked, requests a render, and answers at settle', () => {
  let renderRequests = 0;
  GraphChannel.Class.arm({
    roots: { panelHost: host },
    requestRender: () => {
      renderRequests += 1;
    },
  });
  const requestPath = `${statusPath}.graph-request.json`;
  writeFileSync(
    `${requestPath}.tmp`,
    JSON.stringify({ id: 2, path: 'panelHost.label', mode: 'settle' }),
  );
  renameSync(`${requestPath}.tmp`, requestPath);
  GraphChannel.Class.poll();
  expect(renderRequests).toBe(1);
  // Not answered yet — the settle boundary has not happened.
  expect(() =>
    readFileSync(`${statusPath}.graph-response.json`, 'utf8'),
  ).toThrow();
  GraphChannel.Class.settle();
  const response = JSON.parse(
    readFileSync(`${statusPath}.graph-response.json`, 'utf8'),
  );
  expect(response.id).toBe(2);
  expect(response.settled).toBe(true);
  expect(response.value).toBe('Terminal');
});

test('a request id is serviced once — replays are ignored', () => {
  const requestPath = `${statusPath}.graph-request.json`;
  writeFileSync(
    `${requestPath}.tmp`,
    JSON.stringify({ id: 3, path: 'panelHost.width', mode: 'now' }),
  );
  renameSync(`${requestPath}.tmp`, requestPath);
  GraphChannel.Class.poll();
  host.setWidth(99);
  GraphChannel.Class.poll(); // same id still on disk
  const response = JSON.parse(
    readFileSync(`${statusPath}.graph-response.json`, 'utf8'),
  );
  expect(response.value).toBe(42); // the first answer stands; no re-service
});

test('disarmed or unobserved, the channel is inert', () => {
  GraphChannel.Class.disarm();
  delete process.env.TUI_STATUS_PATH;
  GraphChannel.Class.arm({ roots: { panelHost: host } });
  const result = GraphChannel.Class.resolve('panelHost.width');
  expect(result.resolved).toBe(false);
  expect(result.error).toContain('not armed');
  expect(StatusChannel.Class.observing).toBe(false);
});

// ---- the set experiment primitive (user decision 2026-08-02) ----

test('set present arm: writing through a Ref changes the live value reactively', () => {
  const written = GraphChannel.Class.write('panelHost.width', 7);
  expect(written.resolved).toBe(true);
  expect(written.reactive).toBe(true);
  expect(written.value).toBe(7);
  // The read side observes the write, and deriveds recompute.
  expect(GraphChannel.Class.resolve('panelHost.width').value).toBe(7);
  expect(GraphChannel.Class.resolve('panelHost.doubled').value).toBe(14);
});

test('set on a plain field succeeds but reports reactive false', () => {
  GraphChannel.Class.arm({
    roots: { config: { limit: 10 } },
  });
  const written = GraphChannel.Class.write('config.limit', 99);
  expect(written.resolved).toBe(true);
  expect(written.reactive).toBe(false);
  expect(GraphChannel.Class.resolve('config.limit').value).toBe(99);
});

test('set absent arm: a missing target names the parent and its keys', () => {
  const written = GraphChannel.Class.write('panelHost.wdith', 7);
  expect(written.resolved).toBe(false);
  expect(written.diedAt).toBe('panelHost');
  expect(written.available).toContain('width');
  expect(written.error).toContain('no property');
  // The miss changed nothing.
  expect(GraphChannel.Class.resolve('panelHost.width').value).toBe(42);
});

test('set absent arm: a throwing or readonly target answers as an error, never a crash', () => {
  const frozen = Object.freeze({ locked: 1 });
  GraphChannel.Class.arm({ roots: { frozen } });
  const written = GraphChannel.Class.write('frozen.locked', 2);
  expect(written.resolved).toBe(false);
  expect(typeof written.error).toBe('string');
  expect(frozen.locked).toBe(1);
});

test('file protocol: a set request round-trips and a read request cannot write', () => {
  const requestPath = `${statusPath}.graph-request.json`;
  writeFileSync(
    `${requestPath}.tmp`,
    JSON.stringify({
      id: 10,
      path: 'panelHost.width',
      mode: 'now',
      set: { value: 5 },
    }),
  );
  renameSync(`${requestPath}.tmp`, requestPath);
  GraphChannel.Class.poll();
  const setResponse = JSON.parse(
    readFileSync(`${statusPath}.graph-response.json`, 'utf8'),
  );
  expect(setResponse.resolved).toBe(true);
  expect(setResponse.reactive).toBe(true);
  expect(GraphChannel.Class.resolve('panelHost.width').value).toBe(5);
  // A read of the same path carries no set shape — it cannot assign.
  writeFileSync(
    `${requestPath}.tmp`,
    JSON.stringify({ id: 11, path: 'panelHost.width', mode: 'now' }),
  );
  renameSync(`${requestPath}.tmp`, requestPath);
  GraphChannel.Class.poll();
  const readResponse = JSON.parse(
    readFileSync(`${statusPath}.graph-response.json`, 'utf8'),
  );
  expect(readResponse.value).toBe(5);
  expect(readResponse.reactive).toBeUndefined();
});

// ---- parked conditions ('await' mode) ----

function fileRequest(path: string, body: Record<string, unknown>): void {
  const requestPath = `${path}.graph-request.json`;
  writeFileSync(`${requestPath}.tmp`, JSON.stringify(body));
  renameSync(`${requestPath}.tmp`, requestPath);
}

function readResponseOrNull(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(`${path}.graph-response.json`, 'utf8'));
  } catch {
    return null;
  }
}

test('await parks: no answer until the value matches, then one answer at settle', () => {
  fileRequest(statusPath, {
    id: 20,
    path: 'panelHost.width',
    mode: 'await',
    expect: { value: 7 },
    expiresAtMilliseconds: Date.now() + 60_000,
  });
  GraphChannel.Class.poll();
  // Parked, not answered: the value is 42.
  GraphChannel.Class.settle();
  expect(readResponseOrNull(statusPath)).toBeNull();
  GraphChannel.Class.settle();
  expect(readResponseOrNull(statusPath)).toBeNull();
  // The app changes; the very next settle answers.
  host.setWidth(7);
  GraphChannel.Class.settle();
  const response = readResponseOrNull(statusPath)!;
  expect(response.id).toBe(20);
  expect(response.resolved).toBe(true);
  expect(response.value).toBe(7);
  expect(response.settled).toBe(true);
});

test('await costs ONE request for many samples — the poll storm is gone', () => {
  // A root that counts its own reads: the resolver must touch it only at
  // settle boundaries, never on the request poll.
  let reads = 0;
  const countingRoot = {
    get width() {
      reads += 1;
      return 42;
    },
  };
  GraphChannel.Class.arm({ roots: { counted: countingRoot } });
  fileRequest(statusPath, {
    id: 21,
    path: 'counted.width',
    mode: 'await',
    expect: { value: 7 },
    expiresAtMilliseconds: Date.now() + 60_000,
  });
  GraphChannel.Class.poll();
  // Many polls (the driver is NOT re-requesting) resolve nothing off-frame.
  for (let tick = 0; tick < 20; tick += 1) GraphChannel.Class.poll();
  expect(reads).toBe(0);
  // Only settles sample.
  GraphChannel.Class.settle();
  GraphChannel.Class.settle();
  expect(reads).toBe(2);
});

test('await tolerates a path that does not resolve YET — late mounts are not failures', () => {
  GraphChannel.Class.arm({ roots: { late: {} as Record<string, unknown> } });
  fileRequest(statusPath, {
    id: 22,
    path: 'late.child.ready',
    mode: 'await',
    expect: { value: true },
    expiresAtMilliseconds: Date.now() + 60_000,
  });
  GraphChannel.Class.poll();
  GraphChannel.Class.settle();
  expect(readResponseOrNull(statusPath)).toBeNull(); // a miss is not fatal
  GraphChannel.Class.arm({
    roots: { late: { child: { ready: true } } },
  });
  GraphChannel.Class.settle();
  const response = readResponseOrNull(statusPath)!;
  expect(response.resolved).toBe(true);
  expect(response.value).toBe(true);
});

test('await answers loudly at its deadline, naming the last settled value', () => {
  fileRequest(statusPath, {
    id: 23,
    path: 'panelHost.width',
    mode: 'await',
    expect: { value: 999 },
    expiresAtMilliseconds: Date.now() - 1,
  });
  GraphChannel.Class.poll();
  GraphChannel.Class.settle();
  const response = readResponseOrNull(statusPath)!;
  expect(response.id).toBe(23);
  expect(response.resolved).toBe(false);
  expect(String(response.error)).toContain('999');
  expect(String(response.error)).toContain('42');
});

test('a parked condition nudges a quiet renderer instead of spinning it', () => {
  let renderRequests = 0;
  GraphChannel.Class.arm({
    roots: { panelHost: host },
    requestRender: () => {
      renderRequests += 1;
    },
  });
  fileRequest(statusPath, {
    id: 24,
    path: 'panelHost.width',
    mode: 'await',
    expect: { value: 7 },
    expiresAtMilliseconds: Date.now() + 60_000,
  });
  GraphChannel.Class.poll();
  expect(renderRequests).toBe(1); // parked -> one frame requested
  GraphChannel.Class.settle(); // stamps the settle clock
  for (let tick = 0; tick < 10; tick += 1) GraphChannel.Class.poll();
  expect(renderRequests).toBe(1); // quiet interval not elapsed: no spinning
});

// ---- 'transition': the subscribing verb ----

test('transition sees a blink that frame sampling CANNOT see', () => {
  fileRequest(statusPath, {
    id: 30,
    path: 'panelHost.width',
    mode: 'transition',
    expect: { value: 7 },
    expiresAtMilliseconds: Date.now() + 60_000,
  });
  GraphChannel.Class.poll();
  // Rise and fall with no settle in between — the value never survives to a
  // frame, so an 'await' would sample 42 both sides and never answer.
  host.setWidth(7);
  host.setWidth(42);
  const response = readResponseOrNull(statusPath)!;
  expect(response.id).toBe(30);
  expect(response.resolved).toBe(true);
  // FALSE by design: no completed frame is claimed to have shown this.
  expect(response.settled).toBe(false);
});

test('the same blink is invisible to await — the two verbs are not interchangeable', () => {
  fileRequest(statusPath, {
    id: 31,
    path: 'panelHost.width',
    mode: 'await',
    expect: { value: 7 },
    expiresAtMilliseconds: Date.now() + 60_000,
  });
  GraphChannel.Class.poll();
  GraphChannel.Class.settle(); // sees 42
  host.setWidth(7);
  host.setWidth(42); // rose and fell between samples
  GraphChannel.Class.settle(); // sees 42 again
  expect(readResponseOrNull(statusPath)).toBeNull();
});

test('transition never fires on the value the path already holds', () => {
  fileRequest(statusPath, {
    id: 32,
    path: 'panelHost.width',
    mode: 'transition',
    expect: { value: 42 }, // already 42
    expiresAtMilliseconds: Date.now() + 60_000,
  });
  GraphChannel.Class.poll();
  expect(readResponseOrNull(statusPath)).toBeNull();
  // It fires only on the BECOMING.
  host.setWidth(1);
  host.setWidth(42);
  expect(readResponseOrNull(statusPath)!.id).toBe(32);
});

test('transition stops its watcher on answer, expiry, supersede, and disarm', () => {
  let reads = 0;
  const countingRoot = {
    get width() {
      reads += 1;
      return 42;
    },
  };
  GraphChannel.Class.arm({ roots: { counted: countingRoot } });
  fileRequest(statusPath, {
    id: 33,
    path: 'counted.width',
    mode: 'transition',
    expect: { value: -1 },
    expiresAtMilliseconds: Date.now() - 1,
  });
  GraphChannel.Class.poll(); // parks, then expires in the same tick
  const expired = readResponseOrNull(statusPath)!;
  expect(expired.id).toBe(33);
  expect(expired.resolved).toBe(false);
  expect(String(expired.error)).toContain('never became');
  // The watcher is gone: further polls do not resubscribe or re-answer.
  const readsAfterExpiry = reads;
  for (let tick = 0; tick < 5; tick += 1) GraphChannel.Class.poll();
  expect(reads).toBe(readsAfterExpiry);
  GraphChannel.Class.disarm();
});
