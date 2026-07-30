import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logging } from './Logging';

const originalLogPath = process.env.TUI_LOG_PATH;

function runLoggerInChildProcess(environment: Record<string, string>): {
  logText: string;
  instance: string;
} {
  const directory = mkdtempSync(join(tmpdir(), 'invar-logging-test-'));
  const logPath = join(directory, 'tui.log');
  const childSource = join(directory, 'child.ts');
  Bun.write(
    childSource,
    [
      `import { Logging } from ${JSON.stringify(join(import.meta.dir, 'Logging.ts'))};`,
      `Logging.Class.info('probe line');`,
      `console.log(Logging.Class.instance);`,
    ].join('\n'),
  );
  const result = Bun.spawnSync([process.execPath, 'run', childSource], {
    env: { ...process.env, TUI_LOG_PATH: logPath, ...environment },
  });
  expect(result.exitCode).toBe(0);
  return {
    logText: readFileSync(logPath, 'utf8'),
    instance: new TextDecoder().decode(result.stdout).trim(),
  };
}

test('the logger publishes its artifact path through the capability seam', () => {
  delete process.env.TUI_LOG_PATH;
  try {
    expect(Logging.Class.path).toBe('artifacts/tui.log');
  } finally {
    if (originalLogPath !== undefined)
      process.env.TUI_LOG_PATH = originalLogPath;
  }
});

test('a declared log path replaces the shared repository-relative default', () => {
  const declaredPath = join(
    mkdtempSync(join(tmpdir(), 'invar-logging-path-')),
    'declared.log',
  );
  process.env.TUI_LOG_PATH = declaredPath;
  try {
    expect(Logging.Class.path).toBe(declaredPath);
  } finally {
    if (originalLogPath === undefined) delete process.env.TUI_LOG_PATH;
    else process.env.TUI_LOG_PATH = originalLogPath;
  }
});

test('every written line carries the writing instance identity', () => {
  const { logText, instance } = runLoggerInChildProcess({});
  expect(instance.length).toBeGreaterThan(0);
  expect(logText).toContain(`[instance=${instance}] probe line`);
});

test('a declared instance identity is what the line carries', () => {
  const { logText, instance } = runLoggerInChildProcess({
    TUI_LOG_INSTANCE: 'declared-identity-90',
  });
  expect(instance).toBe('declared-identity-90');
  expect(logText).toContain('[instance=declared-identity-90] probe line');
});

test('two undeclared processes never share an identity', () => {
  const first = runLoggerInChildProcess({});
  const second = runLoggerInChildProcess({});
  expect(first.instance).not.toBe(second.instance);
});
