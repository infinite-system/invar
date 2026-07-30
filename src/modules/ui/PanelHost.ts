// A pane SLOT: a generic host for a switchable AND splittable set of PaneContents. It owns
// only WHICH contents are visible, how the visible ones share the width, which one has the keyboard,
// and whether the slot is visible/focused — never the contents' internals. Registering another
// PaneContent (Output, Problems, a plugin) needs zero host changes, and two-or-more contents can
// occupy independent regions side by side (terminal | agent) behind a resizable divider.
// One visible cell is the degenerate case, so the same region model drives single and split layouts.
//
// The host holds NO renderable and NO OpenTUI dependency: RootView mounts the slot, pulls each visible
// cell's `content.render(sub-region)` into its own laid-out column, routes focused keys through
// handleKey to the FOCUSED cell, and converges each cell's sub-region through setViewportSize — so the
// host stays a pure model, unit-testable with plain values.
//
// invariant: The panel renders exactly the visible pane content cells each frame (src/modules/ui/ui.invariants.md)
// invariant: A focused panel routes keystrokes to its active pane content (src/modules/ui/ui.invariants.md)
// invariant: A split panel renders every visible cell into its own sub-region (src/modules/ui/ui.invariants.md)
// invariant: A focused split panel routes keystrokes to the focused cell (src/modules/ui/ui.invariants.md)
// invariant: Split arrangement follows panel content order (src/modules/layout/layout.invariants.md)
import { Static } from 'ivue/extras';
import { Reactive } from 'ivue';
import { ref, shallowRef, type Ref } from 'vue';
import type { KeyEvent } from '@opentui/core';
import type { PaneContent } from './PaneContent.interface';
import type { PanelHostFocusSet } from './PanelHostFocusSet';

// invariant: One panel host owns keyboard focus (src/modules/ui/ui.invariants.md)
class $PanelHost {
  protected get PanelHost() {
    return PanelHost.Class as unknown as typeof $PanelHost;
  }
  protected static get MINIMUM_CELL_RATIO() {
    return 0.12;
  }
  protected get minimumCellRatio() {
    return this.PanelHost.MINIMUM_CELL_RATIO;
  }
  protected readonly unregisterFromFocusSet: () => void;
  protected readonly contentSets = new Set<PanelContentSet>();
  protected readonly sharedContents = new Map<string, PaneContent>();
  protected readonly initialContentOrder: string[];
  protected nextPanelGroupNumber = 1;
  protected selectedContentSet: PanelContentSet;

