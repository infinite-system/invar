// A pane SLOT: a generic host for a switchable AND splittable set of PaneContents. It owns
// only WHICH contents are visible, how the visible ones share the width, which one has the keyboard,
// and whether the slot is visible/focused — never the contents' internals. Registering another
// PaneContent (Output, Problems, a plugin) needs zero host changes, and two-or-more contents can
// occupy independently headed regions side by side (terminal | agent) behind a resizable divider.
// One visible cell is the degenerate case, so the same region model drives single and split layouts.
//
// The host holds NO renderable and NO OpenTUI dependency: RootView mounts the slot, pulls each visible
// cell's `content.render(sub-region)` into its own laid-out column, routes focused keys through
// handleKey to the FOCUSED cell, and converges each cell's sub-region through setViewportSize — so the
// host stays a pure model, unit-testable with plain values.
//
// invariant: The panel renders exactly the visible pane content cells each frame (src/modules/terminal/terminal.invariants.md)
// invariant: A focused panel routes keystrokes to its active pane content (src/modules/terminal/terminal.invariants.md)
// invariant: A split panel renders every visible cell into its own sub-region (src/modules/terminal/terminal.invariants.md)
// invariant: A focused split panel routes keystrokes to the focused cell (src/modules/terminal/terminal.invariants.md)
// invariant: Split arrangement follows panel content order (src/modules/layout/layout.invariants.md)
import { Reactive } from 'ivue';
import { ref, shallowRef, type Ref } from 'vue';
import type { KeyEvent } from '@opentui/core';
import type { PaneContent } from './PaneContent.interface';
class $PanelHost {
  protected get PanelHost() {
    return PanelHost.Class as unknown as typeof $PanelHost;
  }
  protected static get minimumCellRatio() {
    return 0.12;
  }
  protected get minimumCellRatio() {
    return this.PanelHost.minimumCellRatio;
  }
  constructor(readonly options: PanelHostOptions = {}) {}
  /** The registry, keyed by content id. Non-reactive — `order`/`layout` drive what shows. */
  protected readonly contents = new Map<string, PaneContent>();
  /** Whether the slot is shown at all (VS Code: the bottom panel is toggled). */
  get visible() {
    return ref(false);
  }
  /** Whether the slot owns the keyboard. */
  get focused() {
    return ref(false);
  }
  /** The active content's id, or null when nothing is registered. This is the SINGLE-pane switcher's
   *  selection; it is the degenerate layout used whenever no split is set. */
  get activeId() {
    return ref<string | null>(null);
  }
  /** Registered content ids in registration order — the switcher's tab order (reactive so a late
   *  registration repaints the switcher). */
  get order() {
    return this.options.contentOrder ?? shallowRef<string[]>([]);
  }
  /** The split layout: the visible cells left-to-right with their width shares. EMPTY means "no split"
   *  — the slot shows the single active content (the degenerate, backward-compatible case). */
  get layout() {
    return shallowRef<PanelCell[]>([]);
  }
  /** Index into the resolved visible cells that currently owns the keyboard (0 in the degenerate case). */
  get focusedIndex() {
    return ref(0);
  }
  /** True when two or more cells share the slot. */
  get isSplit(): boolean {
    return this.resolvedCells.length > 1;
  }
  /** The docked contents list is useful only when there is a choice to make. */
  get panelListVisible(): boolean {
    return this.visible.value && this.resolvedCells.length > 1;
  }
  /** Register a content. The first one registered becomes active. Idempotent per id. */
  register(content: PaneContent): void {
    if (this.contents.has(content.id)) return;
    this.contents.set(content.id, content);
    if (!this.order.value.includes(content.id)) {
      this.order.value = [...this.order.value, content.id];
      this.options.persistContentOrder?.();
    }
    if (this.activeId.value === null) this.activeId.value = content.id;
    // Registration may land asynchronously (for example, a plugin becoming ready). Reveal the
    // dock-style host without stealing keyboard focus from the pane the user is actively driving.
    if (this.options.showWhenContentRegistered) this.visible.value = true;
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
    const ids = this.order.value;
    if (ids.length < 2) return;
    const current = Math.max(0, ids.indexOf(this.activeId.value ?? ''));
    const next = (current + delta + ids.length) % ids.length;
    const nextId = ids[next];
    if (nextId) this.activate(nextId);
  }
  /** Put the given registered contents side by side in the slot, left to right. Unknown ids are
   *  dropped; an empty/all-unknown list clears the split (back to single-pane). Optional ratios set the
   *  initial shares (defaults to equal). */
  split(ids: string[], ratios?: number[]): void {
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
    });
  }
  /** Focus/activate an open content selected from the docked contents list. */
  activateOpenContent(id: string): void {
    const visibleIndex = this.resolvedCells.findIndex(
      (cell) => cell.content.id === id,
    );
    if (visibleIndex < 0) return;
    this.focus();
    this.focusCell(visibleIndex);
  }
  /** Move an open content one row in the user order and immediately reflow the live split. */
  moveOpenContent(id: string, direction: -1 | 1): void {
    const openIdentifiers = this.resolvedCells.map((cell) => cell.content.id);
    const sourceOpenIndex = openIdentifiers.indexOf(id);
    const targetOpenIndex = sourceOpenIndex + direction;
    if (
      sourceOpenIndex < 0 ||
      targetOpenIndex < 0 ||
      targetOpenIndex >= openIdentifiers.length
    )
      return;
    this.moveOpenContentTo(id, targetOpenIndex);
  }
  /** Drag counterpart to moveOpenContent: place an open content at an exact open-row index. */
  moveOpenContentTo(id: string, targetOpenIndex: number): void {
    const openCells = this.resolvedCells;
    const sourceOpenIndex = openCells.findIndex(
      (cell) => cell.content.id === id,
    );
    const clampedTargetIndex = Math.max(
      0,
      Math.min(targetOpenIndex, openCells.length - 1),
    );
    if (sourceOpenIndex < 0 || sourceOpenIndex === clampedTargetIndex) return;
    const targetIdentifier = openCells[clampedTargetIndex]?.content.id;
    if (!targetIdentifier) return;
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
      this.order.value = nextOrder;
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
  }
  /** Close affordance shared by the dock-list mouse row and keyboard command. */
  closeOpenContent(id: string): void {
    if (this.isContentVisible(id)) this.toggleContent(id);
  }
  /** Collapse any split back to the single active content. */
  unsplit(): void {
    if (this.layout.value.length === 0) return;
    this.retargetFocus(() => {
      this.layout.value = [];
      this.focusedIndex.value = 0;
    });
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
  }
  /** Toggle one registered content's visible region. Opening a second content places both side by
   *  side in panel order and focuses the newly opened region. Closing one split region leaves
   *  the other mounted; closing the only region hides the slot. This is the one action shared by each
   *  content's status-bar button and keyboard accelerator. */
  // invariant: Visible panel contents own separate headed regions (src/modules/ui/ui.invariants.md)
  toggleContent(id: string): void {
    if (!this.contents.has(id)) return;
    if (!this.visible.value) {
      this.retargetFocus(() => {
        this.layout.value = [];
        this.activeId.value = id;
        this.focusedIndex.value = 0;
      });
      this.show();
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
    this.blur();
  }
  /** Show+focus when hidden, hide+blur when visible. */
  toggle(): void {
    if (this.visible.value) this.hide();
    else this.show();
  }
  focus(): void {
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
    for (const content of this.contents.values()) content.dispose();
    this.contents.clear();
    if (!this.options.contentOrder) this.order.value = [];
    this.activeId.value = null;
    this.layout.value = [];
    this.focusedIndex.value = 0;
  }
}
export namespace PanelHost {
  export const $Class = $PanelHost;
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
  showWhenContentRegistered?: boolean;
  contentOrder?: Ref<string[]>;
  persistContentOrder?: () => void;
}
