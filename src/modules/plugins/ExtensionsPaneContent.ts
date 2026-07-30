import type { KeyEvent, StyledText } from '@opentui/core';
import { StyledText as OpenTuiStyledText, fg } from '@opentui/core';
import { Reactive } from 'ivue';
import { computed, ref } from 'vue';
import type { ApplicationContributionCatalog } from '../app/ApplicationContributor.interface';
import { VendorPluginInstaller } from '../vendors/VendorPluginInstaller';
import { PluginManifest } from '../vendors/PluginManifest';
import type {
  PaneContent,
  PaneRenderContext,
} from '../ui/PaneContent.interface';

class $ExtensionsPaneContent implements PaneContent {
  constructor(
    protected readonly iconGlyph: () => string,
    protected readonly contributions: ApplicationContributionCatalog,
    protected readonly requestRender: () => void,
    protected readonly restartApplication: () => void = () => {},
  ) {}

  get selectedIndex() {
    return ref(0);
  }
  get restartPendingIdentity() {
    return ref<string | null>(null);
  }
  get authorityConfirmationIdentity() {
    return ref<string | null>(null);
  }

  get id(): string {
    return 'extensions';
  }

  get title(): string {
    return 'Extensions';
  }

  get activityLabel(): string {
    return 'Extensions';
  }

  get icon(): string {
    return this.iconGlyph();
  }

  get activityAction(): string {
    return 'view.showExtensions';
  }

  get renderRevision() {
    return computed(
      () => `${this.contributions.revision.value}:${this.selectedIndex.value}`,
    );
  }

  render(context: PaneRenderContext): StyledText {
    // invariant: Extensions states vendor authority before activation (src/modules/plugins/plugins.invariants.md)
    const chunks = [fg(context.palette.fg)('\n   Extensions\n\n')];
    for (const [entryIndex, row] of this.rows.entries()) {
      const selected = entryIndex === this.selectedIndex.value;
      const marker = selected ? '›' : ' ';
      const state =
        this.restartPendingIdentity.value === row.identifier
          ? '[restart]'
          : this.authorityConfirmationIdentity.value === row.identifier
            ? '[confirm]'
            : row.enabled
              ? '[x]'
              : '[ ]';
      const color = selected ? context.palette.accent : context.palette.fg;
      chunks.push(fg(color)(` ${marker} ${state} ${row.label}\n`));
    }
    chunks.push(
      fg(context.palette.dim)(
        '\n   Space/Enter changes state · Enter again restarts to apply\n',
      ),
    );
    return new OpenTuiStyledText(chunks);
  }

  handleKey(key: KeyEvent): boolean {
    if (key.name === 'up' || key.name === 'down') {
      const rowDelta = key.name === 'up' ? -1 : 1;
      this.moveSelection(rowDelta);
      return true;
    }
    if (key.name === 'space' || key.name === 'return') {
      this.toggleSelected();
      return true;
    }
    return false;
  }

  protected get toggleableEntries() {
    return this.contributions.entries().filter((entry) => entry.canDisable);
  }