  constructor(readonly options: PanelHostOptions = {}) {
    this.unregisterFromFocusSet =
      this.options.focusSet?.register(this) ?? (() => {});
    this.initialContentOrder = [...(this.options.contentOrder?.value ?? [])];
    this.selectedContentSet = this.createContentSet();
  }
  /** The registry, keyed by content id. Non-reactive — `order`/`layout` drive what shows. */
  protected get contents(): Map<string, PaneContent> {
    return this.selectedContentSet.contents;
  }
  /** Whether the slot is shown at all (VS Code: the bottom panel is toggled). */
  get visible() {
    return ref(false);
  }
  /** Whether the slot owns the keyboard. */
  get focused() {
    return ref(false);
  }
  /** Expanded replaces only the editor-center and bottom-panel vertical slots; dock slots stay put. */
  get expanded() {
    return ref(false);
  }
  /** The focused content id in the visible group, or null when nothing is registered. */
  get activeId() {
    return ref<string | null>(null);
  }
  /** Registered content ids in creation order. Group order controls the visible list projection. */
  get order() {
    return this.options.contentOrder ?? shallowRef<string[]>([]);
  }
  /** The visible group's cells left-to-right with their width shares. Empty means a singleton group. */
  get layout() {
    return shallowRef<PanelCell[]>([]);
  }
  /** Index into the resolved visible cells that currently owns the keyboard (0 in the degenerate case). */
  get focusedIndex() {
    return ref(0);
  }
  /** Workspace-local content spaces. Each space owns its pane membership and split layout. */
  get spaces() {
    return shallowRef<PanelSpace[]>([]);
  }
  get activeSpaceId() {
    return ref<string | null>(null);
  }
  get panelListExpanded() {
    return ref(false);
  }
  get panelListWidth() {
    return ref(20);
  }
  /** The content set currently projected by this stable host. */
  get activeContentSet(): PanelContentSet {
    return this.selectedContentSet;
  }
  /** True when two or more cells share the slot. */
  get isSplit(): boolean {
    return this.resolvedCells.length > 1;
  }
  /** The docked contents list is useful only when there is a choice to make. */
  get panelListVisible(): boolean {
    return (
      this.visible.value &&
      this.panelListExpanded.value &&
      this.activeSpaceContents.length > 1
    );
  }
  get panelCountChipVisible(): boolean {
    return this.visible.value && this.activeSpaceContents.length > 1;
  }
  get activeSpace(): PanelSpace | null {
    const identifier = this.activeSpaceId.value;
    return (
      this.spaces.value.find((space) => space.identifier === identifier) ?? null
    );
  }
  get activeSpaceContents(): PaneContent[] {
    const space = this.activeSpace;
    if (!space) return [];
    const identifiers = new Set(space.contentIds);
    return this.order.value
      .filter((identifier) => identifiers.has(identifier))
      .map((identifier) => this.contents.get(identifier))
      .filter((content): content is PaneContent => content !== undefined);
  }
  /** Create one independent set of pane sessions and host projection state. */
  // invariant: Each workspace owns one panel world (src/modules/workspace/workspace.invariants.md)
  createContentSet(): PanelContentSet {
    const ownedIdentifiers = new Set(
      [...this.contentSets].flatMap((contentSet) => [
        ...contentSet.contents.keys(),
      ]),
    );
    const contentSet: PanelContentSet = {
      contents: new Map(this.sharedContents),
      order: [
        ...this.initialContentOrder.filter(
          (identifier) => !ownedIdentifiers.has(identifier),
        ),
        ...[...this.sharedContents.keys()].filter(
          (identifier) => !this.initialContentOrder.includes(identifier),
        ),
      ],
      visible: false,
      focused: false,
      expanded: false,
      activeId: null,
      layout: [],
      focusedIndex: 0,
      spaces: [...this.sharedContents.values()].map((content, index) => ({
        identifier: `database-space-${index + 1}`,
        label: index === 0 ? 'Database' : `Database ${index + 1}`,
        kind: 'database',
        contentIds: [content.id],
        activeId: content.id,
        layout: [],
        focusedIndex: 0,
        groups: [
          {
            identifier: `database-space-${index + 1}-group-1`,
            contentIds: [content.id],
            ratios: [1],
          },
        ],
        activeGroupId: `database-space-${index + 1}-group-1`,
      })),
      activeSpaceId: this.sharedContents.size > 0 ? 'database-space-1' : null,
      panelListExpanded: false,
      panelListWidth: 20,
    };
    this.contentSets.add(contentSet);
    return contentSet;
  }
  /** Project another owned content set without disposing the set that becomes hidden. */
  // invariant: Each workspace owns one panel world (src/modules/workspace/workspace.invariants.md)
  selectContentSet(contentSet: PanelContentSet): void {
    if (
      contentSet === this.selectedContentSet ||
      !this.contentSets.has(contentSet)
    ) {
      return;
    }
    const previousFocusedContent = this.focused.value
      ? this.focusedContent
      : null;
    this.synchronizeSelectedContentSet();
    previousFocusedContent?.onBlur();
    this.selectedContentSet = contentSet;
    this.restoreSelectedContentSet();
    if (this.focused.value) this.focusedContent?.onFocus();
  }
  /** Dispose one hidden world. Closing a workspace calls this and leaves every other world alive. */
  // invariant: Each workspace owns one panel world (src/modules/workspace/workspace.invariants.md)
  disposeContentSet(contentSet: PanelContentSet): void {
    if (!this.contentSets.has(contentSet)) return;
    const contentSetIsSelected = contentSet === this.selectedContentSet;
    const focusedContent =
      contentSetIsSelected && this.focused.value ? this.focusedContent : null;
    const contentInstances = [...contentSet.contents.values()].filter(
      (content) => !this.sharedContents.has(content.id),
    );
    contentSet.contents.clear();
    contentSet.order = [];
    contentSet.visible = false;
    contentSet.focused = false;
    contentSet.expanded = false;
    contentSet.activeId = null;
    contentSet.layout = [];
    contentSet.focusedIndex = 0;
    contentSet.spaces = [];
    contentSet.activeSpaceId = null;
    contentSet.panelListExpanded = false;
    contentSet.panelListWidth = 20;
    if (contentSetIsSelected) {
      focusedContent?.onBlur();
      this.visible.value = false;
      this.focused.value = false;
      this.expanded.value = false;
      this.activeId.value = null;
      this.layout.value = [];
      this.focusedIndex.value = 0;
      this.spaces.value = [];
      this.activeSpaceId.value = null;
      this.panelListExpanded.value = false;
      this.panelListWidth.value = 20;
    }
    this.contentSets.delete(contentSet);
    for (const content of contentInstances) {
      content.dispose();
      this.options.onContentRemoved?.(content);
    }
  }
  /** Remove one runtime-owned pane from whichever content set owns that exact identifier. */
  removeContentFromAnySet(identifier: string): void {
    for (const contentSet of this.contentSets) {
      if (!contentSet.contents.has(identifier)) continue;
      if (contentSet === this.selectedContentSet) {
        this.removeContent(identifier);
      } else {
        this.removeContentFromHiddenSet(contentSet, identifier);
      }
      return;
    }
  }
  protected synchronizeSelectedContentSet(): void {
    this.commitActiveSpace();
    this.selectedContentSet.order = [...this.order.value];
    this.selectedContentSet.visible = this.visible.value;
    this.selectedContentSet.focused = this.focused.value;
    this.selectedContentSet.expanded = this.expanded.value;
    this.selectedContentSet.activeId = this.activeId.value;
    this.selectedContentSet.layout = this.layout.value.map((cell) => ({
      ...cell,
    }));
    this.selectedContentSet.focusedIndex = this.focusedIndex.value;
    this.selectedContentSet.spaces = this.cloneSpaces(this.spaces.value);
    this.selectedContentSet.activeSpaceId = this.activeSpaceId.value;
    this.selectedContentSet.panelListExpanded = this.panelListExpanded.value;
    this.selectedContentSet.panelListWidth = this.panelListWidth.value;
  }
  protected restoreSelectedContentSet(): void {
    this.order.value = [...this.selectedContentSet.order];
    this.visible.value = this.selectedContentSet.visible;
    this.focused.value = this.selectedContentSet.focused;
    this.expanded.value = this.selectedContentSet.expanded;
    this.activeId.value = this.selectedContentSet.activeId;
    this.layout.value = this.selectedContentSet.layout.map((cell) => ({
      ...cell,
    }));
    this.focusedIndex.value = this.selectedContentSet.focusedIndex;
    this.spaces.value = this.cloneSpaces(this.selectedContentSet.spaces);
    this.activeSpaceId.value = this.selectedContentSet.activeSpaceId;
    this.panelListExpanded.value = this.selectedContentSet.panelListExpanded;
    this.panelListWidth.value = this.selectedContentSet.panelListWidth;
    this.loadActiveSpace();
  }
  protected cloneSpaces(spaces: readonly PanelSpace[]): PanelSpace[] {
    return spaces.map((space) => ({
      ...space,
      contentIds: [...space.contentIds],
      layout: space.layout.map((cell) => ({ ...cell })),
      groups: space.groups?.map((group) => ({
        ...group,
        contentIds: [...group.contentIds],
        ratios: [...group.ratios],
      })),
    }));
  }
  protected commitActiveSpace(): void {
    const activeSpace = this.activeSpace;
    if (!activeSpace) return;
    activeSpace.activeId = this.activeId.value;
    activeSpace.layout = this.layout.value.map((cell) => ({ ...cell }));
    activeSpace.focusedIndex = this.focusedIndex.value;
    const activeGroup = this.activeGroup(activeSpace);
    if (activeGroup) {
      const cells = this.resolvedCells;
      activeGroup.contentIds = cells.map((cell) => cell.content.id);
      activeGroup.ratios = cells.map((cell) => cell.ratio);
    }
  }
  protected loadActiveSpace(): void {
    const activeSpace = this.activeSpace;
    if (!activeSpace) {
      this.activeId.value = null;
      this.layout.value = [];
      this.focusedIndex.value = 0;
      return;
    }
    const activeGroup = this.activeGroup(activeSpace);
    if (!activeGroup) {
      this.activeId.value = activeSpace.activeId;
      this.layout.value = activeSpace.layout.map((cell) => ({ ...cell }));
      this.focusedIndex.value = activeSpace.focusedIndex;
      return;
    }
    const focusedIdentifier =
      activeSpace.activeId &&
      activeGroup.contentIds.includes(activeSpace.activeId)
        ? activeSpace.activeId
        : (activeGroup.contentIds[0] ?? null);
    const focusedIndex = Math.max(
      0,
      activeGroup.contentIds.indexOf(focusedIdentifier ?? ''),
    );
    this.activeId.value = focusedIdentifier;
    this.focusedIndex.value = focusedIndex;
    this.layout.value =
      activeGroup.contentIds.length > 1
        ? activeGroup.contentIds.map((identifier, index) => ({
            id: identifier,
            ratio:
              activeGroup.ratios[index] ?? 1 / activeGroup.contentIds.length,
          }))
        : [];
    activeSpace.activeId = focusedIdentifier;
    activeSpace.focusedIndex = focusedIndex;
    activeSpace.layout = this.layout.value.map((cell) => ({ ...cell }));
  }
  protected groups(space: PanelSpace): PanelGroup[] {
    if (space.groups) return space.groups;
    const visibleIdentifiers =
      space.layout.length > 1
        ? space.layout.map((cell) => cell.id)
        : space.activeId
          ? [space.activeId]
          : [];
    const groupedIdentifiers = new Set(visibleIdentifiers);
    const groups: PanelGroup[] = [];
    if (visibleIdentifiers.length > 0) {
      groups.push({
        identifier: `${space.identifier}-group-1`,
        contentIds: visibleIdentifiers,
        ratios:
          space.layout.length > 1
            ? space.layout.map((cell) => cell.ratio)
            : [1],
      });
    }
    for (const identifier of space.contentIds) {
      if (groupedIdentifiers.has(identifier)) continue;
      groups.push({
        identifier: `${space.identifier}-group-${groups.length + 1}`,
        contentIds: [identifier],
        ratios: [1],
      });
    }
    space.groups = groups;
    space.activeGroupId ??= groups[0]?.identifier ?? null;
    return groups;
  }
  protected activeGroup(space: PanelSpace): PanelGroup | null {
    const groups = this.groups(space);
    return (
      groups.find((group) => group.identifier === space.activeGroupId) ??
      groups.find((group) => group.contentIds.includes(space.activeId ?? '')) ??
      groups[0] ??
      null
    );
  }
  panelGroups(): readonly PanelGroup[] {
    const space = this.activeSpace;
    return space ? this.groups(space) : [];
  }
  restoreWorkspaceState(options: {
    spaces: readonly PanelSpace[];
    activeSpaceIndex: number;
    panelListExpanded: boolean;
    panelListWidth: number;
    visible: boolean;
  }): void {
    this.spaces.value = this.cloneSpaces(options.spaces);
    const activeSpace =
      this.spaces.value[
        Math.max(
          0,
          Math.min(options.activeSpaceIndex, this.spaces.value.length - 1),
        )
      ] ?? null;
    this.activeSpaceId.value = activeSpace?.identifier ?? null;
    this.panelListExpanded.value = options.panelListExpanded;
    this.panelListWidth.value = options.panelListWidth;
    this.visible.value = options.visible && activeSpace !== null;
    this.loadActiveSpace();
    this.synchronizeSelectedContentSet();
  }
  groupForContent(identifier: string): PanelGroup | null {
    const space = this.activeSpace;
    return (
      (space
        ? this.groups(space).find((group) =>
            group.contentIds.includes(identifier),
          )
        : null) ?? null
    );
  }
  protected contentSpaceKind(content: PaneContent): string {
    return (content.kind ?? content.id) === 'database'
      ? 'database'
      : 'terminal';
  }
  protected nextSpaceLabel(kind: string): string {
    const baseLabel = kind === 'database' ? 'Database' : 'Terminal';
    const count = this.spaces.value.filter(
      (space) => space.kind === kind,
    ).length;
    return count === 0 ? baseLabel : `${baseLabel} ${count + 1}`;
  }
  protected insertSpace(space: PanelSpace): void {
    const spaces = [...this.spaces.value];
    if (space.kind === 'terminal') {
      const databaseIndex = spaces.findIndex(
        (candidate) => candidate.kind === 'database',
      );
      spaces.splice(
        databaseIndex < 0 ? spaces.length : databaseIndex,
        0,
        space,
      );
    } else {
      spaces.push(space);
    }
    this.spaces.value = spaces;
  }
  protected nextSpaceIdentifier(kind: string): string {
    let number = 1;
    let identifier = `${kind}-space-${number}`;
    const identifiers = new Set(
      this.spaces.value.map((space) => space.identifier),
    );
    while (identifiers.has(identifier)) {
      number += 1;
      identifier = `${kind}-space-${number}`;
    }
    return identifier;
  }
  protected nextGroupIdentifier(space: PanelSpace): string {
    let identifier = `${space.identifier}-group-${this.nextPanelGroupNumber}`;
    const identifiers = new Set(
      this.spaces.value.flatMap((candidate) =>
        (candidate.groups ?? []).map((group) => group.identifier),
      ),
    );
    while (identifiers.has(identifier)) {
      this.nextPanelGroupNumber += 1;
      identifier = `${space.identifier}-group-${this.nextPanelGroupNumber}`;
    }
    this.nextPanelGroupNumber += 1;
    return identifier;
  }
  createSpaceForContent(contentId: string, kind?: string): string | null {
    const content = this.contents.get(contentId);
    if (!content) return null;
    this.commitActiveSpace();
    const spaceKind = kind ?? this.contentSpaceKind(content);
    if (spaceKind !== 'database') {
      for (const space of this.spaces.value) {
        space.contentIds = space.contentIds.filter(
          (identifier) => identifier !== contentId,
        );
        space.layout = space.layout.filter((cell) => cell.id !== contentId);
        if (space.groups) {
          space.groups = space.groups
            .map((group) => ({
              ...group,
              contentIds: group.contentIds.filter(
                (identifier) => identifier !== contentId,
              ),
              ratios: group.contentIds
                .filter((identifier) => identifier !== contentId)
                .map(() => 1),
            }))
            .filter((group) => group.contentIds.length > 0);
        }
        if (space.layout.length < 2) space.layout = [];
        if (space.activeId === contentId) {
          space.activeId = space.contentIds[0] ?? null;
          space.focusedIndex = 0;
        }
      }
      this.spaces.value = this.spaces.value.filter(
        (space) => space.contentIds.length > 0,
      );
    }
    const identifier = this.nextSpaceIdentifier(spaceKind);
    const space: PanelSpace = {
      identifier,
      label: this.nextSpaceLabel(spaceKind),
      kind: spaceKind,
      contentIds: [contentId],
      activeId: contentId,
      layout: [],
      focusedIndex: 0,
      groups: [
        {
          identifier: `${identifier}-group-1`,
          contentIds: [contentId],
          ratios: [1],
        },
      ],
      activeGroupId: `${identifier}-group-1`,
    };
    this.insertSpace(space);
    this.activeSpaceId.value = identifier;
    this.loadActiveSpace();
    this.visible.value = true;
    this.focus();
    this.options.persistWorkspaceState?.();
    return identifier;
  }
  selectSpace(identifier: string): void {
    if (
      identifier === this.activeSpaceId.value ||
      !this.spaces.value.some((space) => space.identifier === identifier)
    ) {
      return;
    }
    const previousFocusedContent = this.focused.value
      ? this.focusedContent
      : null;
    this.commitActiveSpace();
    this.activeSpaceId.value = identifier;
    this.loadActiveSpace();
    if (this.focused.value && previousFocusedContent !== this.focusedContent) {
      previousFocusedContent?.onBlur();
      this.focusedContent?.onFocus();
    }
    this.options.persistWorkspaceState?.();
  }
  togglePanelList(): void {
    if (!this.panelCountChipVisible) {
      this.panelListExpanded.value = false;
      return;
    }
    this.panelListExpanded.value = !this.panelListExpanded.value;
    this.options.persistWorkspaceState?.();
  }
  protected setOrder(order: string[]): void {
    this.order.value = order;
    this.selectedContentSet.order = [...order];
  }
  protected removeContentFromHiddenSet(
    contentSet: PanelContentSet,
    identifier: string,
    disposeContent = true,
  ): void {
    const content = contentSet.contents.get(identifier);
    if (!content) return;
    contentSet.contents.delete(identifier);
    contentSet.spaces = contentSet.spaces
      .map((space) => ({
        ...space,
        contentIds: space.contentIds.filter(
          (candidateIdentifier) => candidateIdentifier !== identifier,
        ),
        layout: space.layout.filter((cell) => cell.id !== identifier),
        groups: space.groups
          ?.map((group) => ({
            ...group,
            contentIds: group.contentIds.filter(
              (candidateIdentifier) => candidateIdentifier !== identifier,
            ),
            ratios: group.contentIds
              .filter(
                (candidateIdentifier) => candidateIdentifier !== identifier,
              )
              .map(() => 1),
          }))
          .filter((group) => group.contentIds.length > 0),
        activeId: space.activeId === identifier ? null : space.activeId,
      }))
      .filter((space) => space.contentIds.length > 0);
    if (
      !contentSet.spaces.some(
        (space) => space.identifier === contentSet.activeSpaceId,
      )
    ) {
      contentSet.activeSpaceId = contentSet.spaces[0]?.identifier ?? null;
    }
    if (!this.options.retainUnregisteredContentOrder) {
      contentSet.order = contentSet.order.filter(
        (candidateIdentifier) => candidateIdentifier !== identifier,
      );
    }
    const remainingVisibleIdentifiers = contentSet.layout
      .map((cell) => cell.id)
      .filter(
        (candidateIdentifier) =>
          candidateIdentifier !== identifier &&
          contentSet.contents.has(candidateIdentifier),
      );
    if (remainingVisibleIdentifiers.length === 0) {
      contentSet.layout = [];
      contentSet.activeId =
        contentSet.order.find((candidateIdentifier) =>
          contentSet.contents.has(candidateIdentifier),
        ) ?? null;
      contentSet.focusedIndex = 0;
    } else if (remainingVisibleIdentifiers.length === 1) {
      contentSet.layout = [];
      contentSet.activeId = remainingVisibleIdentifiers[0] ?? null;
      contentSet.focusedIndex = 0;
    } else {
      const ratio = 1 / remainingVisibleIdentifiers.length;
      contentSet.layout = remainingVisibleIdentifiers.map(
        (candidateIdentifier) => ({
          id: candidateIdentifier,
          ratio,
        }),
      );
      contentSet.focusedIndex = Math.min(
        contentSet.focusedIndex,
        remainingVisibleIdentifiers.length - 1,
      );
      contentSet.activeId =
        remainingVisibleIdentifiers[contentSet.focusedIndex] ??
        remainingVisibleIdentifiers[0] ??
        null;
    }
    if (contentSet.contents.size === 0) {
      contentSet.visible = false;
      contentSet.focused = false;
      contentSet.expanded = false;
    }
    if (disposeContent) {
      content.dispose();
      this.options.onContentRemoved?.(content);
    }
  }
  /** Register a content. The first one registered becomes active. Idempotent per id. */
  register(content: PaneContent): void {
    if (this.contents.has(content.id)) return;
    for (const contentSet of this.contentSets) {
      if (contentSet === this.selectedContentSet) continue;
      if (contentSet.contents.has(content.id)) {
        throw new Error(
          `Panel content identifier is already owned by another content set: ${content.id}`,
        );
      }
      contentSet.order = contentSet.order.filter(
        (identifier) => identifier !== content.id,
      );
    }
    this.contents.set(content.id, content);
    if (!this.order.value.includes(content.id)) {
      this.setOrder([...this.order.value, content.id]);
      this.options.persistContentOrder?.();
    }
    if (this.activeId.value === null) this.activeId.value = content.id;
    const spaceKind = this.contentSpaceKind(content);
    let targetSpace =
      this.activeSpace?.kind === spaceKind ? this.activeSpace : null;
    if (!targetSpace) {
      targetSpace =
        this.spaces.value.find((space) => space.kind === spaceKind) ?? null;
    }
    if (!targetSpace) {
      const identifier = this.nextSpaceIdentifier(spaceKind);
      targetSpace = {
        identifier,
        label: this.nextSpaceLabel(spaceKind),
        kind: spaceKind,
        contentIds: [],
        activeId: null,
        layout: [],
        focusedIndex: 0,
        groups: [],
        activeGroupId: null,
      };
      this.insertSpace(targetSpace);
      if (this.activeSpaceId.value === null) {
        this.activeSpaceId.value = identifier;
      }
    }
    if (!targetSpace.contentIds.includes(content.id)) {
      targetSpace.contentIds.push(content.id);
      const groups = this.groups(targetSpace);
      const groupIdentifier = this.nextGroupIdentifier(targetSpace);
      groups.push({
        identifier: groupIdentifier,
        contentIds: [content.id],
        ratios: [1],
      });
      targetSpace.activeGroupId ??= groupIdentifier;
    }
    if (targetSpace.activeId === null) targetSpace.activeId = content.id;
    if (targetSpace.identifier === this.activeSpaceId.value) {
      this.loadActiveSpace();
    }
    // Registration may land asynchronously (for example, a plugin becoming ready). Reveal the
    // dock-style host without stealing keyboard focus from the pane the user is actively driving.
    if (this.options.showWhenContentRegistered) this.visible.value = true;
  }
  /** Register one application-owned content in every workspace panel world. */
  registerShared(content: PaneContent): void {
    if (this.sharedContents.has(content.id)) return;
    this.sharedContents.set(content.id, content);
    this.register(content);
    for (const contentSet of this.contentSets) {
      if (contentSet === this.selectedContentSet) continue;
      contentSet.contents.set(content.id, content);
      if (!contentSet.order.includes(content.id)) {
        contentSet.order.push(content.id);
      }
      if (
        !contentSet.spaces.some((space) =>
          space.contentIds.includes(content.id),
        )
      ) {
        const number =
          contentSet.spaces.filter((space) => space.kind === 'database')
            .length + 1;
        contentSet.spaces.push({
          identifier: `database-space-${contentSet.spaces.length + 1}`,
          label: number === 1 ? 'Database' : `Database ${number}`,
          kind: 'database',
          contentIds: [content.id],
          activeId: content.id,
          layout: [],
          focusedIndex: 0,
          groups: [
            {
              identifier: `database-space-${contentSet.spaces.length + 1}-group-1`,
              contentIds: [content.id],
              ratios: [1],
            },
          ],
          activeGroupId: `database-space-${contentSet.spaces.length + 1}-group-1`,
        });
        contentSet.activeSpaceId ??= contentSet.spaces[0]?.identifier ?? null;
      }
    }
  }
  /** Withdraw one application-owned content from every workspace and dispose it once. */
  removeSharedContent(identifier: string): void {
    const content = this.sharedContents.get(identifier);
    if (!content) return;
    this.sharedContents.delete(identifier);
    for (const contentSet of this.contentSets) {
      if (!contentSet.contents.has(identifier)) continue;
      if (contentSet === this.selectedContentSet) {
        this.detachContent(identifier);
      } else {
        this.removeContentFromHiddenSet(contentSet, identifier, false);
      }
    }
    content.dispose();
    this.options.onContentRemoved?.(content);
  }
  /** Whether a content id is registered. */
  has(id: string): boolean {
    return this.contents.has(id);
  }
  /** The registered content for an id (whether or not it is currently visible), or null. Lets a host
   *  bind extra machinery to a specific pane (e.g. the agent's shared scroll engine) without waiting for
   *  it to be the active/visible cell. */
  content(id: string): PaneContent | null {
    return this.contents.get(id) ?? null;
  }
  /** First registered instance of a shared content kind, in persisted panel order. */
  contentOfKind(kind: string): PaneContent | null {
    return (
      this.orderedContents.find(
        (content) => (content.kind ?? content.id) === kind,
      ) ?? null
    );
  }
  /** The currently visible instance of a shared content kind. */
  visibleContentOfKind(kind: string): PaneContent | null {
    return (
      this.resolvedCells.find(
        (cell) => (cell.content.kind ?? cell.content.id) === kind,
      )?.content ?? null
    );
  }
  /** The active content, or null. */
  get activeContent(): PaneContent | null {
    const id = this.activeId.value;
    return id === null ? null : (this.contents.get(id) ?? null);
  }
  /** Registered contents in the persisted user order. */
  get orderedContents(): PaneContent[] {
    return this.order.value
      .map((identifier) => this.contents.get(identifier))
      .filter((content): content is PaneContent => content !== undefined);
  }
  /** The visible cells, resolved to live contents with normalized ratios. When no split is set (or the
   *  split resolves to nothing registered), this is just the single active content at full width — so
   *  the whole render/resize/focus path has ONE shape and the single-pane case is simply length 1. */
  get resolvedCells(): ResolvedPanelCell[] {
    const layout = this.layout.value;
    const resolved: ResolvedPanelCell[] = [];
    for (const cell of layout) {
      const content = this.contents.get(cell.id);
      if (content) resolved.push({ content, ratio: Math.max(0, cell.ratio) });
    }
    if (resolved.length === 0) {
      const active = this.activeContent;
      return active ? [{ content: active, ratio: 1 }] : [];
    }
    const total = resolved.reduce((sum, cell) => sum + cell.ratio, 0) || 1;
    return resolved.map((cell) => ({
      content: cell.content,
      ratio: cell.ratio / total,
    }));
  }
  /** Every visible content (for the reactive repaint subscription: any cell's async paint repaints). */
  visibleContents(): PaneContent[] {
    return this.resolvedCells.map((cell) => cell.content);
  }
  isContentVisible(id: string): boolean {
    return (
      this.visible.value &&
      this.resolvedCells.some((cell) => cell.content.id === id)
    );
  }
  /** The content that currently owns the keyboard — the focused cell, or the single active content. */
  get focusedContent(): PaneContent | null {
    const cells = this.resolvedCells;
    if (cells.length === 0) return null;
    const index = Math.min(
      Math.max(0, this.focusedIndex.value),
      cells.length - 1,
    );
    return cells[index]?.content ?? null;
  }
  /** Run a layout/focus mutation, then fire onBlur/onFocus ONLY if the focused content actually changed
   *  — so activate(), focusCell(), split(), and unsplit() never double-notify or leave a stale pane
   *  focused, whatever the current layout. */
  protected retargetFocus(mutate: () => void): void {
    const previous = this.focusedContent;
    mutate();
    const next = this.focusedContent;
    if (this.focused.value && previous !== next) {
      previous?.onBlur();
      next?.onFocus();
    }
  }
  /** Switch the single-pane active content (no-op for an unknown id). Focus transitions only when the
   *  focused content actually changes — under a split, activeId is not the focus target, so this is a
   *  silent background switch. */
  activate(id: string): void {
    if (!this.contents.has(id) || this.activeId.value === id) return;
    this.retargetFocus(() => {
      this.activeId.value = id;
    });
  }
  /** Cycle the single-pane active content (for a switcher key); wraps. */
  cycle(delta: number): void {
    const spaces = this.spaces.value;
    if (spaces.length < 2) return;
    const current = Math.max(
      0,
      spaces.findIndex(
        (space) => space.identifier === this.activeSpaceId.value,
      ),
    );
    const next = (current + delta + spaces.length) % spaces.length;
    const nextSpace = spaces[next];
    if (nextSpace) this.selectSpace(nextSpace.identifier);
  }
  /** Put the given registered contents side by side in the slot, left to right. Unknown ids are
   *  dropped; an empty/all-unknown list clears the split (back to single-pane). Optional ratios set the
   *  initial shares (defaults to equal). */
  split(ids: string[], ratios?: number[]): void {
    const owningSpace = this.spaces.value.find(
      (space) =>
        ids.length > 0 &&
        ids.every((identifier) => space.contentIds.includes(identifier)),
    );
    if (owningSpace && owningSpace.identifier !== this.activeSpaceId.value) {
      this.selectSpace(owningSpace.identifier);
    }
    const requestedIdentifiers = new Set(
      ids.filter((id) => this.contents.has(id)),
    );
    const valid = this.options.contentOrder
      ? this.order.value.filter((id) => requestedIdentifiers.has(id))
      : ids.filter(
          (id, index) =>
            requestedIdentifiers.has(id) && ids.indexOf(id) === index,
        );
    this.retargetFocus(() => {
      if (valid.length === 0) {
        this.layout.value = [];
        this.focusedIndex.value = 0;
        return;
      }
      const shares =
        ratios && ratios.length === valid.length
          ? ratios
          : valid.map(() => 1 / valid.length);
      const total =
        shares.reduce((sum, share) => sum + Math.max(0, share), 0) || 1;
      this.layout.value = valid.map((id, index) => ({
        id,
        ratio: Math.max(0, shares[index] ?? 0) / total,
      }));
      if (this.focusedIndex.value >= valid.length) this.focusedIndex.value = 0;
      this.activeId.value = valid[this.focusedIndex.value] ?? valid[0] ?? null;
      const space = this.activeSpace;
      if (space) {
        const identifiers = new Set(valid);
        const previousGroups = this.groups(space);
        const insertionIndex = Math.max(
          0,
          previousGroups.findIndex((group) =>
            group.contentIds.some((identifier) => identifiers.has(identifier)),
          ),
        );
        const remainingGroups = previousGroups
          .map((group) => ({
            ...group,
            contentIds: group.contentIds.filter(
              (identifier) => !identifiers.has(identifier),
            ),
            ratios: group.ratios.filter(
              (_ratio, index) =>
                !identifiers.has(group.contentIds[index] ?? ''),
            ),
          }))
          .filter((group) => group.contentIds.length > 0);
        const group: PanelGroup = {
          identifier: this.nextGroupIdentifier(space),
          contentIds: [...valid],
          ratios: this.layout.value.map((cell) => cell.ratio),
        };
        remainingGroups.splice(
          Math.min(insertionIndex, remainingGroups.length),
          0,
          group,
        );
        space.groups = remainingGroups;
        space.activeGroupId = group.identifier;
      }
    });
    this.commitActiveSpace();
    this.options.persistWorkspaceState?.();
  }
  /** Focus/activate an open content selected from the docked contents list. */
  activateOpenContent(id: string): void {
    this.showContent(id);
  }
  /** Select the full-width pane or explicit split group that contains one open instance. */
  showContent(id: string): void {
    const content = this.contents.get(id);
    if (!content) return;
    const owningSpace = this.spaces.value.find((space) =>
      space.contentIds.includes(id),
    );
    if (owningSpace && owningSpace.identifier !== this.activeSpaceId.value) {
      this.selectSpace(owningSpace.identifier);
    }
    const space = this.activeSpace;
    const group = space
      ? this.groups(space).find((candidate) =>
          candidate.contentIds.includes(id),
        )
      : null;
    this.retargetFocus(() => {
      if (space && group) space.activeGroupId = group.identifier;
      this.loadActiveSpace();
      const index = this.resolvedCells.findIndex(
        (cell) => cell.content.id === id,
      );
      this.focusedIndex.value = Math.max(0, index);
      this.activeId.value = id;
    });
    this.focus();
    this.visible.value = true;
    this.commitActiveSpace();
  }

