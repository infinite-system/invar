import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessGraph } from '../graph/HarnessGraph.ts';
import { HarnessServer } from './HarnessServer.ts';

function plantedFixture(): {
  fixtureRoot: string;
  rendezvousDirectory: string;
  server: InstanceType<typeof HarnessServer.Class>;
} {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-server-root-'));
  mkdirSync(join(fixtureRoot, '.invar', 'tasks', 'in-progress'), {
    recursive: true,
  });
  const rendezvousDirectory = mkdtempSync(
    join(tmpdir(), 'harness-server-rdv-'),
  );
  const server = new HarnessServer.Class({
    rootDirectory: fixtureRoot,
    rendezvousDirectory,
    gatesRegistryPath: join(fixtureRoot, 'gates-registry'),
    heartbeatPath: join(fixtureRoot, 'heartbeat'),
  });
  return { fixtureRoot, rendezvousDirectory, server };
}

function cleanup(fixtureRoot: string, rendezvousDirectory: string): void {
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(rendezvousDirectory, { recursive: true, force: true });
}

async function attachedFetch(
  rendezvousDirectory: string,
  pathAndQuery: string,
): Promise<Response> {
  const manifest = HarnessServer.$Class.readLiveManifest(rendezvousDirectory)!;
  return fetch(`http://iv-harness${pathAndQuery}`, {
    unix: manifest.socketPath,
  });
}

test('a started server answers attached queries and reports status', async () => {
  const { fixtureRoot, rendezvousDirectory, server } = plantedFixture();
  try {
    server.start();
    expect(
      HarnessServer.$Class.readLiveManifest(rendezvousDirectory)?.pid,
    ).toBe(process.pid);
    const response = await attachedFetch(
      rendezvousDirectory,
      '/get?path=tasks.counts',
    );
    expect(response.ok).toBe(true);
    const body = (await response.json()) as {
      value: Record<string, number>;
    };
    expect(body.value['in-progress']).toBe(0);
    const status = await attachedFetch(rendezvousDirectory, '/status');
    const statusBody = (await status.json()) as { watchers: number };
    expect(statusBody.watchers).toBeGreaterThan(0);
  } finally {
    server.dispose();
    cleanup(fixtureRoot, rendezvousDirectory);
  }
});

test('a parked wait resolves when the watched files change', async () => {
  const { fixtureRoot, rendezvousDirectory, server } = plantedFixture();
  try {
    server.start();
    const waitPromise = attachedFetch(
      rendezvousDirectory,
      '/wait?path=tasks.counts.in-progress&value=1&timeoutMs=5000',
    );
    // Plant the task folder AFTER the wait parks: only a watcher event can resolve it.
    setTimeout(() => {
      const taskDirectory = join(
        fixtureRoot,
        '.invar',
        'tasks',
        'in-progress',
        '990004-planted-mid-wait',
      );
      mkdirSync(taskDirectory, { recursive: true });
      writeFileSync(
        join(taskDirectory, 'task-990004-planted-mid-wait.md'),
        '# 990004\n\nPriority: user-directed\nState: ACTIVE\n',
      );
    }, 150);
    const response = await waitPromise;
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      timedOut: boolean;
      value: unknown;
    };
    expect(body.timedOut).toBe(false);
    expect(body.value).toBe(1);
  } finally {
    server.dispose();
    cleanup(fixtureRoot, rendezvousDirectory);
  }
});

test('an already-true wait resolves immediately without a watcher event', async () => {
  const { fixtureRoot, rendezvousDirectory, server } = plantedFixture();
  try {
    server.start();
    const response = await attachedFetch(
      rendezvousDirectory,
      '/wait?path=tasks.counts.in-progress&value=0&timeoutMs=2000',
    );
    const body = (await response.json()) as { timedOut: boolean };
    expect(body.timedOut).toBe(false);
  } finally {
    server.dispose();
    cleanup(fixtureRoot, rendezvousDirectory);
  }
});

test('a wait on a condition that never comes times out with 408', async () => {
  const { fixtureRoot, rendezvousDirectory, server } = plantedFixture();
  try {
    server.start();
    const response = await attachedFetch(
      rendezvousDirectory,
      '/wait?path=tasks.counts.in-progress&value=42&timeoutMs=300',
    );
    expect(response.status).toBe(408);
    const body = (await response.json()) as { timedOut: boolean };
    expect(body.timedOut).toBe(true);
  } finally {
    server.dispose();
    cleanup(fixtureRoot, rendezvousDirectory);
  }
});