  protected get rows(): readonly ExtensionRow[] {
    const activeContributorIdentities = new Set(
      this.toggleableEntries.map((entry) => entry.identifier),
    );
    const registryVersions = VendorPluginInstaller.Class.registryVersions();
    const contributionRows = this.toggleableEntries.map((entry) => {
      const updateManifest = registryVersions
        .map((record) => PluginManifest.Class.parse(record.manifest))
        .filter(
          (manifest) =>
            PluginManifest.Class.identity(manifest) === entry.identifier &&
            manifest.version !== entry.version,
        )
        .sort((first, second) =>
          first.version.localeCompare(second.version, undefined, {
            numeric: true,
          }),
        )
        .at(-1);
      const updateTargets =
        updateManifest?.kernelOverrides.map(
          (declaration) => declaration.target,
        ) ?? [];
      const currentTargets = new Set(entry.kernelOverrides ?? []);
      const expandsAuthority = updateTargets.some(
        (target) => !currentTargets.has(target),
      );
      return {
        identifier: entry.identifier,
        enabled: entry.enabled,
        isRegistryCandidate: updateManifest !== undefined,
        needsAuthorityConfirmation: expandsAuthority,
        label:
          (entry.version
            ? `${entry.name} · ${entry.identifier}@${entry.version} · ${
                entry.provenance === 'developer-linked'
                  ? 'UNVERIFIED LOCAL CODE'
                  : 'NETWORK-GATED'
              }${
                entry.kernelOverrides?.length
                  ? ` · KERNEL OVERRIDE: ${entry.kernelOverrides.join(', ')}`
                  : ''
              }${
                updateManifest
                  ? ` · UPDATE ${updateManifest.version}${
                      updateTargets.length
                        ? ` · KERNEL OVERRIDE: ${updateTargets.join(', ')}`
                        : ''
                    }`
                  : ''
              }`
            : entry.name) +
          (entry.failure ? ` · FAILED: ${entry.failure}` : ''),
      };
    });
    const registryRows = registryVersions
      .map((record) => {
        const manifest = PluginManifest.Class.parse(record.manifest);
        return {
          identifier: PluginManifest.Class.identity(manifest),
          enabled: false,
          isRegistryCandidate: true,
          needsAuthorityConfirmation: manifest.kernelOverrides.length > 0,
          label: `${manifest.displayName} · ${PluginManifest.Class.identity(manifest)}@${manifest.version} · NETWORK-GATED${
            manifest.kernelOverrides.length
              ? ` · KERNEL OVERRIDE: ${manifest.kernelOverrides
                  .map((declaration) => declaration.target)
                  .join(', ')}`
              : ''
          }`,
        };
      })
      .filter((row) => !activeContributorIdentities.has(row.identifier));
    return [...contributionRows, ...registryRows];
  }

  protected moveSelection(rowDelta: number): void {
    const lastIndex = this.rows.length - 1;
    this.selectedIndex.value = Math.max(
      0,
      Math.min(lastIndex, this.selectedIndex.value + rowDelta),
    );
    this.requestRender();
  }

  protected toggleSelected(): void {
    const row = this.rows[this.selectedIndex.value];
    if (!row) return;
    if (this.restartPendingIdentity.value === row.identifier) {
      process.env.INVAR_RESTART_PRIMARY_DOCK = this.id;
      this.restartApplication();
      return;
    }
    if (row.isRegistryCandidate) {
      if (
        row.needsAuthorityConfirmation &&
        this.authorityConfirmationIdentity.value !== row.identifier
      ) {
        this.authorityConfirmationIdentity.value = row.identifier;
        this.requestRender();
        return;
      }
      VendorPluginInstaller.Class.install(row.identifier);
    } else {
      const entry = this.toggleableEntries.find(
        (candidate) => candidate.identifier === row.identifier,
      );
      if (!entry) return;
      if (entry.version) {
        VendorPluginInstaller.Class.setEnabled(
          entry.identifier,
          !entry.enabled,
        );
      } else {
        this.contributions.setEnabled(entry.identifier, !entry.enabled);
        this.requestRender();
        return;
      }
    }
    this.authorityConfirmationIdentity.value = null;
    this.restartPendingIdentity.value = row.identifier;
    this.requestRender();
  }

  onPointerDown(_column: number, row: number): boolean {
    const entryIndex = row - 3;
    if (entryIndex < 0 || entryIndex >= this.rows.length) {
      return false;
    }
    this.selectedIndex.value = entryIndex;
    this.toggleSelected();
    return true;
  }

  onResize(_columns: number, _rows: number): void {}

  onFocus(): void {}

  onBlur(): void {}

  dispose(): void {}
}

interface ExtensionRow {
  readonly identifier: string;
  readonly enabled: boolean;
  readonly isRegistryCandidate: boolean;
  readonly needsAuthorityConfirmation: boolean;
  readonly label: string;
}

export namespace ExtensionsPaneContent {
  export const $Class = $ExtensionsPaneContent;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