  /** Join an already registered pane to the explicit split group that contains `targetIdentifier`. */
  addContentToGroup(id: string, targetIdentifier: string): boolean {
    if (id === targetIdentifier || !this.contents.has(id)) return false;
    const space = this.activeSpace;
    if (!space) return false;
    const groups = this.groups(space);
    const targetGroup = groups.find((group) =>
      group.contentIds.includes(targetIdentifier),
    );
    const sourceGroup = groups.find((group) => group.contentIds.includes(id));
    if (!targetGroup || sourceGroup === targetGroup) return false;
    if (sourceGroup) {
      sourceGroup.contentIds = sourceGroup.contentIds.filter(
        (identifier) => identifier !== id,
      );
      sourceGroup.ratios = sourceGroup.contentIds.map(
        () => 1 / Math.max(1, sourceGroup.contentIds.length),
      );
    }
    space.groups = groups.filter((group) => group.contentIds.length > 0);
    targetGroup.contentIds.push(id);
    targetGroup.ratios = targetGroup.contentIds.map(
      () => 1 / targetGroup.contentIds.length,
    );
    space.activeGroupId = targetGroup.identifier;
    space.activeId = id;
    this.loadActiveSpace();
    this.focusCell(targetGroup.contentIds.length - 1);
    this.visible.value = true;
    this.focus();
    this.commitActiveSpace();
    this.options.persistWorkspaceState?.();
    return true;
  }

