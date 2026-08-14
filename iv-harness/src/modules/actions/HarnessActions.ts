import { Static } from 'ivue/extras';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HarnessVerbs } from '../verbs/HarnessVerbs.ts';
import { HarnessGateRuns } from '../gates/HarnessGateRuns.ts';

/**
 * Conductor action verbs: the fact-producing acts (commit, test, gate)
 * carry their safety rules structurally and leave typed ledger events —
 * so a claim about what happened is contradictable data, not a mood.
 * Guards harvested from real incidents, one planted-defect test each.
 */
// invariant: Only the files arbitrate process state (iv-harness/iv-harness.invariants.md)
// invariant: A wrapped script keeps its logic in one place (iv-harness/iv-harness.invariants.md)
class $HarnessActions {
  static get GATE_TREE_STAMP_PREFIX(): string {
    return 'GATE_TREE=';
  }

  static get GATE_TIP_STAMP_PREFIX(): string {
    return 'GATE_TREE_TIP=';
  }

  static git(workingDirectory: string, gitArguments: string[]): string {
    return execFileSync('git', ['-C', workingDirectory, ...gitArguments], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  /**
   * Guarded commit. Refuses: pathless staging outside a fleet worktree
   * (the add -A sweep), and committing into a tree whose registered
   * gate is still running (the mid-gate edit). Verifies afterward that
   * the named paths actually landed (the commit -a lesson).
   */
  static commit(
    rootDirectory: string,
    options: CommitOptions,
    gatesRegistryPath: string,
  ): CommitResult {
    const isFleetWorktree = rootDirectory.includes('/.invar/worktrees/');
    if ((options.paths?.length ?? 0) === 0 && !isFleetWorktree) {
      throw new Error(
        'commit refused: pathless staging (add -A) is allowed only inside a ' +
          'fleet worktree — name the paths explicitly in a primary checkout',
      );
    }
    const runningGate = this.runningGateFor(rootDirectory, gatesRegistryPath);
    if (runningGate !== null) {
      throw new Error(
        `commit refused: a registered gate is mid-run on this tree (${runningGate}) — ` +
          'a gate reads the live tree; commit after its verdict',
      );
    }
    const startedAt = new Date().toISOString();
    const startedMilliseconds = Date.now();
    if (options.paths && options.paths.length > 0) {
      this.git(rootDirectory, ['add', '--', ...options.paths]);
    } else {
      this.git(rootDirectory, ['add', '-A']);
    }
    execFileSync(
      'git',
      ['-C', rootDirectory, 'commit', '-m', options.message],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...(options.skipGate ? { SKIP_GATE: '1' } : {}),
        },
      },
    );
    const commitHash = this.git(rootDirectory, ['rev-parse', 'HEAD']);
    const leftBehind = (options.paths ?? []).filter(
      (path) =>
        this.git(rootDirectory, ['status', '--short', '--', path]).length > 0,
    );
    const result: CommitResult = {
      commitHash: commitHash.slice(0, 12),
      claimedPathsClean: leftBehind.length === 0,
      leftBehind,
    };
    HarnessVerbs.Class.appendEvent(rootDirectory, {
      verb: 'action.commit',
      arguments: options.paths ?? ['<all>'],
      ok: result.claimedPathsClean,
      exitCode: result.claimedPathsClean ? 0 : 1,
      lines: [result.commitHash],
      startedAt,
      durationMilliseconds: Date.now() - startedMilliseconds,
    });
    if (leftBehind.length > 0) {
      throw new Error(
        `commit landed ${result.commitHash} but claimed paths remain dirty: ` +
          leftBehind.join(', '),
      );
    }
    return result;
  }

  /** A registered log naming this tree with no verdict yet = a running gate. */
  static runningGateFor(
    rootDirectory: string,
    gatesRegistryPath: string,
  ): string | null {
    for (const gateRun of HarnessGateRuns.Class.readRegistry(
      gatesRegistryPath,
    )) {
      if (!gateRun.exists || gateRun.verdict !== 'running') continue;
      let text = '';
      try {
        text = readFileSync(gateRun.log, 'utf8');
      } catch {
        continue;
      }
      if (text.includes(`${this.GATE_TREE_STAMP_PREFIX}${rootDirectory}\n`)) {
        return gateRun.log;
      }
    }
    return null;
  }

