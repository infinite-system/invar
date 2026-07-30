import { afterEach, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from '../app/App';
import { Kernel } from '../kernel/Kernel';
import { KernelTargets } from '../kernel/KernelTargets';
import { NetworkAdmission } from './NetworkAdmission';
import { PluginAdmission } from './PluginAdmission';
import { PluginManifest } from './PluginManifest';
import { VendorPluginInstaller } from './VendorPluginInstaller';
import { VendorPluginRuntime } from './VendorPluginRuntime';

const temporaryDirectories: string[] = [];
const originalDataHome = process.env.INVAR_DATA_HOME;
const originalRegistry = process.env.INVAR_PLUGIN_REGISTRY;
const originalAdmissionPublicKey = process.env.INVAR_ADMISSION_PUBLIC_KEY;

afterEach(() => {
  Kernel.Class.instance.reset();
  if (originalDataHome === undefined) delete process.env.INVAR_DATA_HOME;
  else process.env.INVAR_DATA_HOME = originalDataHome;
  if (originalRegistry === undefined) delete process.env.INVAR_PLUGIN_REGISTRY;
  else process.env.INVAR_PLUGIN_REGISTRY = originalRegistry;
  if (originalAdmissionPublicKey === undefined) {
    delete process.env.INVAR_ADMISSION_PUBLIC_KEY;
  } else {
    process.env.INVAR_ADMISSION_PUBLIC_KEY = originalAdmissionPublicKey;
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('identity accepts portable kebab-case and rejects ambiguous forms', () => {
  expect(PluginManifest.Class.identity(manifest('vendor-2', 'module3'))).toBe(
    'vendor-2/module3',
  );
  for (const [vendor, module] of [
    ['2vendor', 'module'],
    ['Vendor', 'module'],
    ['vendor_name', 'module'],
    ['invar', 'module'],
    ['vendor', 'con'],
  ] as const) {
    expect(() => manifest(vendor, module)).toThrow();
  }
  expect(() => manifest('a'.repeat(65), 'module')).toThrow();
  expect(() => manifest('a'.repeat(64), 'module')).not.toThrow();
});

test('signed admission rejects a changed signature loudly', async () => {
  const fixture = await admittedFixture();
  expect(() => PluginAdmission.Class.verify(fixture.record)).not.toThrow();
  expect(() =>
    PluginAdmission.Class.verify({
      ...fixture.record,
      signature: Buffer.alloc(64).toString('base64'),
    }),
  ).toThrow('REFUSED example/playstation: invalid admission signature');
});

test('install verifies bytes and runtime composes the declared class before seal', async () => {
  const fixture = await admittedFixture();
  process.env.INVAR_DATA_HOME = fixture.dataRoot;
  process.env.INVAR_PLUGIN_REGISTRY = fixture.catalogPath;
  VendorPluginInstaller.Class.install('example/playstation');
  KernelTargets.Class.register();
  const contributors = await VendorPluginRuntime.Class.load();
  expect(contributors.map((contributor) => contributor.identifier)).toEqual([
    'example/playstation',
  ]);
  expect(Kernel.Class.instance.isSealed).toBe(false);
  Kernel.Class.instance.seal();
  const app = new App.Class() as App.Instance & {
    examplePlaystationActive: boolean;
  };
  expect(app.examplePlaystationActive).toBe(true);
  expect(Kernel.Class.instance.registeredExtensions()).toEqual([
    {
      pluginIdentity: 'example/playstation',
      targetIdentifier: 'invar/app/App',
    },
  ]);
});

test('client refuses an artifact changed after admission', async () => {
  const fixture = await admittedFixture();
  process.env.INVAR_DATA_HOME = fixture.dataRoot;
  process.env.INVAR_PLUGIN_REGISTRY = fixture.catalogPath;
  await Bun.write(join(fixture.artifactPath, 'changed.txt'), 'tampered');
  expect(() =>
    VendorPluginInstaller.Class.install('example/playstation'),
  ).toThrow('REFUSED example/playstation: artifact digest mismatch');
});

test('disable remove and rollback change only the atomic selection', async () => {
  const fixture = await admittedFixture();
  process.env.INVAR_DATA_HOME = fixture.dataRoot;
  process.env.INVAR_PLUGIN_REGISTRY = fixture.catalogPath;
  VendorPluginInstaller.Class.install('example/playstation');

  VendorPluginInstaller.Class.setEnabled('example/playstation', false);
  expect(VendorPluginInstaller.Class.installed()).toEqual([
    {
      identity: 'example/playstation',
      version: '1.0.0',
      enabled: false,
    },
  ]);
  VendorPluginInstaller.Class.remove('example/playstation');
  expect(VendorPluginInstaller.Class.installed()).toEqual([]);
  expect(
    VendorPluginInstaller.Class.rollback('example/playstation', '1.0.0'),
  ).toEqual({
    identity: 'example/playstation',
    version: '1.0.0',
    enabled: true,
  });
});

test('network admission refuses an undeclared kernel export', async () => {
  const root = mkdtempSync(join(tmpdir(), 'invar-vendor-undeclared-test-'));
  temporaryDirectories.push(root);
  await Bun.write(
    join(root, 'invar.plugin.json'),
    JSON.stringify({
      ...manifest('example', 'undeclared'),
      kernelOverrides: [],
    }),
  );
  await Bun.write(
    join(root, 'undeclared.invariants.md'),
    '# Undeclared test contract\n',
  );
  await Bun.write(
    join(root, 'Plugin.ts'),
    [
      'export function HiddenExtension(Base: new (...arguments_: never[]) => object) {',
      '  return class extends Base {};',
      '}',
      'export function createPlugin() {',
      "  return { identifier: 'example/undeclared', name: 'PlayStation Tools', activateApplication() {} };",
      '}',
    ].join('\n'),
  );
  const rawManifest = JSON.parse(
    await Bun.file(join(root, 'invar.plugin.json')).text(),
  ) as Record<string, unknown>;
  rawManifest.entrypoint = './Plugin.ts';
  await Bun.write(join(root, 'invar.plugin.json'), JSON.stringify(rawManifest));
  const keyPair = generateKeyPairSync('ed25519');
  const privateKey = keyPair.privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();

  expect(
    NetworkAdmission.Class.admit(root, privateKey, 'undeclared-revision'),
  ).rejects.toThrow(
    'ADMISSION REFUSED example/undeclared: undeclared kernel export HiddenExtension',
  );
});

async function admittedFixture(): Promise<{
  artifactPath: string;
  catalogPath: string;
  dataRoot: string;
  record: Awaited<ReturnType<typeof NetworkAdmission.Class.admit>>;
}> {
  const root = mkdtempSync(join(tmpdir(), 'invar-vendor-plugin-test-'));
  temporaryDirectories.push(root);
  const artifactPath = join(root, 'artifact');
  mkdirSync(artifactPath, { recursive: true });
  const pluginManifest = manifest('example', 'playstation');
  await Bun.write(
    join(artifactPath, 'invar.plugin.json'),
    JSON.stringify(pluginManifest),
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
  const keyPair = generateKeyPairSync('ed25519');
  const privateKey = keyPair.privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  const record = await NetworkAdmission.Class.admit(
    artifactPath,
    privateKey,
    'fixture-revision',
  );
  process.env.INVAR_ADMISSION_PUBLIC_KEY = record.publicKey;
  const catalogPath = join(root, 'catalog.json');
  NetworkAdmission.Class.appendImmutable(catalogPath, record);
  return {
    artifactPath,
    catalogPath,
    dataRoot: join(root, 'data'),
    record,
  };
}

function manifest(vendor: string, module: string) {
  return PluginManifest.Class.parse({
    schemaVersion: 1,
    vendor,
    module,
    displayName: 'PlayStation Tools',
    description: 'Reference plugin.',
    version: '1.0.0',
    invarApi: 1,
    entrypoint: './PlaystationPlugin.ts',
    kernelOverrides: [
      {
        target: 'invar/app/App',
        kind: 'extend',
        export: 'ExampleAppExtension',
        reason: 'Marks the composed application.',
      },
    ],
  });
}
