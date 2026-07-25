import {
  BoxRenderable,
  StyledText,
  TextRenderable,
  bg,
  fg,
  type CliRenderer,
  type MouseEvent,
  type TextChunk,
} from '@opentui/core';
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import { CommandScoring } from '../commands/CommandScoring';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import type { Settings } from '../settings/Settings';
import type { Theme } from '../theme/Theme';
import { ScrollableTextViewport } from './ScrollableTextViewport';

// invariant: Bounded list popups share paint and hit geometry (src/modules/ui/ui.invariants.md)
// invariant: A scrollable pane height is an input not an output (src/modules/ui/ui.invariants.md)
// invariant: Appearance comes only from theme data (src/modules/theme/theme.invariants.md)
// invariant: Seams are drawn at the shared generator (project.invariants.md)
class $BoundedListPopup {
  protected static get defaultSearchThreshold(): number {
    return 10;
  }

  protected static get minimumBoxWidth(): number {
    return 18;
  }

  protected static get horizontalFrameColumns(): number {
    return 2;
  }

  protected static get verticalFrameRows(): number {
    return 2;
  }

  protected static get reservedBottomRows(): number {
    return 1;
  }

  protected readonly backdrop: BoxRenderable;
  protected readonly box: BoxRenderable;
  protected readonly searchInput: TextRenderable;
  protected readonly list: TextRenderable;
  protected readonly viewport: ScrollableTextViewport.Instance;
  protected currentGeometry: BoundedListPopupGeometry | null = null;
  protected selectionHandler: ((item: BoundedListPopupItem) => void) | null =
    null;
  protected searchThresholdValue = $BoundedListPopup.defaultSearchThreshold;
  protected minimumWidthValue = $BoundedListPopup.minimumBoxWidth;
  protected titleValue = '';
  protected anchorValue: BoundedListPopupAnchor = { column: 0, row: 0 };
  protected pointerPressedFilteredIndex = -1;
  protected pointerDragged = false;
  protected searchHovered = false;
  protected searchVisibleValue = true;
  protected backdropVisibleValue = true;
  protected filteredMatchesValue: readonly BoundedListPopupMatch[] = [];
  protected maximumItemWidthValue = 1;

  get open() {
    return ref(false);
  }
  get items() {
    return shallowRef<readonly BoundedListPopupItem[]>([]);
  }
  get query() {
    return ref('');
  }
  get selectedIndex() {
    return ref(-1);
  }
  get hoveredIndex() {
    return ref(-1);
  }
  get paintRevision() {
    return ref(0);
  }

  get searchEnabled(): boolean {
    return (
      this.searchVisibleValue &&
      this.items.value.length > this.searchThresholdValue
    );
  }

  get acceptsQueryInput(): boolean {
    return this.open.value && this.searchEnabled;
  }

  get filteredMatches(): readonly BoundedListPopupMatch[] {
    return this.filteredMatchesValue;
  }

  get geometry(): BoundedListPopupGeometry | null {
    return this.currentGeometry;
  }

  constructor(protected readonly dependencies: BoundedListPopupDependencies) {
    const { renderer } = dependencies;
    const identifier = dependencies.identifier ?? 'bounded-list-popup';
    this.backdrop = new BoxRenderable(renderer, {
      id: `${identifier}-backdrop`,
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      visible: false,
      zIndex: 125,
    });
    this.box = new BoxRenderable(renderer, {
      id: identifier,
      position: 'absolute',
      border: true,
      borderStyle: 'rounded',
      flexDirection: 'column',
      visible: false,
      zIndex: 130,
    });
    this.searchInput = new TextRenderable(renderer, {
      id: `${identifier}-search`,
      content: '',
      height: 1,
      selectable: false,
    });
    this.list = new TextRenderable(renderer, {
      id: `${identifier}-list`,
      content: '',
      selectable: false,
    });
    this.box.add(this.searchInput);
    this.box.add(this.list);
    this.viewport = new ScrollableTextViewport.Class({
      renderer,
      settings: dependencies.settings,
      parent: this.box,
      id: identifier,
      disableHorizontal: true,
      scrollbarZIndex: 1,
      extent: () => ({
        contentRows: this.filteredMatches.length,
        contentColumns: this.maximumItemWidth(this.filteredMatches),
        viewportRows: Math.max(1, this.currentGeometry?.listRows ?? 1),
        viewportColumns: Math.max(1, this.currentGeometry?.listColumns ?? 1),
      }),
      colors: () => ({
        track: dependencies.theme.palette.panel,
        thumb: dependencies.theme.palette.dim,
      }),
      onScroll: () => this.requestPaint(),
      selection: {
        positionAtCell: (screenColumn, screenRow) =>
          this.selectionPositionAtCell(screenColumn, screenRow),
        viewportRectangle: () => ({
          leftColumn: this.currentGeometry?.listLeft ?? 0,
          rightColumn:
            (this.currentGeometry?.listLeft ?? 0) +
            Math.max(1, this.currentGeometry?.listColumns ?? 1) -
            1,
          topRow: this.currentGeometry?.listTop ?? 0,
          bottomRow:
            (this.currentGeometry?.listTop ?? 0) +
            Math.max(1, this.currentGeometry?.listRows ?? 1) -
            1,
        }),
        begin: (position) => this.selectFilteredIndex(position.line),
        extend: (position) => this.selectFilteredIndex(position.line),
        finish: () => this.requestPaint(),
      },
    });
    renderer.root.add(this.backdrop);
    renderer.root.add(this.box);
    this.wirePointerInput();
  }

