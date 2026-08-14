#!/usr/bin/env bun
/**
 * iv-harness — the development-process graph, queryable by path.
 *
 *   bun iv-harness/cli.ts get <path>                 one query, JSON out
 *   bun iv-harness/cli.ts ls [<path>]                list keys at a node
 *   bun iv-harness/cli.ts waitFor <path> <json>      wait for a graph condition
 *   bun iv-harness/cli.ts --serve                    boot the warm server (one per checkout)
 *   bun iv-harness/cli.ts --stop                     stop this checkout's server
 *   bun iv-harness/cli.ts --server-status            manifest + live status
 *   bun iv-harness/cli.ts --self-test                both-arms self-test
 *
 * Flags: --root DIR, --rendezvous DIR, --gates FILE, --heartbeat FILE,
 * --timeout MS (waitFor).
 *
 * `get`/`ls`/`waitFor` AUTO-ATTACH to a live warm server (43ms cold is
 * fine; the server exists because watchers need a resident process) and
 * fall back to the cold one-shot read when none is up. The server is a
 * DISPOSABLE projection cache — disk stays the store; killing it at any
 * instant loses nothing.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessGraph } from './src/modules/graph/HarnessGraph.ts';
import { HarnessPrint } from './src/modules/graph/HarnessPrint.ts';
import { HarnessServer } from './src/modules/server/HarnessServer.ts';

class $HarnessCli {
  static async run(commandArguments: string[]): Promise<number> {
    const flags = this.parseFlags(commandArguments);
    if (flags.selfTest) return this.selfTest();
    const rootDirectory = flags.root ?? this.detectRoot();
    const rendezvousDirectory =
      flags.rendezvous ??
      HarnessServer.$Class.defaultRendezvousDirectory(rootDirectory);
    if (flags.serve)
      return this.serve(rootDirectory, rendezvousDirectory, flags);
    if (flags.stop) return this.stopServer(rendezvousDirectory);
    if (flags.serverStatus) return this.serverStatus(rendezvousDirectory);
    const command = flags.positional[0];
    if (command === 'get' || command === 'ls') {
      return this.query(command, flags, rootDirectory, rendezvousDirectory);
    }
    if (command === 'waitFor') {
      return this.waitFor(flags, rootDirectory, rendezvousDirectory);
    }
    process.stderr.write(this.usage());
    return 2;
  }

  static parseFlags(commandArguments: string[]): CliFlags {
    const flags: CliFlags = {
      positional: [],
      selfTest: false,
      serve: false,
      stop: false,
      serverStatus: false,
    };
    for (let index = 0; index < commandArguments.length; index++) {
      const argument = commandArguments[index]!;
      if (argument === '--root') flags.root = commandArguments[++index];
      else if (argument === '--gates') flags.gates = commandArguments[++index];
      else if (argument === '--heartbeat')
        flags.heartbeat = commandArguments[++index];
      else if (argument === '--rendezvous')
        flags.rendezvous = commandArguments[++index];
      else if (argument === '--timeout')
        flags.timeoutMilliseconds = Number(commandArguments[++index]);
      else if (argument === '--self-test') flags.selfTest = true;
      else if (argument === '--serve') flags.serve = true;
      else if (argument === '--stop') flags.stop = true;
      else if (argument === '--server-status') flags.serverStatus = true;
      else flags.positional.push(argument);
    }
    return flags;
  }

  static detectRoot(): string {
    try {
      return execFileSync('git', ['rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return process.cwd();
    }
  }

  static usage(): string {
    return (
      'usage: iv-harness (get <path> | ls [<path>] | waitFor <path> <json-value>) ' +
      '[--root DIR] [--rendezvous DIR] [--gates FILE] [--heartbeat FILE] [--timeout MS] [--limit N] [--offset K] [--full]\n' +
      '       iv-harness --serve | --stop | --server-status | --self-test\n'
    );
  }

  static coldGraph(flags: CliFlags, rootDirectory: string) {
    return new HarnessGraph.Class({
      rootDirectory,
      gatesRegistryPath: flags.gates,
      heartbeatPath: flags.heartbeat,
    });
  }

  /** Attach to a live server, or null — the caller falls back cold. */
  static async attachedFetch(
    rendezvousDirectory: string,
    pathname: string,
    parameters: Record<string, string>,
    method: 'GET' | 'POST' = 'GET',
  ): Promise<Response | null> {
    const manifest = HarnessServer.$Class.readLiveManifest(rendezvousDirectory);
    if (!manifest) return null;
    this.warnIfStale(manifest);
    const query = new URLSearchParams(parameters).toString();
    try {
      return await fetch(`http://iv-harness${pathname}?${query}`, {
        method,
        unix: manifest.socketPath,
      });
    } catch {
      return null; // dead socket behind a live-looking manifest: fall back cold
    }
  }

  /** A server booted before the current HEAD answers from old code — warn, still answer. */
  static warnIfStale(
    manifest: import('./src/modules/server/HarnessServer.ts').ServerManifest,
  ): void {
    // == null also covers manifests written before the field existed
    // (a pre-M3 server must degrade to no warning, never crash).
    if (manifest.bootCommit == null) return;
    const currentCommit = HarnessServer.$Class.currentCommit(
      manifest.rootDirectory,
    );
    if (currentCommit !== null && currentCommit !== manifest.bootCommit) {
      process.stderr.write(
        `iv-harness: warning — the warm server booted at ${manifest.bootCommit.slice(0, 8)} ` +
          `but HEAD is ${currentCommit.slice(0, 8)}; answers may run old code. ` +
          `Restart: --stop then --serve\n`,
      );
    }
  }

  static async query(
    command: 'get' | 'ls',
    flags: CliFlags,
    rootDirectory: string,
    rendezvousDirectory: string,
  ): Promise<number> {
    const path = flags.positional[1] ?? '';
    const attached = await this.attachedFetch(
      rendezvousDirectory,
      `/${command}`,
      { path },
    );
    try {
      if (attached) {
        const body = (await attached.json()) as {
          value?: unknown;
          keys?: string[];
          error?: string;
        };
        if (!attached.ok)
          throw new Error(body.error ?? `server error ${attached.status}`);
        if (command === 'ls')
          process.stdout.write((body.keys ?? []).join('\n') + '\n');
        else process.stdout.write(JSON.stringify(body.value, null, 2) + '\n');
        return 0;
      }
      const value = this.coldGraph(flags, rootDirectory).resolve(path);
      if (command === 'ls') {
        const keys = Array.isArray(value)
          ? value.map((item) => String(item))
          : value !== null && typeof value === 'object'
            ? Object.keys(value as Record<string, unknown>)
            : [];
        process.stdout.write(keys.join('\n') + '\n');
      } else {
        process.stdout.write(this.renderBounded(value, flags));
      }
      return 0;
    } catch (error) {
      process.stderr.write(`iv-harness: ${(error as Error).message}\n`);
      return 1;
    }
  }

  /** Bounded by default: big containers truncate loudly (the graph stays whole). */
  static renderBounded(value: unknown, flags: CliFlags): string {
    const bounded = HarnessPrint.Class.boundedClone(value, {
      limit: flags.printLimit,
      offset: flags.printOffset,
      full: flags.printFull,
    });
    return JSON.stringify(bounded, null, 2) + '\n';
  }

  /** Attached: the server parks the condition on its watchers. Cold: local re-derive poll. */
  static async waitFor(
    flags: CliFlags,
    rootDirectory: string,
    rendezvousDirectory: string,
  ): Promise<number> {
    const path = flags.positional[1];
    const expectedJson = flags.positional[2];
    if (path === undefined || expectedJson === undefined) {
      process.stderr.write(this.usage());
      return 2;
    }
    const timeoutMilliseconds =
      flags.timeoutMilliseconds ??
      HarnessServer.$Class.DEFAULT_WAIT_TIMEOUT_MILLISECONDS;
    const attached = await this.attachedFetch(rendezvousDirectory, '/wait', {
      path,
      value: expectedJson,
      timeoutMs: String(timeoutMilliseconds),
    });
    if (attached) {
      const body = (await attached.json()) as {
        timedOut: boolean;
        value: unknown;
      };
      process.stdout.write(JSON.stringify(body, null, 2) + '\n');
      return body.timedOut ? 1 : 0;
    }
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
      let value: unknown;
      try {
        value = this.coldGraph(flags, rootDirectory).resolve(path);
      } catch {
        value = undefined;
      }
      if (JSON.stringify(value) === expectedJson) {
        process.stdout.write(
          JSON.stringify({ timedOut: false, value }, null, 2) + '\n',
        );
        return 0;
      }
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 250));
    }
    process.stdout.write(
      JSON.stringify({ timedOut: true, value: null }, null, 2) + '\n',
    );
    return 1;
  }

  static async serve(
    rootDirectory: string,
    rendezvousDirectory: string,
    flags: CliFlags,
  ): Promise<number> {
    const server = new HarnessServer.Class({
      rootDirectory,
      rendezvousDirectory,
      gatesRegistryPath: flags.gates,
      heartbeatPath: flags.heartbeat,
      exitProcessOnStop: true,
    });
    try {
      server.start();
    } catch (error) {
      process.stderr.write(`iv-harness: ${(error as Error).message}\n`);
      return 1;
    }
    process.stdout.write(
      `iv-harness: serving ${rootDirectory}\n` +
        `iv-harness: rendezvous ${rendezvousDirectory} (pid ${process.pid})\n`,
    );
    const stopSignal = () => {
      server.dispose();
      process.exit(0);
    };
    process.on('SIGINT', stopSignal);
    process.on('SIGTERM', stopSignal);
    await new Promise(() => {}); // serve until a signal or POST /stop exits us
    return 0;
  }

  static async stopServer(rendezvousDirectory: string): Promise<number> {
    const response = await this.attachedFetch(
      rendezvousDirectory,
      '/stop',
      {},
      'POST',
    );
    if (!response || !response.ok) {
      process.stderr.write('iv-harness: no live server for this checkout\n');
      return 1;
    }
    // Both arms: report stopped only when the manifest is actually gone.
    for (let attempt = 0; attempt < 20; attempt++) {
      if (!HarnessServer.$Class.readLiveManifest(rendezvousDirectory)) {
        process.stdout.write('iv-harness: server stopped\n');
        return 0;
      }
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
    }
    process.stderr.write(
      'iv-harness: stop sent but the server still answers\n',
    );
    return 1;
  }

  static async serverStatus(rendezvousDirectory: string): Promise<number> {
    const manifest = HarnessServer.$Class.readLiveManifest(rendezvousDirectory);
    if (!manifest) {
      process.stdout.write('no live server\n');
      return 1;
    }
    const response = await this.attachedFetch(
      rendezvousDirectory,
      '/status',
      {},
    );
    if (!response) {
      process.stdout.write('manifest live but socket dead\n');
      return 1;
    }
    process.stdout.write(JSON.stringify(await response.json(), null, 2) + '\n');
    return 0;
  }

  /**
   * Both-arms self-test (Rule Two): the PRESENT arm proves the graph
   * can see a planted fixture; the ABSENT arm proves a wrong path
   * fails loudly and an empty root reads as empty, not as an error.
   * (Warm-server arms live in HarnessServer.test.ts.)
   */
  static selfTest(): number {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'iv-harness-selftest-'));
    let failures = 0;
    const check = (label: string, passed: boolean) => {
      process.stdout.write(`${passed ? 'PASS' : 'FAIL'}: ${label}\n`);
      if (!passed) failures++;
    };
    try {
      // Plant: one in-progress task with steers + meta, one green and one red gate log.
      const taskDirectory = join(
        fixtureRoot,
        '.invar',
        'tasks',
        'in-progress',
        '990001-selftest-planted-task',
      );
      mkdirSync(taskDirectory, { recursive: true });
      writeFileSync(
        join(taskDirectory, 'task-990001-selftest-planted-task.md'),
        '# 990001 — selftest planted task\n\nPriority: verification-integrity\nState: ACTIVE\nEngine: claude\n',
      );
      writeFileSync(
        join(taskDirectory, 'report-990001-selftest-planted-task.md'),
        'READY\n',
      );
      writeFileSync(
        join(taskDirectory, 'steers.log'),
        'steer one\nsteer two\n',
      );
      writeFileSync(
        join(taskDirectory, 'meta.json'),
        '{"task": 990001, "round": 2}\n',
      );
      const greenLog = join(fixtureRoot, 'gate-green.log');
      const redLog = join(fixtureRoot, 'gate-red.log');
      writeFileSync(greenLog, 'step ok\nGATE_EXIT=0\n');
      writeFileSync(redLog, 'step fail\nGATE_EXIT=1\n');
      const registry = join(fixtureRoot, 'gates-registry');
      writeFileSync(
        registry,
        `${greenLog}\n${redLog}\n${join(fixtureRoot, 'gate-gone.log')}\n`,
      );
      const heartbeat = join(fixtureRoot, 'heartbeat');
      writeFileSync(heartbeat, 'alive\n');

      const graph = new HarnessGraph.Class({
        rootDirectory: fixtureRoot,
        gatesRegistryPath: registry,
        heartbeatPath: heartbeat,
      });

      // PRESENT arm — the graph sees what was planted.
      const counts = graph.resolve('tasks.counts') as Record<string, number>;
      check('planted task counted in-progress', counts['in-progress'] === 1);
      const planted = graph.resolve('tasks.byNumber.990001') as Record<
        string,
        unknown
      >;
      check(
        'task node carries priority',
        planted['priority'] === 'verification-integrity',
      );
      check('task node counts steers', planted['steerCount'] === 2);
      check('task node sees the report', planted['hasReport'] === true);
      check(
        'task node reads meta round',
        (planted['meta'] as Record<string, unknown>)['round'] === 2,
      );
      const gates = graph.gates;
      check(
        'green gate read as green',
        gates.green.length === 1 && gates.green[0]!.exit === 0,
      );
      check(
        'red gate read as red',
        gates.red.length === 1 && gates.red[0]!.exit === 1,
      );
      check(
        'missing gate log read as missing',
        gates.registered.some((gateRun) => gateRun.verdict === 'missing'),
      );
      const heartbeatNode = graph.fleet.heartbeat;
      check('fresh heartbeat read as fresh', heartbeatNode.fresh === true);

      // ABSENT arm — misses are loud, emptiness is empty.
      let missError: string | null = null;
      try {
        graph.resolve('tasks.nonsense');
      } catch (error) {
        missError = (error as Error).message;
      }
      check('wrong path fails loudly', missError !== null);
      check(
        'miss names addressable keys',
        missError !== null && missError.includes('counts'),
      );
      const emptyRoot = mkdtempSync(join(tmpdir(), 'iv-harness-empty-'));
      try {
        const emptyGraph = new HarnessGraph.Class({
          rootDirectory: emptyRoot,
          gatesRegistryPath: join(emptyRoot, 'no-registry'),
          heartbeatPath: join(emptyRoot, 'no-heartbeat'),
        });
        const emptyCounts = emptyGraph.resolve('tasks.counts') as Record<
          string,
          number
        >;
        check(
          'empty root reads zero tasks, not error',
          emptyCounts['active'] === 0,
        );
        check(
          'absent registry reads empty, not error',
          emptyGraph.gates.registered.length === 0,
        );
        check(
          'absent heartbeat reads stale, not error',
          emptyGraph.fleet.heartbeat.fresh === false,
        );
      } finally {
        rmSync(emptyRoot, { recursive: true, force: true });
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
    process.stdout.write(
      failures === 0 ? 'SELF-TEST GREEN\n' : `SELF-TEST RED (${failures})\n`,
    );
    return failures === 0 ? 0 : 1;
  }
}

interface CliFlags {
  positional: string[];
  root?: string;
  gates?: string;
  heartbeat?: string;
  rendezvous?: string;
  timeoutMilliseconds?: number;
  printLimit?: number;
  printOffset?: number;
  printFull?: boolean;
  selfTest: boolean;
  serve: boolean;
  stop: boolean;
  serverStatus: boolean;
}

process.exit(await $HarnessCli.run(process.argv.slice(2)));