  /** Detach one split member into a new full-width group at a group-list position. */
  detachGroupMember(identifier: string, targetGroupIndex: number): boolean {
    const space = this.activeSpace;
    if (!space) return false;
    const groups = this.groups(space);
    const sourceGroup = groups.find((group) =>
      group.contentIds.includes(identifier),
    );
    if (!sourceGroup || sourceGroup.contentIds.length < 2) return false;
    sourceGroup.contentIds = sourceGroup.contentIds.filter(
      (candidate) => candidate !== identifier,
    );
    sourceGroup.ratios = sourceGroup.contentIds.map(
      () => 1 / sourceGroup.contentIds.length,
    );
    const detachedGroup: PanelGroup = {
      identifier: this.nextGroupIdentifier(space),
      contentIds: [identifier],
      ratios: [1],
    };
    const clampedIndex = Math.max(0, Math.min(targetGroupIndex, groups.length));
    groups.splice(clampedIndex, 0, detachedGroup);
    space.activeGroupId = detachedGroup.identifier;
    space.activeId = identifier;
    this.loadActiveSpace();
    this.options.persistWorkspaceState?.();
    return true;
  }

  /** Reorder one member within its split group. */
  moveGroupMember(identifier: string, targetMemberIndex: number): boolean {
    const space = this.activeSpace;
    if (!space) return false;
    const group = this.groups(space).find((candidate) =>
      candidate.contentIds.includes(identifier),
    );
    if (!group || group.contentIds.length < 2) return false;
    const sourceIndex = group.contentIds.indexOf(identifier);
    const clampedIndex = Math.max(
      0,
      Math.min(targetMemberIndex, group.contentIds.length - 1),
    );
    if (sourceIndex === clampedIndex) return false;
    group.contentIds.splice(sourceIndex, 1);
    group.contentIds.splice(clampedIndex, 0, identifier);
    group.ratios = group.contentIds.map(() => 1 / group.contentIds.length);
    if (space.activeGroupId === group.identifier) this.loadActiveSpace();
    this.options.persistWorkspaceState?.();
    return true;
  }

