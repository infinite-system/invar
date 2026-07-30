#!/usr/bin/env bun
// Drives network install and self-relaunch through the real Invar PTY.
// Run: bun .invar/tasks/in-progress/326-vendor-modularity-third-party-plugins/326-runtime-install-relaunch-harness.ts
// A PASS means the unsigned and tampered controls were refused, Extensions installed the signed
// artifact, the same process relaunched itself, the workspace survived, and the declared kernel
// override was active before the new application instance was constructed.
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';
import { NetworkAdmission } from '../../../../src/modules/vendors/NetworkAdmission';
import { PluginAdmission } from '../../../../src/modules/vendors/PluginAdmission';
import { VendorPluginInstaller } from '../../../../src/modules/vendors/VendorPluginInstaller';

const ownedRoot = mkdtempSync(join(tmpdir(), 'invar-326-runtime-install-'));
const artifactPath = join(ownedRoot, 'artifact');
const workspaceRoot = join(ownedRoot, 'workspace');
const homeDirectory = join(ownedRoot, 'home');
const dataRoot = join(ownedRoot, 'data');
const catalogPath = join(ownedRoot, 'catalog.json');
const statusPath = join(ownedRoot, 'status.json');
mkdirSync(artifactPath, { recursive: true });
mkdirSync(workspaceRoot, { recursive: true });
mkdirSync(homeDirectory, { recursive: true });

const manifest = {
  schemaVersion: 1,
  vendor: 'example',
  module: 'playstation',
  displayName: 'PlayStation Tools',
  description: 'Reference network-installed plugin.',
  version: '1.0.0',
  invarApi: 1,
  entrypoint: './PlaystationPlugin.ts',
  kernelOverrides: [
    {
      target: 'invar/app/App',
      kind: 'extend',
      export: 'ExampleAppExtension',
      reason: 'Marks the composed application for the restart drive.',
    },
  ],
};

await Bun.write(
  join(artifactPath, 'invar.plugin.json'),
  JSON.stringify(manifest),
);
await Bun.write(
  join(artifactPath, 'playstation.invariants.md'),
  '# PlayStation plugin invariants\n\nThe reference contribution is removable.\n',
);
await Bun.write(
  join(artifactPath, 'PlaystationPlugin.ts'),
  [
    'export function ExampleAppExtension(Base: new (...arguments_: never[]) => object) {',
    '  return class extends Base {',
    '    get examplePlaystationActive() { return true; }',
    '  };',
    '}',
    'export function createPlugin(api: { apiVersion: number }) {',
    "  if (api.apiVersion !== 1) throw new Error('unsupported API');",
    '  return {',
    "    identifier: 'example/playstation',",
    "    name: 'PlayStation Tools',",
    '    activateApplication() {},',
    '  };',
    '}',
    '',
  ].join('\n'),
);
await Bun.write(
  join(workspaceRoot, 'session.ts'),
  'export const session = 1;\n',
);

const keyPair = generateKeyPairSync('ed25519');
const privateKey = keyPair.privateKey
  .export({ type: 'pkcs8', format: 'pem' })
  .toString();
const record = await NetworkAdmission.Class.admit(
  artifactPath,
  privateKey,
  '326-fixture-revision',
);
NetworkAdmission.Class.appendImmutable(catalogPath, record);
process.env.INVAR_ADMISSION_PUBLIC_KEY = record.publicKey;

console.log('== positive controls ==');
try {
  PluginAdmission.Class.verify({
    ...record,
    signature: Buffer.alloc(64).toString('base64'),
  });
  throw new Error('unsigned control was accepted');
} catch (error) {
  const detail = String(error);
  HarnessSmoke.Class.requireCondition(
    detail.includes('invalid admission signature'),
    `unsigned artifact was refused loudly: ${detail}`,
  );
  console.log(detail);
}

process.env.INVAR_DATA_HOME = dataRoot;
process.env.INVAR_PLUGIN_REGISTRY = catalogPath;
await Bun.write(join(artifactPath, 'tampered.txt'), 'changed after admission');
try {
  VendorPluginInstaller.Class.install('example/playstation');
  throw new Error('tampered control was accepted');
} catch (error) {
  const detail = String(error);
  HarnessSmoke.Class.requireCondition(
    detail.includes('artifact digest mismatch'),
    `tampered artifact was refused loudly: ${detail}`,
  );
  console.log(detail);
}
rmSync(join(artifactPath, 'tampered.txt'));

