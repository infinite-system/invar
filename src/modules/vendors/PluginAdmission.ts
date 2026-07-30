import { createPublicKey, verify } from 'node:crypto';
import { Static } from 'ivue/extras';
import { PluginManifest, type VendorPluginManifest } from './PluginManifest';

class $PluginAdmission {
  static payload(
    manifest: VendorPluginManifest,
    artifactDigest: string,
  ): string {
    return JSON.stringify({
      identity: PluginManifest.Class.identity(manifest),
      version: manifest.version,
      artifactDigest,
      manifest,
    });
  }

  static verify(record: PluginAdmissionRecord): void {
    const manifest = PluginManifest.Class.parse(record.manifest);
    const valid = verify(
      null,
      Buffer.from(this.payload(manifest, record.artifactDigest)),
      createPublicKey(record.publicKey),
      Buffer.from(record.signature, 'base64'),
    );
    if (!valid) {
      throw new Error(
        `REFUSED ${PluginManifest.Class.identity(manifest)}: invalid admission signature`,
      );
    }
  }
}

export namespace PluginAdmission {
  export const $Class = Static($PluginAdmission);
  export let Class = $Class;
}

export interface PluginAdmissionRecord {
  readonly manifest: VendorPluginManifest;
  readonly artifactDigest: string;
  readonly publicKey: string;
  readonly signature: string;
  readonly sourceRevision: string;
  readonly admittedAt: string;
}

export interface RegistryPluginVersion extends PluginAdmissionRecord {
  readonly artifactPath: string;
}