  /** Reorder a full-width or split group as one list unit. */
  moveGroup(groupIdentifier: string, targetGroupIndex: number): boolean {
    const space = this.activeSpace;
    if (!space) return false;
    const groups = this.groups(space);
    const sourceIndex = groups.findIndex(
      (group) => group.identifier === groupIdentifier,
    );
    const clampedIndex = Math.max(
      0,
      Math.min(targetGroupIndex, groups.length - 1),
    );
    if (sourceIndex < 0 || sourceIndex === clampedIndex) return false;
    const [group] = groups.splice(sourceIndex, 1);
    if (!group) return false;
    groups.splice(clampedIndex, 0, group);
    this.options.persistWorkspaceState?.();
    return true;
  }

  /** Close one outer content container and every owned pane session inside it. */
  closeSpace(identifier: string): void {
    const space = this.spaces.value.find(
      (candidate) => candidate.identifier === identifier,
    );
    if (!space) return;
    const ownedIdentifiers = space.contentIds.filter(
      (contentIdentifier) => !this.sharedContents.has(contentIdentifier),
    );
    for (const contentIdentifier of ownedIdentifiers) {
      this.removeContent(contentIdentifier);
    }
    const nextSpaces = this.spaces.value.filter(
      (candidate) => candidate.identifier !== identifier,
    );
    this.spaces.value = nextSpaces;
    if (this.activeSpaceId.value === identifier) {
      this.activeSpaceId.value = nextSpaces[0]?.identifier ?? null;
      this.loadActiveSpace();
    }
    if (nextSpaces.length === 0) this.hide();
    this.options.persistWorkspaceState?.();
  }
  /** Make one registered content the visible single-pane occupant WITHOUT taking the keyboard —
   *  the reveal a default-visibility policy performs. `showContent` stays the user's own gesture
   *  and focuses; this one never steals the keys from the surface the user is driving. No-op for
   *  an unknown id. */
  revealContent(id: string): void {
    if (!this.contents.has(id)) return;
    this.retargetFocus(() => {
      this.layout.value = [];
      this.activeId.value = id;
      this.focusedIndex.value = 0;
    });
    this.visible.value = true;
    this.commitActiveSpace();
  }
  /** Move registered content one row in the user order and immediately reflow any live split. */
  moveContent(id: string, direction: -1 | 1): void {
    const registeredIdentifiers = this.orderedContents.map(
      (content) => content.id,
    );
    const sourceIndex = registeredIdentifiers.indexOf(id);
    const targetIndex = sourceIndex + direction;
    if (
      sourceIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= registeredIdentifiers.length
    )
      return;
    this.moveContentTo(id, targetIndex);
  }

