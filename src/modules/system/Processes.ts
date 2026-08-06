import { Static } from 'ivue/extras';

class $Processes {
  static which(command: string): string | null {
    return Bun.which(command);
  }

  /**
   * Spawn an external tool from an argument vector without a shell, under the shared hermetic
   * environment policy. Callers own streaming, exit handling, and launch-failure containment.
   *
   * The interactive terminal PTY is deliberately outside this seam: OpenPtyBackend attaches all
   * three standard streams to a slave file descriptor and must preserve the user's complete
   * interactive environment. That is a different environment generator, not an external-tool
   * exception to this policy.
   *
   * invariant: Language and git tools are separate failable processes (project.invariants.md)
   * invariant: External tools share one launch policy (src/modules/system/system.invariants.md)
   */
  static spawn<
    const Input extends Bun.Spawn.Writable = 'ignore',
    const Output extends Bun.Spawn.Readable = 'pipe',
    const ErrorOutput extends Bun.Spawn.Readable = 'inherit',
  >(
    argumentVector: string[],
    options?: ProcessSpawnOptions<Input, Output, ErrorOutput>,
  ): SpawnedProcess<Input, Output, ErrorOutput> {
    return Bun.spawn(argumentVector, {
      ...options,
      env: this.hermeticEnvironment(),
    });
  }

  /**
   * The parent environment with every GIT_* variable removed. A subprocess run here is scoped to an
   * explicit `cwd`; an ambient GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE (set, for example, when the
   * app or the test suite is spawned from inside a git hook) would OVERRIDE that cwd and make `git`
   * operate on the parent repo instead of the one at `cwd` — a hermeticity break. No subprocess the
   * app runs (git, ripgrep, language servers) wants the ambient git context, so strip it once here.
   */
  protected static hermeticEnvironment(): Record<string, string> {
    const environment: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined || key.startsWith('GIT_')) continue;
      environment[key] = value;
    }
    return environment;
  }

  /**
   * Run `argumentVector` (no shell) in `cwd`, capturing output. Never throws on non-zero exit or a
   * missing binary — returns a RunResult with ok=false so callers degrade gracefully.
   */
  static async run(
    argumentVector: string[],
    cwd?: string,
    input?: string,
  ): Promise<RunResult> {
    try {
      const subprocess = this.spawn(argumentVector, {
        cwd,
        stdin: input ? 'pipe' : 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (input && subprocess.stdin) {
        subprocess.stdin.write(input);
        await subprocess.stdin.end();
      }
      const [stdout, stderr, code] = await Promise.all([
        new Response(subprocess.stdout).text(),
        new Response(subprocess.stderr).text(),
        subprocess.exited,
      ]);
      return { code, stdout, stderr, ok: code === 0 };
    } catch (error) {
      return { code: -1, stdout: '', stderr: String(error), ok: false };
    }
  }
}

export namespace Processes {
  export const $Class = Static($Processes);
  export let Class = $Class;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  ok: boolean;
}

export type ProcessSpawnOptions<
  Input extends Bun.Spawn.Writable,
  Output extends Bun.Spawn.Readable,
  ErrorOutput extends Bun.Spawn.Readable,
> = Omit<Bun.Spawn.SpawnOptions<Input, Output, ErrorOutput>, 'env'>;

export type SpawnedProcess<
  Input extends Bun.Spawn.Writable,
  Output extends Bun.Spawn.Readable,
  ErrorOutput extends Bun.Spawn.Readable,
> = Bun.Subprocess<Input, Output, ErrorOutput>;
