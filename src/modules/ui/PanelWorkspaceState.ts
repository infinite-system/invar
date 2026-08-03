import { Static } from 'ivue/extras';
import type {
  PanelWorkspacePaneState,
  PanelWorkspaceState as PersistedPanelWorkspaceState,
} from '../settings/Settings';
import type { PaneContent } from './PaneContent.interface';
import type { PanelHost, PanelSpace } from './PanelHost';

// invariant: Each workspace owns one panel world (src/modules/workspace/workspace.invariants.md)
class $PanelWorkspaceState {
  static paneIdentifiers(state: PersistedPanelWorkspaceState): string[] {
    return state.spaces.flatMap((space) =>
      space.groups.flatMap((group) =>
        group.flatMap((pane) => (pane.identifier ? [pane.identifier] : [])),
      ),
    );
  }

  static snapshot(
    panelHost: PanelHost.Instance,
    paneKind: (content: PaneContent) => string | null,
  ): PersistedPanelWorkspaceState {
    return {
      spaces: panelHost.spaces.value.map((space) => {
        const groups = space.groups ?? [];
        return {
          kind: space.kind,
          label: space.label,
          groups: groups
            .map((group) =>
              group.contentIds.flatMap((identifier) => {
                const content = panelHost.content(identifier);
                if (!content) return [];
                const kind = paneKind(content);
                return kind === null
                  ? []
                  : [
                      {
                        identifier: content.id,
                        kind,
                        label: content.instanceLabel ?? content.title,
                      },
                    ];
              }),
            )
            .filter((group) => group.length > 0),
          activeGroupIndex: Math.max(
            0,
            groups.findIndex(
              (group) => group.identifier === space.activeGroupId,
            ),
          ),
        };
      }),
      activeSpaceIndex: Math.max(
        0,
        panelHost.spaces.value.findIndex(
          (space) => space.identifier === panelHost.activeSpaceId.value,
        ),
      ),
      panelListExpanded: panelHost.panelListExpanded.value,
      panelListWidth: panelHost.panelListWidth.value,
      visible: panelHost.visible.value,
    };
  }

  static restore(
    state: PersistedPanelWorkspaceState,
    createPane: (pane: PanelWorkspacePaneState) => PaneContent | null,
    spaceKindForPaneKind: (kind: string) => string,
  ): PanelWorkspaceRestoration {
    const spaces: PanelSpace[] = state.spaces.flatMap(
      (spaceState, spaceIndex) => {
        const identifier = `${spaceState.kind}-space-restored-${spaceIndex + 1}`;
        const groups = spaceState.groups.flatMap((paneStates, groupIndex) => {
          const contentIds = paneStates.flatMap((paneState) => {
            const paneSpaceKind = spaceKindForPaneKind(paneState.kind);
            if (paneSpaceKind !== spaceState.kind) return [];
            const content = createPane(paneState);
            return content ? [content.id] : [];
          });
          return contentIds.length > 0
            ? [
                {
                  identifier: `${identifier}-group-${groupIndex + 1}`,
                  contentIds,
                  ratios: contentIds.map(
                    () => 1 / Math.max(1, contentIds.length),
                  ),
                },
              ]
            : [];
        });
        if (groups.length === 0) return [];
        const activeGroup =
          groups[
            Math.max(
              0,
              Math.min(spaceState.activeGroupIndex, groups.length - 1),
            )
          ] ?? groups[0]!;
        return [
          {
            identifier,
            label: spaceState.label,
            kind: spaceState.kind,
            contentIds: groups.flatMap((group) => group.contentIds),
            activeId: activeGroup.contentIds[0] ?? null,
            layout:
              activeGroup.contentIds.length > 1
                ? activeGroup.contentIds.map((contentIdentifier, index) => ({
                    id: contentIdentifier,
                    ratio: activeGroup.ratios[index] ?? 1,
                  }))
                : [],
            focusedIndex: 0,
            groups,
            activeGroupId: activeGroup.identifier,
          },
        ];
      },
    );
    return {
      spaces,
      activeSpaceIndex: state.activeSpaceIndex,
      panelListExpanded: state.panelListExpanded,
      panelListWidth: state.panelListWidth,
      visible: state.visible,
    };
  }
}

export namespace PanelWorkspaceState {
  export const $Class = Static($PanelWorkspaceState);
  export let Class = $Class;
}

export interface PanelWorkspaceRestoration {
  readonly spaces: readonly PanelSpace[];
  readonly activeSpaceIndex: number;
  readonly panelListExpanded: boolean;
  readonly panelListWidth: number;
  readonly visible: boolean;
}