  /** Backward-compatible bottom-panel name for its keyboard reorder action. */
  moveOpenContent(id: string, direction: -1 | 1): void {
    this.moveContent(id, direction);
  }

  /** Place registered content at an exact visible-row index in the persisted user order. */
  moveContentTo(id: string, targetIndex: number): void {
    const registeredContents = this.orderedContents;
    const sourceIndex = registeredContents.findIndex(
      (content) => content.id === id,
    );
    const clampedTargetIndex = Math.max(
      0,
      Math.min(targetIndex, registeredContents.length - 1),
    );
    if (sourceIndex < 0 || sourceIndex === clampedTargetIndex) return;
    const targetIdentifier = registeredContents[clampedTargetIndex]?.id;
    if (!targetIdentifier) return;
    const openCells = this.resolvedCells;
    const nextOrder = [...this.order.value];
    const sourceOrderIndex = nextOrder.indexOf(id);
    const targetOrderIndex = nextOrder.indexOf(targetIdentifier);
    if (sourceOrderIndex < 0 || targetOrderIndex < 0) return;
    nextOrder.splice(sourceOrderIndex, 1);
    nextOrder.splice(targetOrderIndex, 0, id);
    const focusedIdentifier = this.focusedContent?.id ?? this.activeId.value;
    const ratiosByIdentifier = new Map(
      openCells.map((cell) => [cell.content.id, cell.ratio]),
    );
    this.retargetFocus(() => {
      this.setOrder(nextOrder);
      this.layout.value = nextOrder
        .filter((identifier) => ratiosByIdentifier.has(identifier))
        .map((identifier) => ({
          id: identifier,
          ratio: ratiosByIdentifier.get(identifier) ?? 0,
        }));
      this.focusedIndex.value = Math.max(
        0,
        this.layout.value.findIndex((cell) => cell.id === focusedIdentifier),
      );
      this.activeId.value = focusedIdentifier;
    });
    this.options.persistContentOrder?.();
    this.commitActiveSpace();
  }

  /** Backward-compatible drag name used by the bottom-panel contents list. */
  moveOpenContentTo(id: string, targetIndex: number): void {
    this.moveContentTo(id, targetIndex);
  }
  /** Close affordance shared by the dock-list mouse row and keyboard command. */
  closeOpenContent(id: string): void {
    this.removeContent(id);
  }