const commandDataRoot = join(ownedRoot, 'command-data');
const commandInstall = Bun.spawn(
  [process.execPath, 'src/main.ts', 'plugin', 'install', 'example/playstation'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      INVAR_DATA_HOME: commandDataRoot,
      INVAR_PLUGIN_REGISTRY: catalogPath,
      INVAR_ADMISSION_PUBLIC_KEY: record.publicKey,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  },
);
const [commandOutput, commandError, commandExitCode] = await Promise.all([
  new Response(commandInstall.stdout).text(),
  new Response(commandInstall.stderr).text(),
  commandInstall.exited,
]);
HarnessSmoke.Class.requireCondition(
  commandExitCode === 0 &&
    commandOutput.includes(
      'example/playstation@1.0.0 installed; restart to apply',
    ),
  `command install uses the same signed artifact service: ${commandError}`,
);

const driver = new PtyTestDriver.Class({
  workspaceRoot,
  columns: 120,
  rows: 34,
  homeDirectory,
  environment: {
    INVAR_DATA_HOME: dataRoot,
    INVAR_PLUGIN_REGISTRY: catalogPath,
    INVAR_ADMISSION_PUBLIC_KEY: record.publicKey,
    TUI_STATUS_PATH: statusPath,
  },
});

try {
  await driver.awaitGridCondition(
    'the original process paints the preserved workspace',
    (snapshot) => snapshot.findText('session.ts') !== null,
  );
  const originalProcessIdentifier = driver.processId;
  driver.sendKeys('Control+Shift+x');
  await driver.awaitGridCondition(
    'Extensions lists the signed registry candidate',
    (snapshot) => snapshot.findText('example/playstation@1.0.0') !== null,
  );
  driver.sendKeys(...Array.from({ length: 13 }, () => 'Down'));
  await driver.awaitGridCondition(
    'the registry candidate becomes selected',
    (snapshot) => snapshot.findText('› [ ] PlayStation Tools') !== null,
  );
  driver.sendKeys('Enter');
  await driver.awaitGridCondition(
    'the exact kernel target requires confirmation',
    (snapshot) => snapshot.findText('› [confirm] PlayStation') !== null,
  );
  driver.sendKeys('Enter');
  await driver.awaitGridCondition(
    'install stages the artifact and offers restart',
    (snapshot) => snapshot.findText('› [restart] PlayStation') !== null,
  );
  driver.sendKeys('Enter');
  await driver.awaitGridCondition(
    'the relaunched process activates the installed plugin',
    (snapshot) => snapshot.findText('[x] PlayStation Tools') !== null,
    20_000,
  );
  const status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the relaunched application publishes the same workspace',
    (candidate) =>
      candidate.activeWorkspaceRoot === workspaceRoot &&
      candidate.appClassExtended === true &&
      Array.isArray(candidate.kernelExtensions) &&
      candidate.kernelExtensions.some(
        (extension) =>
          (extension as { pluginIdentity?: unknown }).pluginIdentity ===
            'example/playstation' &&
          (extension as { targetIdentifier?: unknown }).targetIdentifier ===
            'invar/app/App',
      ),
  );
  HarnessSmoke.Class.requireCondition(
    driver.processId === originalProcessIdentifier,
    'self-relaunch preserved the process and PTY through execve',
  );
  HarnessSmoke.Class.requireCondition(
    status.activeWorkspaceRoot === workspaceRoot,
    'self-relaunch preserved the workspace root',
  );
  console.log(
    `PASS example/playstation active after self-relaunch in ${workspaceRoot}`,
  );
  for (const lineCount of [10, 100_000]) {
    const scaleDrive = Bun.spawn(
      [
        process.execPath,
        'run',
        'drive',
        '--size',
        String(lineCount),
        '--geometry',
        '120x34',
        '--key',
        'Control+Shift+x',
        '--wait-for-text',
        'PlayStation Tools',
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [output, errorOutput, exitCode] = await Promise.all([
      new Response(scaleDrive.stdout).text(),
      new Response(scaleDrive.stderr).text(),
      scaleDrive.exited,
    ]);
    HarnessSmoke.Class.requireCondition(
      exitCode === 0 &&
        output.includes('[x] PlayStation') &&
        output.includes(`scale ${lineCount}`),
      `signed plugin is active on the shared ${lineCount}-line fixture` +
        (errorOutput ? `: ${errorOutput}` : ''),
    );
  }
} finally {
  await driver.dispose();
  rmSync(ownedRoot, { recursive: true, force: true });
}
