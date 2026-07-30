import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Static } from 'ivue/extras';
import { PluginAdmission, type RegistryPluginVersion } from './PluginAdmission';
import { PluginArtifact } from './PluginArtifact';
import { PluginManifest } from './PluginManifest';

class $NetworkAdmission {
  static async admit(
    artifactPath: string,
    privateKey: string,
    sourceRevision: string,
  ): Promise<RegistryPluginVersion> {
    // invariant: Network admission binds identity manifest and bytes (src/modules/vendors/network-admission.invariants.md)
    const manifest = PluginManifest.Class.parse(
      JSON.parse(readFileSync(`${artifactPath}/invar.plugin.json`, 'utf8')),
    );
    const identity = PluginManifest.Class.identity(manifest);
    const contractPath = `${artifactPath}/${manifest.module}.invariants.md`;
    if (!existsSync(contractPath)) {
      throw new Error(
        `ADMISSION REFUSED ${identity}: module contract is missing`,
      );
    }
    const absoluteRoot = resolve(artifactPath);
    this.verifyImportClosure(absoluteRoot);
    const entrypoint = resolve(absoluteRoot, manifest.entrypoint);
    if (!entrypoint.startsWith(absoluteRoot + sep)) {
      throw new Error(
        `ADMISSION REFUSED ${identity}: entrypoint escaped artifact`,
      );
    }
    const loaded = (await import(pathToFileURL(entrypoint).href)) as Record<
      string,
      unknown
    >;
    if (typeof loaded.createPlugin !== 'function') {
      throw new Error(`ADMISSION REFUSED ${identity}: createPlugin is missing`);
    }
    const declaredExports = new Set(
      manifest.kernelOverrides.map((declaration) => declaration.export),
    );
    for (const declaration of manifest.kernelOverrides) {
      // invariant: Kernel authority is declared twice (src/modules/vendors/network-admission.invariants.md)
      if (typeof loaded[declaration.export] !== 'function') {
        throw new Error(
          `ADMISSION REFUSED ${identity}: override export ${declaration.export} is missing`,
        );
      }
    }
    const runtimeOverrideExports = Object.keys(loaded).filter((name) =>
      name.endsWith('Extension'),
    );
    for (const exportName of runtimeOverrideExports) {
      if (!declaredExports.has(exportName)) {
        throw new Error(
          `ADMISSION REFUSED ${identity}: undeclared kernel export ${exportName}`,
        );
      }
    }
    const artifactDigest = PluginArtifact.Class.digest(artifactPath);
    const privateKeyObject = createPrivateKey(privateKey);
    const publicKey = createPublicKey(privateKey)
      .export({ type: 'spki', format: 'pem' })
      .toString();
    const admittedAt = new Date().toISOString();
    const signature = sign(
      null,
      Buffer.from(
        PluginAdmission.Class.payload(
          manifest,
          artifactDigest,
          sourceRevision,
          admittedAt,
        ),
      ),
      privateKeyObject,
    ).toString('base64');
    return {
      manifest,
      artifactDigest,
      publicKey,
      signature,
      sourceRevision,
      admittedAt,
      artifactPath: absoluteRoot,
    };
  }

  static appendImmutable(
    catalogPath: string,
    record: RegistryPluginVersion,
  ): void {
    let records: RegistryPluginVersion[] = [];
    if (existsSync(catalogPath)) {
      records = JSON.parse(
        readFileSync(catalogPath, 'utf8'),
      ) as RegistryPluginVersion[];
    }
    const identity = PluginManifest.Class.identity(record.manifest);
    const existing = records.find(
      (candidate) =>
        PluginManifest.Class.identity(candidate.manifest) === identity &&
        candidate.manifest.version === record.manifest.version,
    );
    if (existing) {
      if (existing.artifactDigest !== record.artifactDigest) {
        throw new Error(
          `ADMISSION REFUSED ${identity}@${record.manifest.version}: version is immutable`,
        );
      }
      return;
    }
    records.push(record);
    records.sort((first, second) =>
      `${PluginManifest.Class.identity(first.manifest)}@${first.manifest.version}`.localeCompare(
        `${PluginManifest.Class.identity(second.manifest)}@${second.manifest.version}`,
      ),
    );
    writeFileSync(catalogPath, JSON.stringify(records, null, 2));
  }

  protected static verifyImportClosure(root: string): void {
    const pendingDirectories = [root];
    while (pendingDirectories.length > 0) {
      const directory = pendingDirectories.pop() as string;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
          pendingDirectories.push(path);
          continue;
        }
        if (!entry.isFile()) continue;
        if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
        const loader = path.endsWith('.tsx')
          ? 'tsx'
          : path.endsWith('.jsx')
            ? 'jsx'
            : /\.[cm]?ts$/.test(path)
              ? 'ts'
              : 'js';
        const imports = new Bun.Transpiler({
          loader,
        }).scanImports(readFileSync(path, 'utf8'));
        for (const imported of imports) {
          if (
            imported.path.startsWith('node:') ||
            imported.path.startsWith('bun:')
          ) {
            continue;
          }
          if (!imported.path.startsWith('.')) {
            throw new Error(
              `ADMISSION REFUSED import outside artifact: ${imported.path}`,
            );
          }
          const importedPath = resolve(directory, imported.path);
          if (importedPath !== root && !importedPath.startsWith(root + sep)) {
            throw new Error(
              `ADMISSION REFUSED import escaped artifact: ${imported.path}`,
            );
          }
        }
      }
    }
  }
}

export namespace NetworkAdmission {
  export const $Class = Static($NetworkAdmission);
  export let Class = $Class;
}