  /** Move one registered content instance to another host without disposing it. Visibility and
   *  keyboard ownership follow a live pane, while a hidden pane stays hidden. */
  // invariant: A contributed dock side moves one live pane (src/modules/ui/ui.invariants.md)
  moveContentToHost(id: string, targetHost: PanelHost.Instance): boolean {
    if (targetHost.has(id)) return false;
    const contentWasVisible = this.isContentVisible(id);
    const sourceHadOtherVisibleContent = this.resolvedCells.some(
      (cell) => cell.content.id !== id,
    );
    const contentOwnedFocus =
      this.focused.value && this.focusedContent?.id === id;
    const targetWasVisible = targetHost.visible.value;
    const content = this.detachContent(id);
    if (!content) return false;
    if (contentWasVisible && !sourceHadOtherVisibleContent) this.hide();
    targetHost.register(content);
    if (contentWasVisible) {
      targetHost.revealContent(id);
      if (contentOwnedFocus) targetHost.focus();
    } else if (!targetWasVisible && targetHost.visible.value) {
      targetHost.hide();
    }
    return true;
  }

  /** Close one owned session: remove it from visibility and the contents list, release its resources,
   *  and select a surviving open instance when it was the final visible cell. */
  removeContent(id: string): void {
    const content = this.detachContent(id);
    if (!content) return;
    content.dispose();
    this.options.onContentRemoved?.(content);
  }

  /** Withdraw one registration while preserving the content instance for a host-to-host move. */
  protected detachContent(id: string): PaneContent | null {
    const content = this.contents.get(id);
    if (!content) return null;
    const remainingVisibleIdentifiers = this.resolvedCells
      .map((cell) => cell.content.id)
      .filter((identifier) => identifier !== id);
    const remainingOrder = this.options.retainUnregisteredContentOrder
      ? this.order.value
      : this.order.value.filter((identifier) => identifier !== id);
    this.retargetFocus(() => {
      this.contents.delete(id);
      this.setOrder(remainingOrder);
      const remainingVisibleCells = remainingVisibleIdentifiers
        .map((identifier) => this.contents.get(identifier))
        .filter(
          (candidate): candidate is PaneContent => candidate !== undefined,
        );
      if (remainingVisibleCells.length === 0) {
        const fallback = this.orderedContents[0] ?? null;
        this.layout.value = [];
        this.activeId.value = fallback?.id ?? null;
        this.focusedIndex.value = 0;
      } else if (remainingVisibleCells.length === 1) {
        this.layout.value = [];
        this.activeId.value = remainingVisibleCells[0]?.id ?? null;
        this.focusedIndex.value = 0;
      } else {
        const ratio = 1 / remainingVisibleCells.length;
        this.layout.value = remainingVisibleCells.map((remainingContent) => ({
          id: remainingContent.id,
          ratio,
        }));
        this.focusedIndex.value = Math.min(
          this.focusedIndex.value,
          remainingVisibleCells.length - 1,
        );
        this.activeId.value =
          remainingVisibleCells[this.focusedIndex.value]?.id ??
          remainingVisibleCells[0]?.id ??
          null;
      }
    });
    if (this.contents.size === 0) {
      this.visible.value = false;
      this.focused.value = false;
      this.expanded.value = false;
    }
    if (!this.options.retainUnregisteredContentOrder) {
      this.options.persistContentOrder?.();
    }
    const nextSpaces = this.spaces.value
      .map((space) => ({
        ...space,
        contentIds: space.contentIds.filter((identifier) => identifier !== id),
        layout: space.layout.filter((cell) => cell.id !== id),
        groups: space.groups
          ?.map((group) => ({
            ...group,
            contentIds: group.contentIds.filter(
              (identifier) => identifier !== id,
            ),
            ratios: group.contentIds
              .filter((identifier) => identifier !== id)
              .map(() => 1),
          }))
          .filter((group) => group.contentIds.length > 0),
        activeId: space.activeId === id ? null : space.activeId,
      }))
      .filter((space) => space.contentIds.length > 0);
    this.spaces.value = nextSpaces;
    if (
      !nextSpaces.some((space) => space.identifier === this.activeSpaceId.value)
    ) {
      this.activeSpaceId.value = nextSpaces[0]?.identifier ?? null;
      this.loadActiveSpace();
    } else {
      this.commitActiveSpace();
    }
    this.options.persistWorkspaceState?.();
    return content;
  }
  /** Collapse any split back to the single active content. */
  unsplit(): void {
    if (this.layout.value.length === 0) return;
    const space = this.activeSpace;
    const group = space ? this.activeGroup(space) : null;
    const focusedIdentifier = this.focusedContent?.id ?? this.activeId.value;
    if (space && group && group.contentIds.length > 1) {
      const groups = this.groups(space);
      const groupIndex = groups.indexOf(group);
      const singleGroups = group.contentIds.map((identifier) => ({
        identifier: this.nextGroupIdentifier(space),
        contentIds: [identifier],
        ratios: [1],
      }));
      groups.splice(groupIndex, 1, ...singleGroups);
      space.activeGroupId =
        singleGroups.find((candidate) =>
          candidate.contentIds.includes(focusedIdentifier ?? ''),
        )?.identifier ??
        singleGroups[0]?.identifier ??
        null;
    }
    this.retargetFocus(() => {
      this.layout.value = [];
      this.focusedIndex.value = 0;
    });
    this.commitActiveSpace();
    this.options.persistWorkspaceState?.();
  }
  /** Give the keyboard to the visible cell at `index` (click-to-focus). Clamped to the visible range. */
  focusCell(index: number): void {
    const count = this.resolvedCells.length;
    if (count === 0) return;
    const clamped = Math.max(0, Math.min(index, count - 1));
    const focusedIdentifier = this.resolvedCells[clamped]?.content.id ?? null;
    if (
      clamped === this.focusedIndex.value &&
      focusedIdentifier === this.activeId.value
    ) {
      return;
    }
    this.retargetFocus(() => {
      this.focusedIndex.value = clamped;
      this.activeId.value = focusedIdentifier;
    });
    this.commitActiveSpace();
  }
  /** Toggle one registered content's visible region. Opening a second content places both side by
   *  side in panel order and focuses the newly opened region. Closing one split region leaves
   *  the other mounted; closing the only region hides the slot. This is the one action shared by each
   *  content's status-bar button and keyboard accelerator. */
  toggleContent(id: string): void {
    if (!this.contents.has(id)) return;
    if (!this.visible.value) {
      this.retargetFocus(() => {
        this.layout.value = [];
        this.activeId.value = id;
        this.focusedIndex.value = 0;
      });
      this.show();
      this.commitActiveSpace();
      return;
    }
    const visibleCells = this.resolvedCells;
    const visibleIndex = visibleCells.findIndex(
      (cell) => cell.content.id === id,
    );
    if (visibleIndex < 0) {
      const visibleIdentifiers = new Set(
        visibleCells.map((cell) => cell.content.id),
      );
      visibleIdentifiers.add(id);
      const orderedIdentifiers = this.order.value.filter((identifier) =>
        visibleIdentifiers.has(identifier),
      );
      this.retargetFocus(() => {
        this.layout.value = orderedIdentifiers.map((identifier) => ({
          id: identifier,
          ratio: 1 / orderedIdentifiers.length,
        }));
        this.focusedIndex.value = orderedIdentifiers.indexOf(id);
        this.activeId.value = id;
      });
      this.focus();
      this.commitActiveSpace();
      return;
    }
    if (visibleCells.length === 1) {
      this.hide();
      return;
    }
    const focusedIdentifier = this.focusedContent?.id ?? this.activeId.value;
    const remainingCells = visibleCells.filter(
      (cell) => cell.content.id !== id,
    );
    const remainingTotal =
      remainingCells.reduce((sum, cell) => sum + cell.ratio, 0) || 1;
    const preferredIdentifier =
      focusedIdentifier !== id
        ? focusedIdentifier
        : (remainingCells[Math.min(visibleIndex, remainingCells.length - 1)]
            ?.content.id ??
          remainingCells[0]?.content.id ??
          null);
    this.retargetFocus(() => {
      this.activeId.value = preferredIdentifier;
      if (remainingCells.length === 1) {
        this.layout.value = [];
        this.focusedIndex.value = 0;
        return;
      }
      this.layout.value = remainingCells.map((cell) => ({
        id: cell.content.id,
        ratio: cell.ratio / remainingTotal,
      }));
      this.focusedIndex.value = Math.max(
        0,
        remainingCells.findIndex(
          (cell) => cell.content.id === preferredIdentifier,
        ),
      );
    });
    this.commitActiveSpace();
  }
  /** Move the divider between cell `dividerIndex` and the next one to `boundaryFraction` (a [0,1] share
   *  of the WHOLE slot, measured from the left edge — exactly what a ratio-mode SplitterModel reports).
   *  Only the two cells adjacent to that divider re-flow; every other cell keeps its share. Each of the
   *  two keeps at least MINIMUM_CELL_RATIO so neither collapses. */
  moveDivider(dividerIndex: number, boundaryFraction: number): void {
    const cells = this.layout.value;
    if (dividerIndex < 0 || dividerIndex >= cells.length - 1) return;
    const total =
      cells.reduce((sum, cell) => sum + Math.max(0, cell.ratio), 0) || 1;
    const normalized = cells.map((cell) => Math.max(0, cell.ratio) / total);
    let before = 0;
    for (let index = 0; index < dividerIndex; index += 1)
      before += normalized[index] ?? 0;
    let after = 0;
    for (let index = dividerIndex + 2; index < normalized.length; index += 1)
      after += normalized[index] ?? 0;
    const pairShare = Math.max(0, 1 - before - after);
    const minimum = Math.min(this.minimumCellRatio, pairShare / 2);
    const leftOfPair = Math.max(
      minimum,
      Math.min(pairShare - minimum, boundaryFraction - before),
    );
    const next = normalized.slice();
    next[dividerIndex] = leftOfPair;
    next[dividerIndex + 1] = pairShare - leftOfPair;
    this.layout.value = cells.map((cell, index) => ({
      id: cell.id,
      ratio: next[index] ?? 0,
    }));
    this.commitActiveSpace();
  }
  /** Distribute `totalColumns` across the visible cells by ratio, reserving one column per interior
   *  divider. Integer columns; the last cell absorbs the rounding remainder; every cell keeps at least
   *  one column. This is the SINGLE width algorithm — both the render (cell widths) and the resize
   *  (onResize) read it, so the laid-out cell can never disagree with what its content was sized for. */
  cellSpans(totalColumns: number): PanelCellSpan[] {
    const cells = this.resolvedCells;
    if (cells.length === 0) return [];
    const dividers = cells.length - 1;
    const inner = Math.max(cells.length, Math.floor(totalColumns) - dividers);
    let used = 0;
    return cells.map((cell, index) => {
      const remainingCells = cells.length - 1 - index;
      const columns =
        index === cells.length - 1
          ? Math.max(1, inner - used)
          : Math.max(
              1,
              Math.min(
                Math.round(inner * cell.ratio),
                inner - used - remainingCells,
              ),
            );
      used += columns;
      return { content: cell.content, columns, ratio: cell.ratio };
    });
  }
  /** Show the slot AND focus it (VS Code: toggling the panel on focuses it). */
  show(): void {
    this.visible.value = true;
    this.focus();
  }
  /** Hide the slot AND release focus. */
  hide(): void {
    this.visible.value = false;
    this.expanded.value = false;
    this.blur();
  }
  /** Show+focus when hidden, hide+blur when visible. */
  toggle(): void {
    if (this.visible.value) this.hide();
    else this.show();
  }
  toggleExpanded(): void {
    if (!this.visible.value) return;
    this.expanded.value = !this.expanded.value;
  }
  focus(): void {
    this.options.focusSet?.claim(this);
    if (this.focused.value) return;
    this.focused.value = true;
    this.focusedContent?.onFocus();
  }
  blur(): void {
    if (!this.focused.value) return;
    this.focused.value = false;
    this.focusedContent?.onBlur();
  }
  /** Route a focused keystroke to the FOCUSED cell's content; true if consumed. */
  handleKey(key: KeyEvent): boolean {
    return this.focusedContent?.handleKey(key) ?? false;
  }
  /** Route a bulk-text paste to the focused pane content, mirroring handleKey. Returns false when the
   *  focused content has no paste sink (the caller consumes it regardless — a focused panel owns paste). */
  handlePaste(text: string): boolean {
    return this.focusedContent?.handlePaste?.(text) ?? false;
  }
  /** Converge the slot's region size onto every visible cell — each content sees only its sub-region. */
  setViewportSize(columns: number, rows: number): void {
    for (const span of this.cellSpans(columns))
      span.content.onResize(span.columns, rows);
  }
  dispose(): void {
    this.unregisterFromFocusSet();
    for (const contentSet of this.contentSets) {
      for (const content of contentSet.contents.values()) {
        if (this.sharedContents.has(content.id)) continue;
        content.dispose();
        this.options.onContentRemoved?.(content);
      }
      contentSet.contents.clear();
    }
    this.contentSets.clear();
    for (const content of this.sharedContents.values()) {
      content.dispose();
      this.options.onContentRemoved?.(content);
    }
    this.sharedContents.clear();
    if (!this.options.contentOrder) this.setOrder([]);
    this.activeId.value = null;
    this.layout.value = [];
    this.focusedIndex.value = 0;
    this.expanded.value = false;
    this.spaces.value = [];
    this.activeSpaceId.value = null;
    this.panelListExpanded.value = false;
  }
}

