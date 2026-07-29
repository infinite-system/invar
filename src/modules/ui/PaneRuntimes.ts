// The host's lookup of contributed pane runtimes, keyed by kind, plus the ONE instance-identity
// allocator every kind shares. It is the runtime counterpart of `StatusProjectionContributions`
// (contributed status) and `EditorSurfaceContents` (contributed editor occupants): a plain
// registration point behind an `ApplicationContributionContext` method, not a second plugin kind
// and not a second manifest.
//
// invariant: A pane runtime owns its processes (src/modules/ui/ui.invariants.md)
// invariant: Each panel instance owns one independent session (src/modules/ui/ui.invariants.md)
import type { PaneContent } from './PaneContent.interface';
import type { PaneRuntime, PaneRuntimeRequest } from './PaneRuntime.interface';

class $PaneRuntimes {
  protected readonly runtimesByKind = new Map<string, PaneRuntime>();
  protected readonly instanceCountsByKind = new Map<string, number>();

  register(runtime: PaneRuntime): () => void {
    this.runtimesByKind.set(runtime.kind, runtime);
    return () => {
      if (this.runtimesByKind.get(runtime.kind) === runtime) {
        this.runtimesByKind.delete(runtime.kind);
      }
    };
  }

  runtime(kind: string): PaneRuntime | null {
    return this.runtimesByKind.get(kind) ?? null;
  }

  /** The kinds the panel Add menu offers, in registration order. */
  addableKinds(): readonly { kind: string; label: string }[] {
    return [...this.runtimesByKind.values()]
      .filter((runtime) => runtime.offeredInPanelAddMenu)
      .map((runtime) => ({ kind: runtime.kind, label: runtime.instanceLabel }));
  }

  /** Allocate the next `<Label>`/`<Label> N` identity for a kind. Instance 1 keeps the bare kind
   *  identifier so persisted panel content order and existing probes stay stable. */
  allocateInstanceIdentity(
    kind: string,
    additionalInstance: boolean,
  ): PaneInstanceIdentity | null {
    const runtime = this.runtimesByKind.get(kind);
    if (!runtime) return null;
    const allocatedCount = this.instanceCountsByKind.get(kind) ?? 0;
    const instanceNumber = additionalInstance ? allocatedCount + 1 : 1;
    this.instanceCountsByKind.set(
      kind,
      Math.max(allocatedCount, instanceNumber),
    );
    return {
      identifier: instanceNumber === 1 ? kind : `${kind}-${instanceNumber}`,
      label:
        instanceNumber === 1
          ? runtime.instanceLabel
          : `${runtime.instanceLabel} ${instanceNumber}`,
    };
  }

  createPane(kind: string, request: PaneRuntimeRequest): PaneContent | null {
    return this.runtimesByKind.get(kind)?.createPane(request) ?? null;
  }

  /** Tell the owning runtime that one of its panes left the panel, so it releases the session. */
  paneRemoved(content: PaneContent): void {
    if (!content.kind) return;
    this.runtimesByKind.get(content.kind)?.paneRemoved?.(content);
  }
}

export namespace PaneRuntimes {
  export const $Class = $PaneRuntimes;
  export let Class = $PaneRuntimes;
  export type Model = InstanceType<typeof Class>;
}

export interface PaneInstanceIdentity {
  readonly identifier: string;
  readonly label: string;
}
