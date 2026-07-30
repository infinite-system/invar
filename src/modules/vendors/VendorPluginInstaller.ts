import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { Static } from 'ivue/extras';
import { PluginAdmission, type RegistryPluginVersion } from './PluginAdmission';
import { PluginArtifact } from './PluginArtifact';
import { PluginManifest } from './PluginManifest';
import { VendorPaths } from './VendorPaths';

class $VendorPluginInstaller {
  static registryVersions(): readonly RegistryPluginVersion[] {
    const catalogPath = process.env.INVAR_PLUGIN_REGISTRY;
    if (!catalogPath || !existsSync(catalogPath)) return [];
    const value = JSON.parse(readFileSync(catalogPath, 'utf8')) as unknown;
    if (!Array.isArray(value)) {
      throw new Error('plugin registry catalog must be an array');
    }
    return value as RegistryPluginVersion[];
  }

  static install(identity: string): InstalledPluginSelection {
    const record = this.registryVersions().find(
      (candidate) =>
        PluginManifest.Class.identity(
          PluginManifest.Class.parse(candidate.manifest),
        ) === identity,
    );
    if (!record) throw new Error(`plugin registry has no ${identity}`);
    PluginAdmission.Class.verify(record);
    const actualDigest = PluginArtifact.Class.digest(record.artifactPath);
    if (actualDigest !== record.artifactDigest) {
      throw new Error(`REFUSED ${identity}: artifact digest mismatch`);
    }
    const manifest = PluginManifest.Class.parse(record.manifest);
    const destination = join(
      VendorPaths.Class.vendorsRoot,
      manifest.vendor,
      manifest.module,
      manifest.version,
    );
    const staging = `${destination}.staging-${process.pid}`;
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(record.artifactPath, staging, { recursive: true });
    writeFileSync(
      join(staging, 'invar.admission.json'),
      JSON.stringify(record, null, 2),
    );
    rmSync(destination, { recursive: true, force: true });
    renameSync(staging, destination);
    const selection = {
      identity,
      version: manifest.version,
      enabled: true,
    };
    this.writeInstalled([
      ...this.installed().filter(
        (candidate) => candidate.identity !== identity,
      ),
      selection,
    ]);
    return selection;
  }

  static installed(): InstalledPluginSelection[] {
    try {
      const value = JSON.parse(
        readFileSync(VendorPaths.Class.installedRecord, 'utf8'),
      ) as unknown;
      return Array.isArray(value) ? (value as InstalledPluginSelection[]) : [];
    } catch {
      return [];
    }
  }

  static setEnabled(identity: string, enabled: boolean): void {
    this.writeInstalled(
      this.installed().map((selection) =>
        selection.identity === identity ? { ...selection, enabled } : selection,
      ),
    );
  }

  static remove(identity: string): void {
    this.writeInstalled(
      this.installed().filter((selection) => selection.identity !== identity),
    );
  }

  protected static writeInstalled(
    selections: readonly InstalledPluginSelection[],
  ): void {
    const path = VendorPaths.Class.installedRecord;
    mkdirSync(dirname(path), { recursive: true });
    const temporaryPath = `${path}.temporary-${process.pid}`;
    writeFileSync(temporaryPath, JSON.stringify(selections, null, 2));
    renameSync(temporaryPath, path);
  }
}

export namespace VendorPluginInstaller {
  export const $Class = Static($VendorPluginInstaller);
  export let Class = $Class;
}

export interface InstalledPluginSelection {
  readonly identity: string;
  readonly version: string;
  readonly enabled: boolean;
}
