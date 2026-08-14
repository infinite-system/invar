import { Reactive } from 'ivue';
import { ref } from 'vue';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  watch as watchFileSystem,
  writeFileSync,
  type FSWatcher,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { HarnessGraph } from '../graph/HarnessGraph.ts';
import { HarnessGateRuns } from '../gates/HarnessGateRuns.ts';
import { HarnessVerbs } from '../verbs/HarnessVerbs.ts';
import { HarnessShapes } from '../shapes/HarnessShapes.ts';

/**
 * The warm graph server: boots the process graph ONCE per checkout,
 * watches the underlying files, and answers attached clients over a
 * unix socket in a checkout-keyed rendezvous directory (the
 * DriveSession --serve/--attach convention).
 *
 * It is a DISPOSABLE projection cache: watchers only bump version
 * signals, every answer re-derives from disk, and killing the server
 * at any instant loses nothing — clients fall back to cold one-shot.
 */
// invariant: A graph server is a disposable cache (iv-harness/iv-harness.invariants.md)
// invariant: Disk is the store and the graph is a projection (iv-harness/iv-harness.invariants.md)
class $HarnessServer {
  static defaultRendezvousDirectory(rootDirectory: string): string {
    const slug = rootDirectory
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `/tmp/iv-harness-server-${slug}`;
  }

  static manifestPath(rendezvousDirectory: string): string {
    return join(rendezvousDirectory, 'manifest.json');
  }

  static socketPath(rendezvousDirectory: string): string {
    return join(rendezvousDirectory, 'server.sock');
  }

