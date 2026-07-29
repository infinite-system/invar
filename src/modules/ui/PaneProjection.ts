// The ONE resolver every host paint site calls. A pane content projects either through `render`
// (the host paints the returned cells into a host-owned body) or through the `native-surface`
// capability (the content paints the renderables it owns). The host must not know which: it asks
// here, assigns whatever comes back, and stays free of a per-content branch.
//
// A content that offers NEITHER is a defect, not a default — a silent blank pane reads as an empty
// document, so this throws and names the content instead.
//
// invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md)
import type { StyledText } from '@opentui/core';
import { Static } from 'ivue/extras';
import type {
  PaneContent,
  PaneNativeSurfacePort,
  PaneRenderContext,
} from './PaneContent.interface';

class $PaneProjection {
  /** The capability identifier a self-painting content publishes. */
  protected static get NATIVE_SURFACE_CAPABILITY(): string {
    return 'native-surface';
  }

  /** The content's native surface, or null when it projects through `render`. */
  public static nativeSurface(
    content: PaneContent,
  ): PaneNativeSurfacePort | null {
    return (
      content.capability?.<PaneNativeSurfacePort>(
        this.NATIVE_SURFACE_CAPABILITY,
      ) ?? null
    );
  }

  /** The content's native surface, or a thrown error naming it. For a host that resolves the
   *  capability ONCE and then reads the caret and the painted region through it every frame. */
  public static requireNativeSurface(
    content: PaneContent,
  ): PaneNativeSurfacePort {
    const nativeSurface = this.nativeSurface(content);
    if (!nativeSurface) {
      throw new Error(
        `pane content "${content.id}" must publish the ${this.NATIVE_SURFACE_CAPABILITY} ` +
          `capability: the host mounts none of its renderables`,
      );
    }
    return nativeSurface;
  }

  /** Project the content for this region. Returns the cells the host must assign into its own
   *  body, or null when the content painted its own renderables and the host assigns nothing. */
  public static paint(
    content: PaneContent,
    context: PaneRenderContext,
  ): StyledText | null {
    const nativeSurface = this.nativeSurface(content);
    if (nativeSurface) {
      nativeSurface.paint(context);
      return null;
    }
    if (!content.render) {
      throw new Error(
        `pane content "${content.id}" projects through neither render() nor the ` +
          `${this.NATIVE_SURFACE_CAPABILITY} capability, so it would paint an empty pane`,
      );
    }
    return content.render(context);
  }
}

export namespace PaneProjection {
  export const $Class = Static($PaneProjection);
  export let Class = $Class;
}
