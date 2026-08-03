// The host's lookup of contributed pane runtimes, keyed by kind, plus the ONE instance-identity
// allocator every kind shares. It is the runtime counterpart of `StatusProjectionContributions`
// (contributed status) and `EditorSurfaceContents` (contributed editor occupants): a plain
// registration point behind an `ApplicationContributionContext` method, not a second plugin kind
// and not a second manifest.
//
// invariant: A pane runtime owns its processes (src/modules/ui/ui.invariants.md)
// invariant: Each panel instance owns one independent session (src/modules/ui/ui.invariants.md)
// invariant: Pane identity is separate from presentation (src/modules/ui/ui.invariants.md)
import type { PaneContent } from './PaneContent.interface';
import type { PaneRuntime, PaneRuntimeRequest } from './PaneRuntime.interface';

class $PaneRuntimes {
  protected readonly runtimesByKind = new Map<string, PaneRuntime>();
  protected readonly instanceCountsByIdentityScopeAndKind = new Map<
    string,
    number
  >();
  protected readonly claimedInstanceIdentifiers = new Set<string>();
  protected nextInstanceIdentifierNumber = 1;

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

  /** Runtime kinds in the declarative order used by the panel's default split action. */
  defaultSplitKinds(): readonly { kind: string; label: string }[] {
    return [...this.runtimesByKind.values()]
      .filter((runtime) => runtime.defaultSplitPriority !== undefined)
      .sort(
        (left, right) =>
          (left.defaultSplitPriority ?? 0) - (right.defaultSplitPriority ?? 0),
      )
      .map((runtime) => ({ kind: runtime.kind, label: runtime.instanceLabel }));
  }

  /** Allocate one opaque application identity and one workspace-local `<Label>`/`<Label> N`. */
  allocateInstanceIdentity(
    kind: string,
    additionalInstance: boolean,
    identityScope = '',
  ): PaneInstanceIdentity | null {
    const runtime = this.runtimesByKind.get(kind);
    if (!runtime) return null;
    const identityScopeAndKind = `${identityScope}\0${kind}`;
    const allocatedCount =
      this.instanceCountsByIdentityScopeAndKind.get(identityScopeAndKind) ?? 0;
    const instanceNumber = additionalInstance ? allocatedCount + 1 : 1;
    this.instanceCountsByIdentityScopeAndKind.set(
      identityScopeAndKind,
      Math.max(allocatedCount, instanceNumber),
    );
    return {
      identifier: this.allocateInstanceIdentifier(),
      label:
        instanceNumber === 1
          ? runtime.instanceLabel
          : `${runtime.instanceLabel} ${instanceNumber}`,
    };
  }

  /** Mint an opaque identifier that this application generation has never issued or restored. */
  allocateInstanceIdentifier(): string {
    while (true) {
      const identifier = `pane-instance-${this.nextInstanceIdentifierNumber}`;
      this.nextInstanceIdentifierNumber += 1;
      if (this.claimedInstanceIdentifiers.has(identifier)) continue;
      this.claimedInstanceIdentifiers.add(identifier);
      return identifier;
    }
  }

  /** Claim an identifier read from persisted state before rebuilding its pane. */
  claimPersistedInstanceIdentifier(identifier: string): boolean {
    if (this.claimedInstanceIdentifiers.has(identifier)) return false;
    this.claimedInstanceIdentifiers.add(identifier);
    return true;
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