  /** A manifest is live only when its pid still answers signal 0. */
  static readLiveManifest(rendezvousDirectory: string): ServerManifest | null {
    const manifestPath = this.manifestPath(rendezvousDirectory);
    if (!existsSync(manifestPath)) return null;
    let manifest: ServerManifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      return null;
    }
    try {
      process.kill(manifest.pid, 0);
    } catch {
      return null;
    }
    return manifest;
  }

  static get REWIRE_COALESCE_MILLISECONDS(): number {
    return 100;
  }

  static get DEFAULT_WAIT_TIMEOUT_MILLISECONDS(): number {
    return 10000;
  }

  /** The commit a server booted from, or null outside git — the staleness anchor. */
  static currentCommit(rootDirectory: string): string | null {
    try {
      return execFileSync('git', ['-C', rootDirectory, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return null;
    }
  }

  constructor(public options: HarnessServerOptions) {}

  // Engine-provided on Reactive instances (house pattern: declare, no emit).
  declare $watch: typeof import('vue').watch;
  declare $stopEffects: () => void;

  // Non-reactive runtime handles (keyed-pattern plain storage): nothing
  // observes these — the version signals below carry the reactivity.
  protected readonly fileWatchers: FSWatcher[] = [];
  protected readonly parkedWaits = new Map<number, ParkedWait>();
  protected parkedSequence = 0;
  protected bunServer: ReturnType<typeof Bun.serve> | null = null;
  protected rewireTimer: ReturnType<typeof setTimeout> | null = null;

  // --- version signals (one per domain; watchers bump, waits observe) ---

  get tasksVersion() {
    return ref(0);
  }
  get gatesVersion() {
    return ref(0);
  }
  get fleetVersion() {
    return ref(0);
  }

  // --- derived handles ---

  protected get $graph() {
    return new HarnessGraph.Class({
      rootDirectory: this.options.rootDirectory,
      gatesRegistryPath: this.options.gatesRegistryPath,
      heartbeatPath: this.options.heartbeatPath,
    });
  }

  get rendezvousDirectory(): string {
    return this.options.rendezvousDirectory;
  }

  get gatesRegistryPath(): string {
    return this.$graph.gatesRegistryPath;
  }

  get heartbeatPath(): string {
    return this.$graph.heartbeatPath;
  }

  // --- lifecycle ---

  start(): void {
    const existing = $HarnessServer.readLiveManifest(this.rendezvousDirectory);
    if (existing) {
      throw new Error(
        `a live server already serves this checkout (pid ${existing.pid}); ` +
          `stop it first or attach to it`,
      );
    }
    mkdirSync(this.rendezvousDirectory, { recursive: true });
    const socketPath = $HarnessServer.socketPath(this.rendezvousDirectory);
    rmSync(socketPath, { force: true });
    this.wireWatchers();
    this.$watch(
      () => [
        this.tasksVersion.value,
        this.gatesVersion.value,
        this.fleetVersion.value,
      ],
      () => this.evaluateParkedWaits(),
    );
    this.bunServer = Bun.serve({
      unix: socketPath,
      fetch: (request) => this.handleRequest(request),
    });
    writeFileSync(
      $HarnessServer.manifestPath(this.rendezvousDirectory),
      JSON.stringify(
        {
          pid: process.pid,
          socketPath,
          rootDirectory: this.options.rootDirectory,
          startedAt: new Date().toISOString(),
          bootCommit: $HarnessServer.currentCommit(this.options.rootDirectory),
        },
        null,
        2,
      ) + '\n',
    );
  }

  dispose(): void {
    for (const watcher of this.fileWatchers) watcher.close();
    this.fileWatchers.length = 0;
    if (this.rewireTimer) clearTimeout(this.rewireTimer);
    for (const parkedWait of this.parkedWaits.values()) {
      clearTimeout(parkedWait.timeoutTimer);
      parkedWait.settle({ timedOut: true, value: null });
    }
    this.parkedWaits.clear();
    this.bunServer?.stop(true);
    this.bunServer = null;
    rmSync($HarnessServer.manifestPath(this.rendezvousDirectory), {
      force: true,
    });
    rmSync($HarnessServer.socketPath(this.rendezvousDirectory), {
      force: true,
    });
    this.$stopEffects();
  }

  // --- watcher wiring (bump-only: answers always re-derive from disk) ---

  protected wireWatchers(): void {
    for (const watcher of this.fileWatchers) watcher.close();
    this.fileWatchers.length = 0;
    for (const directory of this.taskDirectoriesToWatch()) {
      this.watchPath(directory, () => this.onTasksEvent());
    }
    const registryDirectory = dirname(this.gatesRegistryPath);
    const registryName = basename(this.gatesRegistryPath);
    this.watchPath(registryDirectory, (changedName) => {
      if (changedName === registryName) this.onGatesEvent();
    });
    for (const gateRun of HarnessGateRuns.Class.readRegistry(
      this.gatesRegistryPath,
    )) {
      if (gateRun.exists)
        this.watchPath(gateRun.log, () => this.onGatesEvent());
    }
    const heartbeatDirectory = dirname(this.heartbeatPath);
    const heartbeatName = basename(this.heartbeatPath);
    this.watchPath(heartbeatDirectory, (changedName) => {
      if (changedName === heartbeatName) this.fleetVersion.value++;
    });
  }

  protected taskDirectoriesToWatch(): string[] {
    const tasksRoot = join(this.options.rootDirectory, '.invar', 'tasks');
    const directories: string[] = [];
    if (!existsSync(tasksRoot)) return directories;
    directories.push(tasksRoot);
    for (const stateName of readdirSync(tasksRoot)) {
      const stateDirectory = join(tasksRoot, stateName);
      directories.push(stateDirectory);
      if (stateName === 'in-progress' || stateName === 'active') {
        try {
          for (const folderName of readdirSync(stateDirectory)) {
            directories.push(join(stateDirectory, folderName));
          }
        } catch {
          // a state folder may be a stray file; skip it
        }
      }
    }
    return directories;
  }

  protected watchPath(
    watchedPath: string,
    onEvent: (changedName: string | null) => void,
  ): void {
    try {
      const watcher = watchFileSystem(watchedPath, (_eventType, fileName) =>
        onEvent(fileName === null ? null : String(fileName)),
      );
      watcher.on('error', () => watcher.close());
      this.fileWatchers.push(watcher);
    } catch {
      // the path vanished between listing and watching; the next rewire heals
    }
  }

  onTasksEvent(): void {
    this.tasksVersion.value++;
    this.scheduleRewire();
  }

  onGatesEvent(): void {
    this.gatesVersion.value++;
    this.scheduleRewire();
  }

  /** Folder sets change (task moves, new gate logs) — re-derive the watch set, coalesced. */
  protected scheduleRewire(): void {
    if (this.rewireTimer) return;
    this.rewireTimer = setTimeout(() => {
      this.rewireTimer = null;
      this.wireWatchers();
    }, $HarnessServer.REWIRE_COALESCE_MILLISECONDS);
  }

  // --- parked waits (a wait is a condition, evaluated on watcher events) ---

  parkWait(
    path: string,
    expectedJson: string,
    timeoutMilliseconds: number,
  ): Promise<ParkedWaitResult> {
    const immediate = this.tryMatch(path, expectedJson);
    if (immediate !== null) return Promise.resolve(immediate);
    return new Promise((resolve) => {
      const waitId = ++this.parkedSequence;
      const timeoutTimer = setTimeout(() => {
        this.parkedWaits.delete(waitId);
        resolve({ timedOut: true, value: null });
      }, timeoutMilliseconds);
      this.parkedWaits.set(waitId, {
        path,
        expectedJson,
        timeoutTimer,
        settle: (result) => {
          clearTimeout(timeoutTimer);
          this.parkedWaits.delete(waitId);
          resolve(result);
        },
      });
    });
  }

  evaluateParkedWaits(): void {
    for (const parkedWait of [...this.parkedWaits.values()]) {
      const match = this.tryMatch(parkedWait.path, parkedWait.expectedJson);
      if (match !== null) parkedWait.settle(match);
    }
  }

  protected tryMatch(
    path: string,
    expectedJson: string,
  ): ParkedWaitResult | null {
    let value: unknown;
    try {
      value = this.$graph.resolve(path);
    } catch {
      return null;
    }
    return JSON.stringify(value) === expectedJson
      ? { timedOut: false, value }
      : null;
  }

  // --- the wire protocol ---

  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body, null, 2) + '\n', {
        status,
        headers: { 'content-type': 'application/json' },
      });
    try {
      if (url.pathname === '/status') {
        return json({
          pid: process.pid,
          rootDirectory: this.options.rootDirectory,
          bootCommit:
            $HarnessServer.readLiveManifest(this.rendezvousDirectory)
              ?.bootCommit ?? null,
          watchers: this.fileWatchers.length,
          parkedWaits: this.parkedWaits.size,
          versions: {
            tasks: this.tasksVersion.value,
            gates: this.gatesVersion.value,
            fleet: this.fleetVersion.value,
          },
        });
      }
      if (url.pathname === '/get' || url.pathname === '/ls') {
        const path = url.searchParams.get('path') ?? '';
        const value = this.$graph.resolve(path);
        if (url.pathname === '/get') return json({ value });
        const keys = Array.isArray(value)
          ? value.map((item) => String(item))
          : value !== null && typeof value === 'object'
            ? Object.keys(value as Record<string, unknown>)
            : [];
        return json({ keys });
      }
      if (url.pathname === '/wait') {
        const path = url.searchParams.get('path') ?? '';
        const expectedJson = url.searchParams.get('value') ?? 'null';
        const timeoutMilliseconds = Number(
          url.searchParams.get('timeoutMs') ??
            $HarnessServer.DEFAULT_WAIT_TIMEOUT_MILLISECONDS,
        );
        const result = await this.parkWait(
          path,
          expectedJson,
          timeoutMilliseconds,
        );
        return json(result, result.timedOut ? 408 : 200);
      }
      if (url.pathname === '/describe') {
        const subject = url.searchParams.get('subject') ?? '';
        return json(
          HarnessShapes.Class.describe(this.options.rootDirectory, subject),
        );
      }
      if (url.pathname === '/run' && request.method === 'POST') {
        const verbName = url.searchParams.get('verb') ?? '';
        const verbArguments = url.searchParams.getAll('argument');
        const result = HarnessVerbs.Class.run(
          this.options.rootDirectory,
          verbName,
          verbArguments,
        );
        return json(result, result.ok ? 200 : 502);
      }
      if (url.pathname === '/stop' && request.method === 'POST') {
        setTimeout(() => {
          this.dispose();
          if (this.options.exitProcessOnStop) process.exit(0);
        }, 10);
        return json({ stopping: true });
      }
      return json({ error: `no route ${url.pathname}` }, 404);
    } catch (error) {
      return json({ error: (error as Error).message }, 400);
    }
  }
}

export namespace HarnessServer {
  export const $Class = $HarnessServer;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface HarnessServerOptions {
  rootDirectory: string;
  rendezvousDirectory: string;
  gatesRegistryPath?: string;
  heartbeatPath?: string;
  /** --serve sets this: a wire /stop disposes AND exits the process. */
  exitProcessOnStop?: boolean;
}

export interface ServerManifest {
  pid: number;
  socketPath: string;
  rootDirectory: string;
  startedAt: string;
  bootCommit: string | null;
}

export interface ParkedWaitResult {
  timedOut: boolean;
  value: unknown;
}

interface ParkedWait {
  path: string;
  expectedJson: string;
  timeoutTimer: ReturnType<typeof setTimeout>;
  settle: (result: ParkedWaitResult) => void;
}
