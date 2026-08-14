#!/usr/bin/env bun
/**
 * iv-harness — the development-process graph, queryable by path.
 *
 *   bun iv-harness/cli.ts get <path> [--root DIR]     one query, JSON out
 *   bun iv-harness/cli.ts ls [<path>] [--root DIR]    list keys at a node
 *   bun iv-harness/cli.ts --self-test                 both-arms self-test
 *
 * Examples:
 *   bun iv-harness/cli.ts get tasks.counts
 *   bun iv-harness/cli.ts get tasks.inProgress
 *   bun iv-harness/cli.ts get tasks.byNumber.553
 *   bun iv-harness/cli.ts get gates.last
 *   bun iv-harness/cli.ts get lanes.fleet
 *   bun iv-harness/cli.ts get fleet.heartbeat
 *
 * The graph is a projection of disk (task folders, git, gate logs);
 * it holds nothing a crash could lose. Overrides for foreign roots:
 * --root DIR, --gates FILE, --heartbeat FILE.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessGraph } from './src/modules/graph/HarnessGraph.ts';

class $HarnessCli {
  static run(commandArguments: string[]): number {
    const flags = this.parseFlags(commandArguments);
    if (flags.selfTest) return this.selfTest();
    const command = flags.positional[0];
    if (command !== 'get' && command !== 'ls') {
      process.stderr.write(this.usage());
      return 2;
    }
    const graph = new HarnessGraph.Class({
      rootDirectory: flags.root ?? this.detectRoot(),
      gatesRegistryPath: flags.gates,
      heartbeatPath: flags.heartbeat,
    });
    const path = flags.positional[1] ?? '';
    try {
      const value = graph.resolve(path);
      if (command === 'ls') {
        const keys = Array.isArray(value)
          ? value.map((item) => String(item))
          : value !== null && typeof value === 'object'
            ? Object.keys(value as Record<string, unknown>)
            : [];
        process.stdout.write(keys.join('\n') + '\n');
      } else {
        process.stdout.write(JSON.stringify(value, null, 2) + '\n');
      }
      return 0;
    } catch (error) {
      process.stderr.write(`iv-harness: ${(error as Error).message}\n`);
      return 1;
    }
  }

  static parseFlags(commandArguments: string[]): {
    positional: string[];
    root?: string;
    gates?: string;
    heartbeat?: string;
    selfTest: boolean;
  } {
    const positional: string[] = [];
    let root: string | undefined;
    let gates: string | undefined;
    let heartbeat: string | undefined;
    let selfTest = false;
    for (let index = 0; index < commandArguments.length; index++) {
      const argument = commandArguments[index]!;
      if (argument === '--root') root = commandArguments[++index];
      else if (argument === '--gates') gates = commandArguments[++index];
      else if (argument === '--heartbeat')
        heartbeat = commandArguments[++index];
      else if (argument === '--self-test') selfTest = true;
      else positional.push(argument);
    }
    return { positional, root, gates, heartbeat, selfTest };
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
    return 'usage: iv-harness (get <path> | ls [<path>]) [--root DIR] [--gates FILE] [--heartbeat FILE] | --self-test\n';
  }

  /**
   * Both-arms self-test (Rule Two): the PRESENT arm proves the graph
   * can see a planted fixture; the ABSENT arm proves a wrong path
   * fails loudly and an empty root reads as empty, not as an error.
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
        '901-selftest-planted-task',
      );
      mkdirSync(taskDirectory, { recursive: true });
      writeFileSync(
        join(taskDirectory, 'task-901-selftest-planted-task.md'),
        '# 901 — selftest planted task\n\nPriority: verification-integrity\nState: ACTIVE\nEngine: claude\n',
      );
      writeFileSync(
        join(taskDirectory, 'report-901-selftest-planted-task.md'),
        'READY\n',
      );
      writeFileSync(
        join(taskDirectory, 'steers.log'),
        'steer one\nsteer two\n',
      );
      writeFileSync(
        join(taskDirectory, 'meta.json'),
        '{"task": 901, "round": 2}\n',
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
      const planted = graph.resolve('tasks.byNumber.901') as Record<
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

process.exit($HarnessCli.run(process.argv.slice(2)));