test('a wrong path over the wire is a loud 400 naming addressable keys', async () => {
  const { fixtureRoot, rendezvousDirectory, server } = plantedFixture();
  try {
    server.start();
    const response = await attachedFetch(
      rendezvousDirectory,
      '/get?path=tasks.nonsense',
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('counts');
  } finally {
    server.dispose();
    cleanup(fixtureRoot, rendezvousDirectory);
  }
});

test('the server is a disposable cache: killing it loses nothing', async () => {
  const { fixtureRoot, rendezvousDirectory, server } = plantedFixture();
  try {
    server.start();
    server.dispose();
    // invariant: A graph server is a disposable cache (iv-harness/iv-harness.invariants.md)
    expect(
      HarnessServer.$Class.readLiveManifest(rendezvousDirectory),
    ).toBeNull();
    const coldGraph = new HarnessGraph.Class({ rootDirectory: fixtureRoot });
    const counts = coldGraph.resolve('tasks.counts') as Record<string, number>;
    expect(counts['in-progress']).toBe(0);
    // A second server on the same rendezvous starts cleanly after disposal.
    const secondServer = new HarnessServer.Class({
      rootDirectory: fixtureRoot,
      rendezvousDirectory,
      gatesRegistryPath: join(fixtureRoot, 'gates-registry'),
      heartbeatPath: join(fixtureRoot, 'heartbeat'),
    });
    secondServer.start();
    expect(
      HarnessServer.$Class.readLiveManifest(rendezvousDirectory),
    ).not.toBeNull();
    secondServer.dispose();
  } finally {
    cleanup(fixtureRoot, rendezvousDirectory);
  }
});

test('a dead manifest is not a live server', () => {
  const rendezvousDirectory = mkdtempSync(
    join(tmpdir(), 'harness-server-dead-'),
  );
  try {
    writeFileSync(
      HarnessServer.$Class.manifestPath(rendezvousDirectory),
      JSON.stringify({
        pid: 999999999,
        socketPath: join(rendezvousDirectory, 'server.sock'),
        rootDirectory: '/nowhere',
        startedAt: 'never',
      }),
    );
    expect(
      HarnessServer.$Class.readLiveManifest(rendezvousDirectory),
    ).toBeNull();
  } finally {
    rmSync(rendezvousDirectory, { recursive: true, force: true });
  }
});

test('a second server on a live rendezvous refuses to start', async () => {
  const { fixtureRoot, rendezvousDirectory, server } = plantedFixture();
  try {
    server.start();
    const rivalServer = new HarnessServer.Class({
      rootDirectory: fixtureRoot,
      rendezvousDirectory,
    });
    expect(() => rivalServer.start()).toThrow(/already serves/);
  } finally {
    server.dispose();
    cleanup(fixtureRoot, rendezvousDirectory);
  }
});

test('a wire POST /stop disposes the server (GET must not)', async () => {
  const { fixtureRoot, rendezvousDirectory, server } = plantedFixture();
  try {
    server.start();
    const getResponse = await attachedFetch(rendezvousDirectory, '/stop');
    expect(getResponse.status).toBe(404); // GET must NOT stop anything
    expect(
      HarnessServer.$Class.readLiveManifest(rendezvousDirectory),
    ).not.toBeNull();
    const manifest =
      HarnessServer.$Class.readLiveManifest(rendezvousDirectory)!;
    const postResponse = await fetch('http://iv-harness/stop', {
      method: 'POST',
      unix: manifest.socketPath,
    });
    expect(postResponse.ok).toBe(true);
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
    expect(
      HarnessServer.$Class.readLiveManifest(rendezvousDirectory),
    ).toBeNull();
  } finally {
    server.dispose();
    cleanup(fixtureRoot, rendezvousDirectory);
  }
});

test('a pre-M3 manifest without bootCommit is live and harmless', () => {
  const rendezvousDirectory = mkdtempSync(
    join(tmpdir(), 'harness-server-old-'),
  );
  try {
    writeFileSync(
      HarnessServer.$Class.manifestPath(rendezvousDirectory),
      JSON.stringify({
        pid: process.pid,
        socketPath: join(rendezvousDirectory, 'server.sock'),
        rootDirectory: '/somewhere',
        startedAt: 'earlier',
      }),
    );
    const manifest = HarnessServer.$Class.readLiveManifest(rendezvousDirectory);
    expect(manifest).not.toBeNull();
    expect(manifest!.bootCommit ?? null).toBeNull();
  } finally {
    rmSync(rendezvousDirectory, { recursive: true, force: true });
  }
});
