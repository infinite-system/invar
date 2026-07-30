import { createPublicKey, verify } from 'node:crypto';
import { Static } from 'ivue/extras';
import { PluginManifest, type VendorPluginManifest } from './PluginManifest';

class $PluginAdmission {
  static payload(
    manifest: VendorPluginManifest,
    artifactDigest: string,
    sourceRevision: string,
    admittedAt: string,
  ): string {
    return JSON.stringify({
      identity: PluginManifest.Class.identity(manifest),
      version: manifest.version,
      artifactDigest,
      manifest,
      sourceRevision,
      admittedAt,
    });
  }

  static verify(record: PluginAdmissionRecord): void {
    // invariant: Network admission binds identity manifest and bytes (src/modules/vendors/network-admission.invariants.md)
    const manifest = PluginManifest.Class.parse(record.manifest);
    const trustedPublicKey = process.env.INVAR_ADMISSION_PUBLIC_KEY;
    if (!trustedPublicKey) {
      throw new Error(
        `REFUSED ${PluginManifest.Class.identity(manifest)}: no trusted admission key`,
      );
    }
    if (
      createPublicKey(record.publicKey)
        .export({ type: 'spki', format: 'pem' })
        .toString() !==
      createPublicKey(trustedPublicKey)
        .export({ type: 'spki', format: 'pem' })
        .toString()
    ) {
      throw new Error(
        `REFUSED ${PluginManifest.Class.identity(manifest)}: untrusted admission signer`,
      );
    }
    const valid = verify(
      null,
      Buffer.from(
        this.payload(
          manifest,
          record.artifactDigest,
          record.sourceRevision,
          record.admittedAt,
        ),
      ),
      createPublicKey(trustedPublicKey),
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