  static filterItems(
    items: readonly BoundedListPopupItem[],
    query: string,
  ): readonly BoundedListPopupMatch[] {
    const matches: BoundedListPopupMatch[] = [];
    items.forEach((item, sourceIndex) => {
      const score = CommandScoring.Class.fuzzyScore(
        query,
        item.searchText ?? item.label,
      );
      if (score >= 0) matches.push({ item, sourceIndex, score });
    });
    matches.sort(
      (firstMatch, secondMatch) =>
        firstMatch.score - secondMatch.score ||
        firstMatch.sourceIndex - secondMatch.sourceIndex,
    );
    return matches;
  }

  static layoutGeometry(
    input: BoundedListPopupGeometryInput,
  ): BoundedListPopupGeometry {
    const screenWidth = Math.max(1, Math.floor(input.screenWidth));
    const screenHeight = Math.max(1, Math.floor(input.screenHeight));
    const searchRows = input.searchVisible ? 1 : 0;
    const naturalListRows = Math.max(1, input.itemCount);
    const naturalHeight =
      $BoundedListPopup.verticalFrameRows + searchRows + naturalListRows;
    const safeBottomExclusive = Math.max(
      1,
      screenHeight - $BoundedListPopup.reservedBottomRows,
    );
    const downwardTop = Math.max(0, Math.floor(input.anchor.row) + 1);
    const downwardCapacity = Math.max(0, safeBottomExclusive - downwardTop);
    const upwardCapacity = Math.max(
      0,
      Math.min(Math.floor(input.anchor.row), safeBottomExclusive),
    );
    const opensUpward =
      naturalHeight > downwardCapacity && upwardCapacity > downwardCapacity;
    const availableHeight = opensUpward ? upwardCapacity : downwardCapacity;
    const boxHeight = Math.min(naturalHeight, Math.max(1, availableHeight));
    const unclampedTop = opensUpward
      ? Math.floor(input.anchor.row) - boxHeight
      : downwardTop;
    const boxTop = Math.max(
      0,
      Math.min(unclampedTop, Math.max(0, safeBottomExclusive - boxHeight)),
    );
    const requestedWidth = Math.max(
      $BoundedListPopup.minimumBoxWidth,
      Math.floor(input.desiredBoxWidth),
    );
    const boxWidth = Math.max(1, Math.min(requestedWidth, screenWidth));
    const boxLeft = Math.max(
      0,
      Math.min(
        Math.floor(input.anchor.column),
        Math.max(0, screenWidth - boxWidth),
      ),
    );
    const listRows = Math.max(
      0,
      boxHeight - $BoundedListPopup.verticalFrameRows - searchRows,
    );
    const verticalOverflow = input.itemCount > listRows;
    const interiorColumns = Math.max(
      1,
      boxWidth - $BoundedListPopup.horizontalFrameColumns,
    );
    const listColumns = Math.max(
      1,
      interiorColumns -
        (verticalOverflow ? Math.max(1, input.scrollbarThickness) : 0),
    );
    const maximumFirstVisible = Math.max(
      0,
      input.itemCount - Math.max(1, listRows),
    );
    const firstVisible = Math.max(
      0,
      Math.min(Math.floor(input.firstVisible), maximumFirstVisible),
    );
    return {
      boxLeft,
      boxTop,
      boxWidth,
      boxHeight,
      bottomRow: boxTop + boxHeight - 1,
      opensUpward,
      searchRow: input.searchVisible ? boxTop + 1 : null,
      listLeft: boxLeft + 1,
      listTop: boxTop + 1 + searchRows,
      listColumns,
      listRows,
      firstVisible,
      visibleItemCount: Math.max(
        0,
        Math.min(listRows, input.itemCount - firstVisible),
      ),
      verticalOverflow,
    };
  }

