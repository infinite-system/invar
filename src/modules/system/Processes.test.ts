import { expect, test } from 'bun:test';
import { Processes } from './Processes';

test('spawn preserves argument boundaries and strips ambient git variables', async () => {
  const gitEnvironmentName = 'GIT_INVAR_PROCESSES_TEST';
  const retainedEnvironmentName = 'INVAR_PROCESSES_TEST';
  const previousGitEnvironmentValue = process.env[gitEnvironmentName];
  const previousRetainedEnvironmentValue = process.env[retainedEnvironmentName];
  process.env[gitEnvironmentName] = 'must-not-leak';
  process.env[retainedEnvironmentName] = 'must-survive';

  try {
    const literalArgument = 'argument with spaces; $HOME $(printf unsafe)';
    const subprocess = Processes.Class.spawn([
      process.execPath,
      '-e',
      `process.stdout.write(JSON.stringify({
        gitEnvironmentNames: Object.keys(process.env).filter((environmentName) => environmentName.startsWith('GIT_')),
        retainedEnvironmentValue: process.env.${retainedEnvironmentName},
        literalArgument: process.argv[1],
      }))`,
      literalArgument,
    ], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
      subprocess.exited,
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({
      gitEnvironmentNames: [],
      retainedEnvironmentValue: 'must-survive',
      literalArgument,
    });
  } finally {
    restoreEnvironmentValue(gitEnvironmentName, previousGitEnvironmentValue);
    restoreEnvironmentValue(retainedEnvironmentName, previousRetainedEnvironmentValue);
  }
});

test('run captures output through the shared spawn policy', async () => {
  const gitEnvironmentName = 'GIT_INVAR_PROCESSES_RUN_TEST';
  const previousGitEnvironmentValue = process.env[gitEnvironmentName];
  process.env[gitEnvironmentName] = 'must-not-leak';

  try {
    const result = await Processes.Class.run([
      process.execPath,
      '-e',
      `process.stdout.write(process.env.${gitEnvironmentName} ?? 'clean')`,
    ]);

    expect(result).toEqual({
      code: 0,
      stdout: 'clean',
      stderr: '',
      ok: true,
    });
  } finally {
    restoreEnvironmentValue(gitEnvironmentName, previousGitEnvironmentValue);
  }
});

function restoreEnvironmentValue(environmentName: string, previousEnvironmentValue: string | undefined): void {
  if (previousEnvironmentValue === undefined) {
    delete process.env[environmentName];
    return;
  }
  process.env[environmentName] = previousEnvironmentValue;
}