  /**
   * Test run with parsed counts: a claim of green becomes data. The
   * counts come from bun test's own summary lines, never a tail glance.
   */
  static test(rootDirectory: string, target: string): TestResult {
    const startedAt = new Date().toISOString();
    const startedMilliseconds = Date.now();
    // bun test writes its pass/fail summary to STDERR — capture both
    // streams or the counts are invisible (the verb's own blind spot,
    // caught by its colocated test).
    const spawned = spawnSync('bun', ['test', target], {
      cwd: rootDirectory,
      encoding: 'utf8',
    });
    const exitCode = spawned.status ?? 1;
    const output = String(spawned.stdout ?? '') + String(spawned.stderr ?? '');
    const passCount = Number(output.match(/^\s*(\d+) pass/m)?.[1] ?? 0);
    const failCount = Number(output.match(/^\s*(\d+) fail/m)?.[1] ?? 0);
    const result: TestResult = {
      target,
      exitCode,
      passCount,
      failCount,
      green: exitCode === 0 && failCount === 0 && passCount > 0,
    };
    HarnessVerbs.Class.appendEvent(rootDirectory, {
      verb: 'action.test',
      arguments: [target],
      ok: result.green,
      exitCode,
      lines: [`pass=${passCount}`, `fail=${failCount}`],
      startedAt,
      durationMilliseconds: Date.now() - startedMilliseconds,
    });
    return result;
  }

  /**
   * Stamped gate: writes the tree and its tip into the log header and
   * registers the log, then runs the repo's own merge-gate script (the
   * one-place rule — no gate logic here). land.sh's tip guard compares
   * the stamp against what it is asked to land.
   */
  static gate(
    rootDirectory: string,
    logPath: string,
    gatesRegistryPath: string,
  ): GateResult {
    const treeTip = this.git(rootDirectory, ['rev-parse', 'HEAD']);
    const header =
      `${this.GATE_TREE_STAMP_PREFIX}${rootDirectory}\n` +
      `${this.GATE_TIP_STAMP_PREFIX}${treeTip}\n`;
    appendFileSync(logPath, header);
    appendFileSync(gatesRegistryPath, logPath + '\n');
    const startedAt = new Date().toISOString();
    const startedMilliseconds = Date.now();
    const gateScript = join(rootDirectory, 'scripts', 'merge-gate.sh');
    if (!existsSync(gateScript)) {
      throw new Error(`no gate script at ${gateScript}`);
    }
    let exitCode = 0;
    try {
      execFileSync(
        'bash',
        ['-c', `bash '${gateScript}' >> '${logPath}' 2>&1`],
        {
          cwd: rootDirectory,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch (error) {
      exitCode = (error as { status?: number }).status ?? 1;
    }
    const verdict = HarnessGateRuns.Class.readGateLog(logPath);
    HarnessVerbs.Class.appendEvent(rootDirectory, {
      verb: 'action.gate',
      arguments: [logPath],
      ok: verdict.verdict === 'green',
      exitCode,
      lines: [`verdict=${verdict.verdict}`, `tip=${treeTip.slice(0, 12)}`],
      startedAt,
      durationMilliseconds: Date.now() - startedMilliseconds,
    });
    return {
      log: logPath,
      treeTip: treeTip.slice(0, 12),
      verdict: verdict.verdict,
    };
  }
}

export namespace HarnessActions {
  export const $Class = Static($HarnessActions);
  export let Class = $Class;
}

export interface CommitOptions {
  message: string;
  paths?: string[];
  skipGate?: boolean;
}

export interface CommitResult {
  commitHash: string;
  claimedPathsClean: boolean;
  leftBehind: string[];
}

export interface TestResult {
  target: string;
  exitCode: number;
  passCount: number;
  failCount: number;
  green: boolean;
}

export interface GateResult {
  log: string;
  treeTip: string;
  verdict: string;
}