  openAt(
    items: readonly BoundedListPopupItem[],
    anchor: BoundedListPopupAnchor,
    selectionHandler: (item: BoundedListPopupItem) => void,
    options: BoundedListPopupOpenOptions = {},
  ): void {
    if (items.length === 0) return;
    this.items.value = items;
    this.anchorValue = anchor;
    this.selectionHandler = selectionHandler;
    this.searchThresholdValue =
      options.searchThreshold ?? $BoundedListPopup.defaultSearchThreshold;
    this.searchVisibleValue = options.searchVisible ?? true;
    this.backdropVisibleValue = options.showBackdrop ?? true;
    this.minimumWidthValue =
      options.minimumWidth ?? $BoundedListPopup.minimumBoxWidth;
    this.titleValue = options.title ?? '';
    this.query.value = '';
    this.recomputeMatches();
    this.hoveredIndex.value = -1;
    this.searchHovered = false;
    this.viewport.reset();
    const selectedItemIdentifier =
      options.selectedItemIdentifier ??
      items.find((item) => item.selected)?.identifier;
    const initialSelectedIndex = this.filteredMatches.findIndex(
      (match) =>
        match.item.enabled !== false &&
        (selectedItemIdentifier === undefined ||
          match.item.identifier === selectedItemIdentifier),
    );
    this.selectedIndex.value =
      initialSelectedIndex >= 0
        ? initialSelectedIndex
        : this.firstEnabledFilteredIndex();
    if (this.selectedIndex.value > 0) {
      this.viewport.scrollRowsBy(this.selectedIndex.value);
    }
    this.open.value = true;
    this.requestPaint();
  }

  close(): void {
    this.open.value = false;
    this.items.value = [];
    this.filteredMatchesValue = [];
    this.query.value = '';
    this.selectedIndex.value = -1;
    this.hoveredIndex.value = -1;
    this.searchHovered = false;
    this.selectionHandler = null;
    this.currentGeometry = null;
    this.pointerPressedFilteredIndex = -1;
    this.pointerDragged = false;
    this.viewport.reset();
    this.viewport.hideBars();
    this.backdrop.visible = false;
    this.box.visible = false;
    this.searchInput.visible = false;
    this.list.visible = false;
    this.dependencies.renderer.requestRender();
  }

  appendQuery(text: string): void {
    if (!this.searchEnabled || text.length === 0) return;
    this.query.value += text;
    this.refilter();
  }

  setQuery(query: string): void {
    this.query.value = query;
    this.refilter();
  }

  replaceItems(
    items: readonly BoundedListPopupItem[],
    selectedItemIdentifier?: string,
  ): void {
    this.items.value = items;
    this.recomputeMatches();
    this.viewport.reset();
    this.hoveredIndex.value = -1;
    const selectedIndex = selectedItemIdentifier
      ? this.filteredMatches.findIndex(
          (match) =>
            match.item.enabled !== false &&
            match.item.identifier === selectedItemIdentifier,
        )
      : -1;
    this.selectedIndex.value =
      selectedIndex >= 0 ? selectedIndex : this.firstEnabledFilteredIndex();
    this.requestPaint();
  }

  eraseQueryCharacter(): void {
    if (!this.searchEnabled || this.query.value.length === 0) return;
    this.query.value = this.query.value.slice(0, -1);
    this.refilter();
  }

  moveSelection(direction: 1 | -1): void {
    const matches = this.filteredMatches;
    const filteredIndex = $BoundedListPopup.nextEnabledFilteredIndex(
      matches,
      this.selectedIndex.value,
      direction,
    );
    if (filteredIndex < 0) return;
    this.selectedIndex.value = filteredIndex;
    this.revealSelectedIndex();
    this.requestPaint();
  }