export namespace PanelHost {
  export const $Class = Static($PanelHost);
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

/** One cell of the split layout: which registered content occupies it and its share of the width. */
export interface PanelCell {
  readonly id: string;
  readonly ratio: number;
}

/** A resolved cell — the content plus its (normalized) share — ready to lay out. */
export interface ResolvedPanelCell {
  readonly content: PaneContent;
  readonly ratio: number;
}

/** A cell's converged pixel-region: which content, how many columns, and its share. */
export interface PanelCellSpan {
  readonly content: PaneContent;
  readonly columns: number;
  readonly ratio: number;
}

export interface PanelHostOptions {
  focusSet?: PanelHostFocusSet.Model;
  showWhenContentRegistered?: boolean;
  contentOrder?: Ref<string[]>;
  persistContentOrder?: () => void;
  retainUnregisteredContentOrder?: boolean;
  onContentRemoved?: (content: PaneContent) => void;
  persistWorkspaceState?: () => void;
}

/** One independently retained pane world. The stable host copies this state on selection. */
export interface PanelContentSet {
  readonly contents: Map<string, PaneContent>;
  order: string[];
  visible: boolean;
  focused: boolean;
  expanded: boolean;
  activeId: string | null;
  layout: PanelCell[];
  focusedIndex: number;
  spaces: PanelSpace[];
  activeSpaceId: string | null;
  panelListExpanded: boolean;
  panelListWidth: number;
}

export interface PanelSpace {
  readonly identifier: string;
  readonly label: string;
  readonly kind: string;
  contentIds: string[];
  activeId: string | null;
  layout: PanelCell[];
  focusedIndex: number;
  groups?: PanelGroup[];
  activeGroupId?: string | null;
}

export interface PanelGroup {
  readonly identifier: string;
  contentIds: string[];
  ratios: number[];
}
