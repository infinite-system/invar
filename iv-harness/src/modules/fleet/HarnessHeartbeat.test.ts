import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessHeartbeat } from './HarnessHeartbeat.ts';

test('a just-written heartbeat reads fresh', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-heartbeat-'));
  try {
    const heartbeatPath = join(fixtureRoot, 'heartbeat');
    writeFileSync(heartbeatPath, 'alive\n');
    const node = HarnessHeartbeat.Class.read(heartbeatPath);
    expect(node.exists).toBe(true);
    expect(node.fresh).toBe(true);
    expect(node.ageSeconds).toBeLessThanOrEqual(5);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('a stale heartbeat reads unfresh past the dispatch threshold', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-heartbeat-stale-'));
  try {
    const heartbeatPath = join(fixtureRoot, 'heartbeat');
    writeFileSync(heartbeatPath, 'alive\n');
    const staleSeconds = HarnessHeartbeat.$Class.FRESH_THRESHOLD_SECONDS + 60;
    const staleTime = new Date(Date.now() - staleSeconds * 1000);
    utimesSync(heartbeatPath, staleTime, staleTime);
    const node = HarnessHeartbeat.Class.read(heartbeatPath);
    expect(node.exists).toBe(true);
    expect(node.fresh).toBe(false);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('an absent heartbeat reads dead, not as an error', () => {
  const node = HarnessHeartbeat.Class.read('/nonexistent/heartbeat-path');
  expect(node.exists).toBe(false);
  expect(node.fresh).toBe(false);
  expect(node.ageSeconds).toBeNull();
});