  runSelected(): void {
    this.runFilteredIndex(this.selectedIndex.value);
  }

  tick(deltaTimeSeconds: number): boolean {
    return this.open.value && this.viewport.tick(deltaTimeSeconds);
  }

  update(): void {
    if (!this.open.value) {
      this.backdrop.visible = false;
      this.box.visible = false;
      this.viewport.hideBars();
      return;
    }
    const matches = this.filteredMatches;
    const scrollbarThickness = Math.max(
      1,
      Math.round(this.dependencies.settings.scrollbarThickness.value),
    );
    const desiredBoxWidth = Math.max(
      this.minimumWidthValue,
      EditorCoordinates.Class.lineWidth(this.titleValue) + 4,
      this.maximumItemWidthValue + $BoundedListPopup.horizontalFrameColumns,
    );
    this.currentGeometry = $BoundedListPopup.layoutGeometry({
      screenWidth: this.dependencies.renderer.width,
      screenHeight: this.dependencies.renderer.height,
      anchor: this.anchorValue,
      desiredBoxWidth,
      itemCount: matches.length,
      searchVisible: this.searchEnabled,
      scrollbarThickness,
      firstVisible: this.viewport.scrollTop,
    });
    const geometry = this.currentGeometry;
    const palette = this.dependencies.theme.palette;
    this.backdrop.visible = this.backdropVisibleValue;
    this.box.visible = true;
    this.box.left = geometry.boxLeft;
    this.box.top = geometry.boxTop;
    this.box.width = geometry.boxWidth;
    this.box.height = geometry.boxHeight;
    this.box.title = this.titleValue;
    this.box.backgroundColor = palette.panel;
    this.box.borderColor = palette.borderActive;
    this.box.titleColor = palette.accent;
    this.searchInput.visible = this.searchEnabled;
    this.searchInput.width =
      geometry.boxWidth - $BoundedListPopup.horizontalFrameColumns;
    if (this.searchEnabled) {
      const searchText = ` ${this.dependencies.theme.findIcons.search} ${this.query.value}`;
      const searchBackground = this.searchHovered
        ? palette.accent
        : palette.border;
      const searchForeground = this.searchHovered ? palette.panel : palette.dim;
      this.searchInput.content = new StyledText([
        bg(searchBackground)(
          fg(searchForeground)(
            EditorCoordinates.Class.padToDisplayWidth(
              EditorCoordinates.Class.displayColumnWindow(
                searchText,
                0,
                geometry.boxWidth - $BoundedListPopup.horizontalFrameColumns,
              ),
              geometry.boxWidth - $BoundedListPopup.horizontalFrameColumns,
            ),
          ),
        ),
      ]);
    }
    this.list.visible = true;
    this.list.height = geometry.listRows;
    this.list.width =
      geometry.boxWidth - $BoundedListPopup.horizontalFrameColumns;
    const visibleMatches = matches.slice(
      geometry.firstVisible,
      geometry.firstVisible + geometry.listRows,
    );
    const chunks: TextChunk[] = [];
    if (visibleMatches.length === 0) {
      chunks.push(
        fg(palette.dim)(
          EditorCoordinates.Class.padToDisplayWidth(
            EditorCoordinates.Class.displayColumnWindow(
              ' (no matches)',
              0,
              geometry.listColumns,
            ),
            geometry.listColumns,
          ),
        ),
      );
    } else {
      visibleMatches.forEach((match, visibleRowIndex) => {
        const filteredIndex = geometry.firstVisible + visibleRowIndex;
        const label = EditorCoordinates.Class.padToDisplayWidth(
          EditorCoordinates.Class.displayColumnWindow(
            ` ${match.item.label}`,
            0,
            geometry.listColumns,
          ),
          geometry.listColumns,
        );
        const rowBackground =
          filteredIndex === this.selectedIndex.value
            ? palette.selection
            : filteredIndex === this.hoveredIndex.value
              ? palette.cursorLine
              : null;
        const styledLabel = fg(
          match.item.enabled === false ? palette.dim : palette.fg,
        )(label);
        chunks.push(
          rowBackground ? bg(rowBackground)(styledLabel) : styledLabel,
        );
        if (visibleRowIndex < visibleMatches.length - 1) {
          chunks.push(fg(palette.fg)('\n'));
        }
      });
    }
    this.list.content = new StyledText(chunks);
    this.viewport.updateScrollbars({
      top: this.searchEnabled ? 1 : 0,
      left: 0,
      width: geometry.boxWidth - $BoundedListPopup.horizontalFrameColumns,
      height: geometry.listRows,
    });
  }

