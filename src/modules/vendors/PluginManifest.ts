import { Static } from 'ivue/extras';

class $PluginManifest {
  static parse(value: unknown): VendorPluginManifest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('plugin manifest must be an object');
    }
    const candidate = value as Record<string, unknown>;
    if (candidate.schemaVersion !== 1) {
      throw new Error('plugin manifest schemaVersion must be 1');
    }
    const vendor = this.segment(candidate.vendor, 'vendor');
    const module = this.segment(candidate.module, 'module');
    if (RESERVED_VENDORS.has(vendor) || vendor.startsWith('invar-')) {
      throw new Error(`plugin vendor is reserved: ${vendor}`);
    }
    const version = this.string(candidate.version, 'version');
    if (!SEMANTIC_VERSION.test(version)) {
      throw new Error(`plugin version is not semantic: ${version}`);
    }
    if (candidate.invarApi !== 1) {
      throw new Error('plugin invarApi must be 1');
    }
    return {
      schemaVersion: 1,
      vendor,
      module,
      displayName: this.string(candidate.displayName, 'displayName'),
      description: this.string(candidate.description, 'description'),
      version,
      invarApi: 1,
      entrypoint: this.relativePath(candidate.entrypoint, 'entrypoint'),
      kernelOverrides: this.kernelOverrides(candidate.kernelOverrides),
    };
  }

  static identity(manifest: VendorPluginManifest): string {
    return `${manifest.vendor}/${manifest.module}`;
  }

  protected static segment(value: unknown, field: string): string {
    const segment = this.string(value, field);
    if (segment.length > 64 || !IDENTITY_SEGMENT.test(segment)) {
      throw new Error(
        `plugin ${field} is not lowercase kebab-case: ${segment}`,
      );
    }
    if (WINDOWS_DEVICE_NAME.test(segment)) {
      throw new Error(`plugin ${field} is a reserved device name: ${segment}`);
    }
    return segment;
  }

  protected static string(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`plugin ${field} must be a non-empty string`);
    }
    return value;
  }

  protected static relativePath(value: unknown, field: string): string {
    const path = this.string(value, field);
    if (
      path.startsWith('/') ||
      path.startsWith('\\') ||
      path.split(/[\\/]/).includes('..')
    ) {
      throw new Error(`plugin ${field} must stay inside the artifact`);
    }
    return path;
  }

  protected static kernelOverrides(
    value: unknown,
  ): readonly VendorKernelOverride[] {
    if (!Array.isArray(value)) {
      throw new Error('plugin kernelOverrides must be an array');
    }
    const targets = new Set<string>();
    return value.map((entry, overrideIndex) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`plugin kernelOverrides[${overrideIndex}] is invalid`);
      }
      const candidate = entry as Record<string, unknown>;
      const target = this.string(candidate.target, 'kernel override target');
      if (targets.has(target)) {
        throw new Error(`plugin kernel override is duplicated: ${target}`);
      }
      targets.add(target);
      if (candidate.kind !== 'extend') {
        throw new Error(
          `plugin kernel override kind must be extend: ${target}`,
        );
      }
      return {
        target,
        kind: 'extend',
        export: this.string(candidate.export, 'kernel override export'),
        reason: this.string(candidate.reason, 'kernel override reason'),
      };
    });
  }
}

export namespace PluginManifest {
  export const $Class = Static($PluginManifest);
  export let Class = $Class;
}

export interface VendorPluginManifest {
  readonly schemaVersion: 1;
  readonly vendor: string;
  readonly module: string;
  readonly displayName: string;
  readonly description: string;
  readonly version: string;
  readonly invarApi: 1;
  readonly entrypoint: string;
  readonly kernelOverrides: readonly VendorKernelOverride[];
}

export interface VendorKernelOverride {
  readonly target: string;
  readonly kind: 'extend';
  readonly export: string;
  readonly reason: string;
}

const IDENTITY_SEGMENT = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SEMANTIC_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const RESERVED_VENDORS = new Set([
  'invar',
  'core',
  'builtin',
  'built-in',
  'system',
  'vendor',
  'vendors',
]);
