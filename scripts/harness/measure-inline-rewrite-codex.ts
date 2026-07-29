#!/usr/bin/env bun
// Opt-in real-Codex inline-rewrite latency instrument. The observation boundary is the request-now
// chord write to the first status projection that says a proposal is visible.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

if (process.env.INVAR_REAL_CODEX_INLINE_REWRITE !== '1') {
  console.log(
    'SKIP set INVAR_REAL_CODEX_INLINE_REWRITE=1 to run one billed Codex request',
  );
  process.exit(0);
}

if (!Bun.which('codex')) {
  throw new Error('codex is not available on PATH');
}

const repositoryRoot = process.cwd();

const codexHomeDirectory =
  process.env.CODEX_HOME ?? join(process.env.HOME ?? tmpdir(), '.codex');

async function measureDrive(options: {
  label: string;
  preloadPath?: string;
  environment?: Record<string, string>;
}): Promise<number> {
  const fixtureRoot = mkdtempSync(
    join(tmpdir(), `tui-inline-rewrite-${options.label}-`),
  );
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `tui-inline-rewrite-${options.label}-home-`),
  );
  const statusPath = join(homeDirectory, 'status.json');
  mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
  await Bun.write(
    join(homeDirectory, '.config', 'invar', 'settings.json'),
    JSON.stringify({ 'inlineRewrite.enabled': true }),
  );
  await Bun.write(
    join(fixtureRoot, 'rewrite.ts'),
    'const value = calculate()\n',
  );
  const command = [
    process.execPath,
    ...(options.preloadPath ? [`--preload=${options.preloadPath}`] : []),
    'src/main.ts',
    fixtureRoot,
  ];
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    repositoryRoot,
    columns: 120,
    rows: 30,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      ...options.environment,
    },
    command,
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${options.label}: application ready`,
      (status) => status.ready === true,
      20_000,
    );
    driver.sendKeys('Down', 'Enter');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      `${options.label}: fixture opened`,
      (status) => String(status.activeBuffer).endsWith('/rewrite.ts'),
    );
    driver.sendKeys('End');
    driver.sendText(';');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      `${options.label}: buffer is dirty before request`,
      (status) => status.dirty === true,
    );
    const requestTimestampMilliseconds = performance.now();
    driver.sendKeys('Control+Shift+r');
    const outcome = await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      `${options.label}: proposal or silent provider error`,
      (status) =>
        status.inlineRewriteVisible === true ||
        Number(status.inlineRewriteErrorCount) > 0,
      180_000,
    );
    const latencyMilliseconds =
      performance.now() - requestTimestampMilliseconds;
    HarnessSmoke.Class.requireCondition(
      outcome.inlineRewriteVisible === true,
      `${options.label}: the provider returned a visible rewrite`,
    );
    return latencyMilliseconds;
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

const positiveControlDelayMilliseconds = 350;

const positiveControlLatencyMilliseconds = await measureDrive({
  label: 'positive-control',
  preloadPath: join(
    repositoryRoot,
    'scripts/harness/inline-rewrite-mock-provider-preload.ts',
  ),
  environment: {
    INVAR_INLINE_REWRITE_MOCK_DELAY_MS: String(
      positiveControlDelayMilliseconds,
    ),
  },
});

HarnessSmoke.Class.requireCondition(
  positiveControlLatencyMilliseconds >= positiveControlDelayMilliseconds,
  'the latency meter observes its injected 350 ms positive control',
);

const realCodexLatencyMilliseconds = await measureDrive({
  label: 'real-codex',
  environment: { CODEX_HOME: codexHomeDirectory },
});

const result = {
  observationBoundary:
    'request-now PTY chord write to visible proposal status projection',
  model: 'gpt-5.3-codex-spark',
  reasoningEffort: 'low',
  positiveControlLatencyMilliseconds,
  realCodexLatencyMilliseconds,
  measuredAt: new Date().toISOString(),
};

mkdirSync(join(repositoryRoot, 'artifacts'), { recursive: true });

await Bun.write(
  join(repositoryRoot, 'artifacts', 'inline-rewrite-codex-latency.json'),
  JSON.stringify(result, null, 2) + '\n',
);

console.log(JSON.stringify(result, null, 2));
