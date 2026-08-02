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
