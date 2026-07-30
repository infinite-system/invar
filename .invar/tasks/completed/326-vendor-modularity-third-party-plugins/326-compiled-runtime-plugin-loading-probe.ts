/**
 * This probe finds whether a Bun-compiled executable can load JavaScript and
 * transpile TypeScript plugin files that did not exist when the executable was
 * built. Run it from the repository root with:
 *
 * bun .invar/tasks/in-progress/326-vendor-modularity-third-party-plugins/326-compiled-runtime-plugin-loading-probe.ts
 *
 * A successful result prints one JSON record. The JavaScript and TypeScript
 * fields report startup load times from separate compiled-host processes. The
 * TypeScript fixture imports a second external TypeScript file and uses syntax
 * that a JavaScript parser rejects. Its success therefore proves runtime
 * TypeScript transpilation, not only JavaScript loading. The invalid fixture is
 * a positive control: it must fail to load. A change from true to false in any
 * acceptance field means the compiled runtime boundary regressed.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface ProcessResult {
  exitCode: number;
  standardOutput: string;
  standardError: string;
}

interface PluginLoadResult {
  bunVersion: string;
  pluginResult: string;
  loadMilliseconds: number;
}

function runProcess(command: string[]): ProcessResult {
  const processResult = Bun.spawnSync(command, {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    exitCode: processResult.exitCode,
    standardOutput: processResult.stdout.toString().trim(),
    standardError: processResult.stderr.toString().trim(),
  };
}

function requireSuccessfulPluginLoad(
  label: string,
  processResult: ProcessResult,
  expectedPluginResult: string,
): PluginLoadResult {
  if (processResult.exitCode !== 0) {
    throw new Error(
      `${label} exited ${processResult.exitCode}: ${processResult.standardError}`,
    );
  }

  const pluginLoadResult = JSON.parse(
    processResult.standardOutput,
  ) as PluginLoadResult;
  if (pluginLoadResult.pluginResult !== expectedPluginResult) {
    throw new Error(
      `${label} returned ${JSON.stringify(pluginLoadResult.pluginResult)} instead of ${JSON.stringify(expectedPluginResult)}`,
    );
  }
  if (
    !Number.isFinite(pluginLoadResult.loadMilliseconds) ||
    pluginLoadResult.loadMilliseconds < 0
  ) {
    throw new Error(
      `${label} returned an invalid load duration: ${processResult.standardOutput}`,
    );
  }

  return pluginLoadResult;
}

const probeDirectory = mkdtempSync(
  join(tmpdir(), 'invar-326-compiled-runtime-plugin-loading-'),
);

try {
  const compiledHostSourcePath = join(probeDirectory, 'compiled-host.ts');
  const compiledHostPath = join(probeDirectory, 'compiled-host');
  const pluginDirectory = join(probeDirectory, 'plugins');
  mkdirSync(pluginDirectory);

  writeFileSync(
    compiledHostSourcePath,
    `
import { pathToFileURL } from "node:url";

const pluginPath = process.argv[2];
const loadStartedAt = performance.now();
const pluginModule = await import(pathToFileURL(pluginPath).href);
const pluginResult = await pluginModule.activate(
  Object.freeze({ apiVersion: 1, identity: "probe/host" }),
);

console.log(JSON.stringify({
  bunVersion: Bun.version,
  pluginResult,
  loadMilliseconds: Number((performance.now() - loadStartedAt).toFixed(3)),
}));
`,
  );

  const buildStartedAt = performance.now();
  const buildResult = runProcess([
    Bun.which('bun') ?? 'bun',
    'build',
    '--compile',
    compiledHostSourcePath,
    '--outfile',
    compiledHostPath,
  ]);
  const buildMilliseconds = Number(
    (performance.now() - buildStartedAt).toFixed(3),
  );
  if (buildResult.exitCode !== 0) {
    throw new Error(
      `Compiled host build exited ${buildResult.exitCode}: ${buildResult.standardError}`,
    );
  }

  // These plugin files are created after compilation. The executable cannot
  // contain them as bundled modules.
  const javaScriptPluginPath = join(pluginDirectory, 'external-plugin.js');
  writeFileSync(
    javaScriptPluginPath,
    `
export function activate(context) {
  return "javascript:" + context.identity;
}
`,
  );

  const typeScriptHelperPath = join(pluginDirectory, 'external-helper.ts');
  writeFileSync(
    typeScriptHelperPath,
    `
export const helperResult: string = "relative-typescript-import";
`,
  );

  const typeScriptPluginPath = join(pluginDirectory, 'external-plugin.ts');
  writeFileSync(
    typeScriptPluginPath,
    `
import { helperResult } from "./external-helper.ts";

interface PluginContext {
  apiVersion: number;
  identity: string;
}

export function activate(context: PluginContext): string {
  return "typescript:" + context.apiVersion + ":" + helperResult;
}
`,
  );

  const invalidPluginPath = join(pluginDirectory, 'invalid-plugin.ts');
  writeFileSync(
    invalidPluginPath,
    `
export function activate(context: { identity: string }): string {
  return context.identity +
}
`,
  );

  const javaScriptLoadResult = requireSuccessfulPluginLoad(
    'External JavaScript plugin',
    runProcess([compiledHostPath, javaScriptPluginPath]),
    'javascript:probe/host',
  );
  const typeScriptLoadResult = requireSuccessfulPluginLoad(
    'External TypeScript plugin',
    runProcess([compiledHostPath, typeScriptPluginPath]),
    'typescript:1:relative-typescript-import',
  );
  const invalidPluginResult = runProcess([compiledHostPath, invalidPluginPath]);
  if (invalidPluginResult.exitCode === 0) {
    throw new Error(
      'Invalid TypeScript positive control loaded successfully; the probe cannot distinguish acceptance from rejection.',
    );
  }

  console.log(
    JSON.stringify(
      {
        probeBunVersion: Bun.version,
        compiledHostBunVersion: typeScriptLoadResult.bunVersion,
        buildMilliseconds,
        javaScript: {
          accepted: true,
          loadMilliseconds: javaScriptLoadResult.loadMilliseconds,
        },
        typeScript: {
          accepted: true,
          relativeTypeScriptImportAccepted: true,
          loadMilliseconds: typeScriptLoadResult.loadMilliseconds,
        },
        invalidTypeScriptPositiveControl: {
          rejected: true,
          exitCode: invalidPluginResult.exitCode,
        },
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(probeDirectory, { recursive: true, force: true });
}