  dispose(): void {
    this.close();
    try {
      this.dependencies.renderer.root.remove(this.backdrop);
      this.dependencies.renderer.root.remove(this.box);
      this.backdrop.destroyRecursively();
      this.box.destroyRecursively();
    } catch {
      // Render teardown is best-effort after the app's effects have stopped.
    }
  }

  protected static filterIndexAtRow(
    geometry: BoundedListPopupGeometry,
    screenRow: number,
  ): number {
    const visibleRowIndex = screenRow - geometry.listTop;
    if (visibleRowIndex < 0 || visibleRowIndex >= geometry.visibleItemCount) {
      return -1;
    }
    return geometry.firstVisible + visibleRowIndex;
  }

  static nextEnabledFilteredIndex(
    matches: readonly BoundedListPopupMatch[],
    selectedIndex: number,
    direction: 1 | -1,
  ): number {
    if (matches.length === 0) return -1;
    const navigationOrigin =
      selectedIndex >= 0 ? selectedIndex : direction === 1 ? -1 : 0;
    for (let step = 1; step <= matches.length; step += 1) {
      const filteredIndex =
        (((navigationOrigin + direction * step) % matches.length) +
          matches.length) %
        matches.length;
      if (matches[filteredIndex]?.item.enabled !== false) {
        return filteredIndex;
      }
    }
    return -1;
  }

  protected maximumItemWidth(
    matches: readonly BoundedListPopupMatch[],
  ): number {
    let maximumWidth = 1;
    for (const match of matches) {
      maximumWidth = Math.max(
        maximumWidth,
        EditorCoordinates.Class.lineWidth(` ${match.item.label}`),
      );
    }
    return maximumWidth;
  }

  protected requestPaint(): void {
    this.paintRevision.value += 1;
    this.dependencies.renderer.requestRender();
  }

  protected firstEnabledFilteredIndex(): number {
    return this.filteredMatches.findIndex(
      (match) => match.item.enabled !== false,
    );
  }

  protected refilter(): void {
    this.recomputeMatches();
    this.viewport.reset();
    this.hoveredIndex.value = -1;
    this.selectedIndex.value = this.firstEnabledFilteredIndex();
    this.requestPaint();
  }

  protected recomputeMatches(): void {
    this.filteredMatchesValue = $BoundedListPopup.filterItems(
      this.items.value,
      this.query.value,
    );
    this.maximumItemWidthValue = this.maximumItemWidth(
      this.items.value.map((item, sourceIndex) => ({
        item,
        sourceIndex,
        score: 0,
      })),
    );
  }

  protected revealSelectedIndex(): void {
    const geometry = this.currentGeometry;
    if (!geometry || this.selectedIndex.value < 0) return;
    if (this.selectedIndex.value < geometry.firstVisible) {
      this.viewport.scrollRowsBy(
        this.selectedIndex.value - geometry.firstVisible,
      );
    } else if (
      this.selectedIndex.value >=
      geometry.firstVisible + geometry.listRows
    ) {
      this.viewport.scrollRowsBy(
        this.selectedIndex.value -
          (geometry.firstVisible + geometry.listRows) +
          1,
      );
    }
  }

  protected selectFilteredIndex(filteredIndex: number): void {
    const match = this.filteredMatches[filteredIndex];
    if (!match || match.item.enabled === false) return;
    this.selectedIndex.value = filteredIndex;
    this.requestPaint();
  }

  protected runFilteredIndex(filteredIndex: number): void {
    const match = this.filteredMatches[filteredIndex];
    if (!match || match.item.enabled === false) return;
    const selectionHandler = this.selectionHandler;
    const selectedItem = match.item;
    this.close();
    selectionHandler?.(selectedItem);
  }

  protected selectionPositionAtCell(
    _screenColumn: number,
    screenRow: number,
  ): { line: number; column: number } | null {
    const geometry = this.currentGeometry;
    if (!this.open.value || !geometry) return null;
    const filteredIndex = $BoundedListPopup.filterIndexAtRow(
      geometry,
      screenRow,
    );
    return filteredIndex >= 0 ? { line: filteredIndex, column: 0 } : null;
  }

