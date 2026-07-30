import { readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Static } from 'ivue/extras';
import type { ApplicationContributor } from '../app/ApplicationContributor.interface';
import { Kernel, type KernelExtensionFactory } from '../kernel/Kernel';
import { PluginAdmission, type PluginAdmissionRecord } from './PluginAdmission';
import { PluginArtifact } from './PluginArtifact';
import { PluginManifest } from './PluginManifest';
import { VendorPaths } from './VendorPaths';
import { VendorPluginInstaller } from './VendorPluginInstaller';

class $VendorPluginRuntime {
  static async load(): Promise<ApplicationContributor[]> {
    // invariant: Vendor plugins load before kernel seal (src/modules/vendors/vendors.invariants.md)
    const contributors: ApplicationContributor[] = [];
    for (const selection of VendorPluginInstaller.Class.installed()
      .filter((candidate) => candidate.enabled)
      .sort((first, second) => first.identity.localeCompare(second.identity))) {
      const [vendor, module] = selection.identity.split('/');
      if (!vendor || !module) {
        throw new Error(
          `invalid installed plugin identity: ${selection.identity}`,
        );
      }
      const root =
        selection.developerPath ??
        join(VendorPaths.Class.vendorsRoot, vendor, module, selection.version);
      const admission = selection.developerPath
        ? null
        : (JSON.parse(
            readFileSync(join(root, 'invar.admission.json'), 'utf8'),
          ) as PluginAdmissionRecord);
      if (admission) PluginAdmission.Class.verify(admission);
      const manifest = PluginManifest.Class.parse(
        admission?.manifest ??
          JSON.parse(readFileSync(join(root, 'invar.plugin.json'), 'utf8')),
      );
      if (
        PluginManifest.Class.identity(manifest) !== selection.identity ||
        manifest.version !== selection.version
      ) {
        throw new Error(
          `REFUSED ${selection.identity}: installed selection does not match admission`,
        );
      }
      const actualDigest = admission
        ? PluginArtifact.Class.digestWithoutAdmission(root)
        : PluginArtifact.Class.digest(root);
      if (admission && actualDigest !== admission.artifactDigest) {
        throw new Error(
          `REFUSED ${selection.identity}: artifact digest mismatch`,
        );
      }
      const absoluteRoot = resolve(root);
      const entrypoint = resolve(absoluteRoot, manifest.entrypoint);
      if (!entrypoint.startsWith(absoluteRoot + sep)) {
        throw new Error(
          `REFUSED ${selection.identity}: entrypoint escaped artifact`,
        );
      }
      const loaded = (await import(
        `${pathToFileURL(entrypoint).href}?digest=${actualDigest}`
      )) as Record<string, unknown>;
      for (const declaration of manifest.kernelOverrides) {
        const factory = loaded[declaration.export];
        if (typeof factory !== 'function') {
          throw new Error(
            `REFUSED ${selection.identity}: missing declared kernel export ${declaration.export}`,
          );
        }
        Kernel.Class.instance.extend(
          selection.identity,
          declaration.target,
          factory as KernelExtensionFactory,
        );
      }
      if (typeof loaded.createPlugin !== 'function') {
        throw new Error(`REFUSED ${selection.identity}: missing createPlugin`);
      }
      const contributor = (
        loaded.createPlugin as (api: RuntimePluginApi) => ApplicationContributor
      )({ apiVersion: 1 });
      if (
        contributor.identifier !== selection.identity ||
        contributor.name !== manifest.displayName
      ) {
        throw new Error(
          `REFUSED ${selection.identity}: contributor identity does not match manifest`,
        );
      }
      Object.defineProperty(contributor, 'vendorMetadata', {
        value: {
          version: manifest.version,
          provenance: selection.developerPath
            ? 'developer-linked'
            : 'network-gated',
          kernelOverrides: manifest.kernelOverrides.map(
            (declaration) => declaration.target,
          ),
        },
      });
      contributors.push(contributor);
    }
    return contributors;
  }
}

export namespace VendorPluginRuntime {
  export const $Class = Static($VendorPluginRuntime);
  export let Class = $Class;
}

export interface RuntimePluginApi {
  readonly apiVersion: 1;
}
