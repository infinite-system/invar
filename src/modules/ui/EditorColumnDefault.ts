// The DEFAULT occupant of the editor column, expressed as a registration instead of host knowledge.
//
// Two registries serve the editor column and they answer different questions. `EditorSurfaceContents`
// holds the CLAIMANTS: a source-control comparison or a Markdown split that takes the column over
// while some condition holds, and gives it back. This one holds the DEFAULT: what occupies the column
// when nothing claims it. The host builds the SLOT (a bordered box, its background, its border) and
// knows nothing else. Which content sits in it is a contribution, so removing that contribution
// leaves an empty slot rather than a broken host.
//
// Providers register during plugin activation, which runs BEFORE the view exists, so a provider is
// held and its content is CREATED LAZILY the first time the host reads it with a mount context
// attached. That is the same order `EditorSurfaceContents` already uses.
//
// The context deliberately names no editor type. Three services the host owns and a source-text
// content consumes — the LSP hover card, the raster (image) projection, the frame-attribution
// counter — are published as NAMED PORTS, the same vocabulary `PaneContent.capability` already uses.
// The host publishes them; a content resolves the ones it understands; neither names the other.
//
// invariant: The editor column's default occupant is a contribution (src/modules/ui/ui.invariants.md)
// invariant: Plugin panes use the shared pane and popup hosts (src/modules/ui/ui.invariants.md)
import type { BoxRenderable, CliRenderer, StyledText } from '@opentui/core';
import { Static } from 'ivue/extras';
import type { FindBar } from '../search/FindBar';
import type { Settings } from '../settings/Settings';
import type { Theme } from '../theme/Theme';
import type { Palette } from '../theme/ThemePalettes';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type {
  PaneContent,
  PaneNativeSurfacePort,
  PaneSurfaceRegion,
} from './PaneContent.interface';
import { PaneProjection } from './PaneProjection';
import type { Tooltip } from './Tooltip';

class $EditorColumnDefault {
  // The host services the editor column publishes BY NAME. They live here, on the registry both
  // sides reach, so the host and the content spell one string.
  /** `EditorColumnSymbolHoverPort` — the LSP hover card the host owns as a floating overlay. */
  static get SYMBOL_HOVER_CAPABILITY(): string {
    return 'symbol-hover';
  }
  /** `EditorColumnRasterProjectionPort` — what a raster document paints into the column's cells. */
  static get RASTER_PROJECTION_CAPABILITY(): string {
    return 'raster-projection';
  }
  /** The per-frame counter the host's frame loop opens and closes around a paint. */
  static get FRAME_ATTRIBUTION_CAPABILITY(): string {
    return 'frame-attribution';
  }

  protected provider: EditorColumnDefaultProvider | null = null;
  protected host: EditorColumnDefaultContext | null = null;
  protected mountedContent: PaneContent | null = null;
  protected mountedSurface: PaneNativeSurfacePort | null = null;

  /** Register the column's default occupant. One at a time: a second registration while one holds
   *  the column would leave two contents painting one slot, so it is refused by name. */
  register(provider: EditorColumnDefaultProvider): EditorColumnDefaultHostPort {
    if (this.provider) {
      throw new Error(
        `the editor column already has the default content provider ` +
          `"${this.provider.identifier}", so "${provider.identifier}" cannot also occupy it`,
      );
    }
    this.provider = provider;
    return {
      releaseContent: () => this.releaseContent(),
      dispose: () => {
        if (this.provider === provider) this.provider = null;
      },
    };
  }

  /** The view supplies the slot and the host services once the renderables exist. */
  attachHost(host: EditorColumnDefaultContext): void {
    this.host = host;
  }

  /** The mounted default content, built on first read and rebuilt after a release. Null while no
   *  provider is registered — the honest state of a column whose content is uninstalled. */
  get content(): PaneContent | null {
    if (this.mountedContent) return this.mountedContent;
    const { provider, host } = this;
    if (!provider || !host) return null;
    this.mountedContent = provider.create(host);
    this.mountedSurface = PaneProjection.Class.nativeSurface(
      this.mountedContent,
    );
    return this.mountedContent;
  }

  /** The mounted content's native surface, resolved once per mount — the handle the host reads a
   *  caret and a painted region through. Null when nothing occupies the column, and null for a
   *  content that projects cells through `render` instead. */
  get nativeSurface(): PaneNativeSurfacePort | null {
    void this.content;
    return this.mountedSurface;
  }

  /** The registered provider's identity, or null when the column is empty. Read by the status
   *  projection, so a drive can see WHICH contribution occupies the column, or that none does. */
  get providerIdentifier(): string | null {
    return this.provider?.identifier ?? null;
  }

  /** Tear the mounted content down. The content releases what IT brought — its views and its
   *  renderables — so a withdrawn contribution leaves nothing painting and nothing live. */
  releaseContent(): void {
    this.mountedContent?.dispose();
    this.mountedContent = null;
    this.mountedSurface = null;
  }
}

export namespace EditorColumnDefault {
  export const $Class = Static($EditorColumnDefault);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

/** A contribution that supplies the editor column's default occupant. */
export interface EditorColumnDefaultProvider {
  /** Stable identity, for probes and the status projection. */
  readonly identifier: string;
  /** Build the content into the supplied slot. Called once per mount. */
  create(context: EditorColumnDefaultContext): PaneContent;
}

/** What the host hands the provider to build itself into the editor column. */
export interface EditorColumnDefaultContext {
  readonly renderer: CliRenderer;
  /** The bordered editor area the host owns and the content mounts its renderables into. */
  readonly slot: BoxRenderable;
  readonly workspaceSet: WorkspaceSet.Instance;
  readonly settings: Settings.Instance;
  readonly theme: Theme.Instance;
  readonly findBar: FindBar.Instance;
  readonly tooltip: Tooltip.Instance;
  readonly readPalette: () => Palette;
  /** The slot's interior rows and the content surface's usable columns, both host-derived from the
   *  laid-out slot — the host owns the slot, so it owns its extent. */
  readonly viewportRows: () => number;
  readonly viewportColumns: () => number;
  /** Hand the keyboard back to the column's default content when a claiming surface holds it. */
  readonly focusSourceEditor: () => void;
  readonly requestRender: () => void;
  /** A named host service this slot publishes, or null when the host offers none by that name. */
  hostCapability<Port>(identifier: string): Port | null;
}

/** What a registered provider holds onto: the release its uninstall owes, and its unregistration. */
export interface EditorColumnDefaultHostPort {
  /** Tear down the mounted content. A contribution calls this when it is withdrawn. */
  releaseContent(): void;
  /** Withdraw the provider. Releases nothing on its own — release is the contribution's own duty,
   *  the same split `PaneRuntimeHostPort` draws between `releasePane` and `dispose`. */
  dispose(): void;
}

/** What the column's cells must show when the active document is a raster (an image file), or null
 *  when it is ordinary text. An out-of-band graphics tier places its own payload for the region and
 *  returns an empty string, so the cells under it stay blank. */
export type EditorColumnRasterProjectionPort = (
  region: PaneSurfaceRegion,
) => StyledText | string | null;

/** The hover card, reached by name so the column's content never imports the overlay. */
export interface EditorColumnSymbolHoverPort {
  pointAt(
    position: { line: number; column: number },
    screenX: number,
    screenY: number,
  ): void;
  clear(): void;
  pointerOffSymbol(): void;
}