  protected wirePointerInput(): void {
    this.backdrop.onMouseDown = () => this.close();
    const handleWheel = (event: MouseEvent): void =>
      this.viewport.handleWheel(event);
    this.box.onMouseScroll = handleWheel;
    this.searchInput.onMouseScroll = handleWheel;
    this.list.onMouseScroll = handleWheel;
    this.searchInput.onMouseMove = () => {
      if (this.searchHovered) return;
      this.searchHovered = true;
      this.requestPaint();
    };
    this.searchInput.onMouseOut = () => {
      if (!this.searchHovered) return;
      this.searchHovered = false;
      this.requestPaint();
    };
    this.list.onMouseMove = (event: MouseEvent) => {
      const geometry = this.currentGeometry;
      if (!geometry) return;
      const filteredIndex = $BoundedListPopup.filterIndexAtRow(
        geometry,
        event.y,
      );
      const nextHoveredIndex =
        this.filteredMatches[filteredIndex]?.item.enabled !== false
          ? filteredIndex
          : -1;
      if (nextHoveredIndex !== this.hoveredIndex.value) {
        this.hoveredIndex.value = nextHoveredIndex;
        this.requestPaint();
      }
    };
    this.list.onMouseOut = () => {
      if (this.hoveredIndex.value >= 0) {
        this.hoveredIndex.value = -1;
        this.requestPaint();
      }
    };
    this.list.onMouseDown = (event: MouseEvent) => {
      const geometry = this.currentGeometry;
      if (!geometry) return;
      this.pointerPressedFilteredIndex = $BoundedListPopup.filterIndexAtRow(
        geometry,
        event.y,
      );
      this.pointerDragged = false;
      this.viewport.beginDrag(event.x, event.y);
    };
    this.list.onMouseDrag = (event: MouseEvent) => {
      this.pointerDragged = true;
      this.viewport.dragTo(event.x, event.y);
    };
    this.list.onMouseUp = (event: MouseEvent) => {
      const geometry = this.currentGeometry;
      const releasedFilteredIndex = geometry
        ? $BoundedListPopup.filterIndexAtRow(geometry, event.y)
        : -1;
      this.viewport.endDrag();
      if (
        !this.pointerDragged &&
        releasedFilteredIndex === this.pointerPressedFilteredIndex
      ) {
        this.runFilteredIndex(releasedFilteredIndex);
      }
      this.pointerPressedFilteredIndex = -1;
      this.pointerDragged = false;
    };
    this.list.onMouseDragEnd = () => {
      this.viewport.endDrag();
      this.pointerPressedFilteredIndex = -1;
      this.pointerDragged = false;
    };
  }
}

export namespace BoundedListPopup {
  export const $Class = $BoundedListPopup;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

export interface BoundedListPopupDependencies {
  renderer: CliRenderer;
  settings: Settings.Instance;
  theme: Theme.Instance;
  identifier?: string;
}

export interface BoundedListPopupItem {
  identifier: string;
  label: string;
  searchText?: string;
  enabled?: boolean;
  selected?: boolean;
}

export interface BoundedListPopupAnchor {
  column: number;
  row: number;
}

export interface BoundedListPopupOpenOptions {
  title?: string;
  searchThreshold?: number;
  minimumWidth?: number;
  selectedItemIdentifier?: string;
  searchVisible?: boolean;
  showBackdrop?: boolean;
}

export interface BoundedListPopupMatch {
  item: BoundedListPopupItem;
  sourceIndex: number;
  score: number;
}

export interface BoundedListPopupGeometryInput {
  screenWidth: number;
  screenHeight: number;
  anchor: BoundedListPopupAnchor;
  desiredBoxWidth: number;
  itemCount: number;
  searchVisible: boolean;
  scrollbarThickness: number;
  firstVisible: number;
}

export interface BoundedListPopupGeometry {
  boxLeft: number;
  boxTop: number;
  boxWidth: number;
  boxHeight: number;
  bottomRow: number;
  opensUpward: boolean;
  searchRow: number | null;
  listLeft: number;
  listTop: number;
  listColumns: number;
  listRows: number;
  firstVisible: number;
  visibleItemCount: number;
  verticalOverflow: boolean;
}
