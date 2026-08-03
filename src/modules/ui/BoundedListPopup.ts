import { Static } from 'ivue/extras';
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
import { TextCoordinates } from '../text/TextCoordinates';
import { TextInputModel, type TextInputAction } from '../text/TextInputModel';
import type { Settings } from '../settings/Settings';
import type { Theme } from '../theme/Theme';
import { ModalOverlayDismissal } from './ModalOverlayDismissal';
import type { ScrollPhysics } from './ScrollPhysics';
import { ScrollableTextViewport } from './ScrollableTextViewport';
import { TextFieldPainter } from './TextFieldPainter';

// invariant: Bounded list popups share paint and hit geometry (src/modules/ui/ui.invariants.md)
// invariant: A scrollable pane height is an input not an output (src/modules/ui/ui.invariants.md)
// invariant: Overlay keyboard actions have visible mouse paths (src/modules/ui/ui.invariants.md)
// invariant: Appearance comes only from theme data (src/modules/theme/theme.invariants.md)
// invariant: Seams are drawn at the shared generator (project.invariants.md)
// invariant: Bounded list interactions live in one popup (src/modules/ui/ui.invariants.md)
// invariant: List interactions inspect only visible rows (src/modules/ui/ui.invariants.md)
// invariant: Held key movement accelerates within a ceiling (project.invariants.md)
// invariant: Popup hierarchy is mouse and keyboard reachable (src/modules/ui/ui.invariants.md)
// invariant: One painter draws every single-line text field (src/modules/ui/ui.invariants.md)
// invariant: Live static reads follow the receiving class (project.invariants.md)
class $BoundedListPopup {
  protected static get DEFAULT_SEARCH_THRESHOLD(): number {
    return 10;
  }

  protected static get MINIMUM_BOX_WIDTH(): number {
    return 18;
  }

  protected static get HORIZONTAL_FRAME_COLUMNS(): number {
    return 2;
  }

  protected static get VERTICAL_FRAME_ROWS(): number {
    return 2;
  }

  protected static get RESERVED_BOTTOM_ROWS(): number {
    return 1;
  }

  protected readonly box: BoxRenderable;
  protected readonly searchInput: TextRenderable;
  protected readonly list: TextRenderable;
  protected readonly viewport: ScrollableTextViewport.Instance;
  protected readonly dismissal: ModalOverlayDismissal.Model;
  protected readonly queryInput: TextInputModel.Model;
  protected currentGeometry: BoundedListPopupGeometry | null = null;
  protected selectionHandler: ((item: BoundedListPopupItem) => void) | null =
    null;
  protected navigationBackwardHandler: (() => void) | null = null;
  protected searchThresholdValue = $BoundedListPopup.DEFAULT_SEARCH_THRESHOLD;
  protected minimumWidthValue = (this.constructor as typeof $BoundedListPopup)
    .MINIMUM_BOX_WIDTH;
  protected titleValue = '';
  protected anchorValue: BoundedListPopupAnchor = { column: 0, row: 0 };
  protected pointerPressedFilteredIndex = -1;
  protected pointerDragged = false;
  protected ownerIdentifierValue: string | null = null;
  protected searchHovered = false;
  protected searchVisibleValue = true;
  protected backdropVisibleValue = true;
  protected itemsAlreadyFilteredValue = false;
  protected capturesKeyboardValue = true;
  protected availableBottomExclusiveValue: number | undefined = undefined;
  protected filteredMatchesValue: readonly BoundedListPopupMatch[] = [];
  protected enabledNavigationValue: BoundedListPopupEnabledNavigation = {
    enabledFilteredIndices: [],
    enabledPositionByFilteredIndex: new Int32Array(0),
  };
  protected readonly maximumItemWidthByItems = new WeakMap<
    readonly BoundedListPopupItem[],
    number
  >();
  protected maximumItemWidthValue = 1;
  protected iconColumnsValue = 0;
  protected queryCaretCellValue: BoundedListPopupCaretCell | null = null;

  get open() {
    return ref(false);
  }
  get items() {
    return shallowRef<readonly BoundedListPopupItem[]>([]);
  }
  get query() {
    return this.queryInput.text;
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

  get capturesKeyboard(): boolean {
    return this.open.value && this.capturesKeyboardValue;
  }

  get filteredMatches(): readonly BoundedListPopupMatch[] {
    return this.filteredMatchesValue;
  }

  get geometry(): BoundedListPopupGeometry | null {
    return this.currentGeometry;
  }

  get title(): string {
    return this.titleValue;
  }

  /** The painted caret cell of the search field, in screen coordinates — the published geometry a
   *  driven contract addresses instead of hunting for a caret glyph. */
  get queryCaretCell(): BoundedListPopupCaretCell | null {
    return this.queryCaretCellValue;
  }

  /** The query model's grapheme caret offset. */
  get queryCaret(): number {
    return this.queryInput.caret.value;
  }

  constructor(protected readonly dependencies: BoundedListPopupDependencies) {
    this.queryInput = this.createQueryInput();
    const { renderer } = dependencies;
    const identifier = dependencies.identifier ?? 'bounded-list-popup';
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
        contentColumns: this.maximumItemWidthValue,
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
    this.dismissal = new ModalOverlayDismissal.Class({
      renderer,
      identifier,
      backdropZIndex: 125,
      closeButtonZIndex: 131,
      dismiss: () => this.close(),
    });
    renderer.root.add(this.box);
    this.wirePointerInput();
  }

  // A pinned navigation row (the hierarchical `..` parent entry) is BROWSING chrome that happens to
  // live in the list, so it is never scored: while the query is empty it holds the first rows in
  // source order, and the moment the user types they are searching this folder, not walking out of
  // it, so it disappears instead of competing for a fuzzy rank.
  // invariant: Popup hierarchy is mouse and keyboard reachable (src/modules/ui/ui.invariants.md)
  static filterItems(
    items: readonly BoundedListPopupItem[],
    query: string,
  ): readonly BoundedListPopupMatch[] {
    const queryIsEmpty = query.length === 0;
    const pinnedMatches: BoundedListPopupMatch[] = [];
    const matches: BoundedListPopupMatch[] = [];
    items.forEach((item, sourceIndex) => {
      if (item.pinnedWhileQueryEmpty === true) {
        if (queryIsEmpty) pinnedMatches.push({ item, sourceIndex, score: 0 });
        return;
      }
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
    return [...pinnedMatches, ...matches];
  }

  static layoutGeometry(
    input: BoundedListPopupGeometryInput,
  ): BoundedListPopupGeometry {
    const screenWidth = Math.max(1, Math.floor(input.screenWidth));
    const screenHeight = Math.max(1, Math.floor(input.screenHeight));
    const chromeRows = input.searchVisible ? 1 : 0;
    const naturalListRows = Math.max(1, input.itemCount);
    const naturalHeight =
      this.VERTICAL_FRAME_ROWS + chromeRows + naturalListRows;
    const safeBottomExclusive = Math.max(
      1,
      Math.min(
        screenHeight - this.RESERVED_BOTTOM_ROWS,
        input.availableBottomExclusive ?? screenHeight,
      ),
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
      this.MINIMUM_BOX_WIDTH,
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
      boxHeight - this.VERTICAL_FRAME_ROWS - chromeRows,
    );
    const verticalOverflow = input.itemCount > listRows;
    const interiorColumns = Math.max(
      1,
      boxWidth - this.HORIZONTAL_FRAME_COLUMNS,
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
    const chromeRow = chromeRows > 0 ? boxTop + 1 : null;
    return {
      boxLeft,
      boxTop,
      boxWidth,
      boxHeight,
      bottomRow: boxTop + boxHeight - 1,
      opensUpward,
      searchRow: input.searchVisible ? chromeRow : null,
      listLeft: boxLeft + 1,
      listTop: boxTop + 1 + chromeRows,
      listColumns,
      listIconColumns: Math.max(0, Math.floor(input.iconColumns)),
      listRows,
      firstVisible,
      visibleItemCount: Math.max(
        0,
        Math.min(listRows, input.itemCount - firstVisible),
      ),
      verticalOverflow,
    };
  }

  static desiredBoxWidth(
    maximumItemWidth: number,
    title: string,
    minimumWidth = this.MINIMUM_BOX_WIDTH,
  ): number {
    return Math.max(
      minimumWidth,
      TextCoordinates.Class.lineWidth(title) + 4,
      maximumItemWidth + this.HORIZONTAL_FRAME_COLUMNS,
    );
  }

  openAt(
    items: readonly BoundedListPopupItem[],
    anchor: BoundedListPopupAnchor,
    selectionHandler: (item: BoundedListPopupItem) => void,
    options: BoundedListPopupOpenOptions = {},
  ): void {
    if (items.length === 0) return;
    this.replaceItemSet(items);
    this.anchorValue = anchor;
    this.selectionHandler = selectionHandler;
    this.ownerIdentifierValue = options.ownerIdentifier ?? null;
    this.searchThresholdValue =
      options.searchThreshold ?? $BoundedListPopup.DEFAULT_SEARCH_THRESHOLD;
    this.searchVisibleValue = options.searchVisible ?? true;
    this.backdropVisibleValue = options.showBackdrop ?? true;
    this.itemsAlreadyFilteredValue = options.itemsAlreadyFiltered ?? false;
    this.capturesKeyboardValue = options.capturesKeyboard ?? true;
    this.availableBottomExclusiveValue = options.availableBottomExclusive;
    this.minimumWidthValue =
      options.minimumWidth ??
      (this.constructor as typeof $BoundedListPopup).MINIMUM_BOX_WIDTH;
    this.titleValue = options.title ?? '';
    this.navigationBackwardHandler = options.navigateBackwardHandler ?? null;
    this.queryInput.clear();
    this.recomputeMatches();
    this.hoveredIndex.value = -1;
    this.searchHovered = false;
    this.viewport.reset();
    const selectedItemIdentifier =
      options.selectedItemIdentifier ??
      items.find((item) => item.selected)?.identifier;
    const initialSelectedIndex =
      selectedItemIdentifier === undefined
        ? -1
        : this.filteredMatches.findIndex(
            (match) =>
              match.item.enabled !== false &&
              match.item.identifier === selectedItemIdentifier,
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
    this.ownerIdentifierValue = null;
    this.items.value = [];
    this.filteredMatchesValue = [];
    this.enabledNavigationValue = {
      enabledFilteredIndices: [],
      enabledPositionByFilteredIndex: new Int32Array(0),
    };
    this.maximumItemWidthValue = 1;
    this.iconColumnsValue = 0;
    this.queryInput.clear();
    this.selectedIndex.value = -1;
    this.hoveredIndex.value = -1;
    this.searchHovered = false;
    this.selectionHandler = null;
    this.navigationBackwardHandler = null;
    this.currentGeometry = null;
    this.queryCaretCellValue = null;
    this.pointerPressedFilteredIndex = -1;
    this.pointerDragged = false;
    this.viewport.reset();
    this.viewport.hideBars();
    this.dismissal.hide();
    this.box.visible = false;
    this.searchInput.visible = false;
    this.list.visible = false;
    this.requestPaint();
  }

  closeIfOwned(ownerIdentifier: string): void {
    if (this.ownerIdentifierValue === ownerIdentifier) this.close();
  }

  appendQuery(text: string): void {
    if (!this.searchEnabled || text.length === 0) return;
    if (this.queryInput.insert(text)) this.refilter();
  }

  setQuery(query: string): void {
    if (query === this.query.value) return;
    this.queryInput.setValue(query);
    this.refilter();
  }

  replaceItems(
    items: readonly BoundedListPopupItem[],
    selectedItemIdentifier?: string,
    options: BoundedListPopupReplaceOptions = {},
  ): void {
    if (options.resetQuery) this.queryInput.clear();
    if (options.title !== undefined) this.titleValue = options.title;
    this.replaceItemSet(items);
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
    if (this.queryInput.backspace()) this.refilter();
  }

  /**
   * Apply one shared text-input action to the search query. A movement changes no filtered set, so
   * it only requests the repaint the moved caret needs; an edit refilters. Without this the popup
   * had the model's word movement and word deletion and dropped them at the input boundary.
   * invariant: Editable text fields share one input model (project.invariants.md)
   */
  applyInputAction(action: TextInputAction): void {
    if (!this.searchEnabled) return;
    const originalQuery = this.queryInput.value;
    const actionChangedState = this.queryInput.apply(action);
    if (this.queryInput.value !== originalQuery) this.refilter();
    else if (actionChangedState) this.requestPaint();
  }

  applyQueryInputAction(action: TextInputAction): void {
    this.applyInputAction(action);
  }

  copyInputSelection(): Promise<number> {
    if (!this.searchEnabled) return Promise.resolve(0);
    return this.queryInput.copySelection();
  }

  moveSelection(direction: 1 | -1): void {
    const movementSteps = this.dependencies.scrollPhysics.keyAccelerationFor(
      direction === 1 ? 'list:down' : 'list:up',
    );
    const filteredIndex = $BoundedListPopup.nextEnabledFilteredIndex(
      this.enabledNavigationValue,
      this.selectedIndex.value,
      direction,
      movementSteps,
    );
    if (filteredIndex < 0) return;
    this.selectedIndex.value = filteredIndex;
    this.revealSelectedIndex();
    this.requestPaint();
  }

  runSelected(): void {
    this.runFilteredIndex(this.selectedIndex.value);
  }

  drillSelected(): void {
    const selectedItem = this.filteredMatches[this.selectedIndex.value]?.item;
    if (selectedItem?.drillable === true) this.runSelected();
  }

  navigateBackward(): void {
    this.navigationBackwardHandler?.();
  }

  tick(deltaTimeSeconds: number): boolean {
    return this.open.value && this.viewport.tick(deltaTimeSeconds);
  }

  update(): void {
    if (!this.open.value) {
      this.dismissal.hide();
      this.box.visible = false;
      this.viewport.hideBars();
      return;
    }
    const matches = this.filteredMatches;
    const scrollbarThickness = Math.max(
      1,
      Math.round(this.dependencies.settings.scrollbarThickness.value),
    );
    const desiredBoxWidth = (
      this.constructor as typeof $BoundedListPopup
    ).desiredBoxWidth(
      this.maximumItemWidthValue,
      this.titleValue,
      this.minimumWidthValue,
    );
    this.currentGeometry = (
      this.constructor as typeof $BoundedListPopup
    ).layoutGeometry({
      screenWidth: this.dependencies.renderer.width,
      screenHeight: this.dependencies.renderer.height,
      anchor: this.anchorValue,
      desiredBoxWidth,
      itemCount: matches.length,
      searchVisible: this.searchEnabled,
      iconColumns: this.iconColumnsValue,
      scrollbarThickness,
      firstVisible: this.viewport.scrollTop,
      availableBottomExclusive: this.availableBottomExclusiveValue,
    });
    const geometry = this.currentGeometry;
    const palette = this.dependencies.theme.palette;
    this.box.visible = true;
    this.box.left = geometry.boxLeft;
    this.box.top = geometry.boxTop;
    this.box.width = geometry.boxWidth;
    this.box.height = geometry.boxHeight;
    this.box.title = this.titleValue;
    this.box.backgroundColor = palette.panel;
    this.box.borderColor = palette.borderActive;
    this.box.titleColor = palette.accent;
    if (this.backdropVisibleValue) {
      this.dismissal.show({
        left: geometry.boxLeft,
        top: geometry.boxTop,
        width: geometry.boxWidth,
        glyph: this.dependencies.theme.glyph('panelClose'),
        backgroundColor: palette.panel,
        foregroundColor: palette.accent,
      });
    } else {
      this.dismissal.hide();
    }
    this.searchInput.visible = this.searchEnabled;
    this.searchInput.width =
      geometry.boxWidth -
      (this.constructor as typeof $BoundedListPopup).HORIZONTAL_FRAME_COLUMNS;
    if (this.searchEnabled) {
      // The search row is a single-line text field like every other: its window, caret, and state
      // tone come from the one painter, so it cannot drift into its own two-state highlight or lose
      // the caret the query model already knows about.
      // invariant: One painter draws every single-line text field (src/modules/ui/ui.invariants.md)
      const queryFocused = this.acceptsQueryInput;
      const paintedField = TextFieldPainter.Class.paint({
        prefix: ` ${this.dependencies.theme.findIcons.search} `,
        input: this.queryInput,
        tone: TextFieldPainter.Class.toneFor(
          palette,
          TextFieldPainter.Class.stateFor({
            focused: queryFocused,
            hovered: this.searchHovered,
          }),
        ),
        selectionTone: TextFieldPainter.Class.selectionToneFor(palette),
        surfaceBackground: palette.panel,
        caretVisible: queryFocused,
        width:
          geometry.boxWidth -
          (this.constructor as typeof $BoundedListPopup)
            .HORIZONTAL_FRAME_COLUMNS,
      });
      this.searchInput.content = new StyledText(paintedField.chunks);
      this.queryCaretCellValue = {
        column: geometry.listLeft + paintedField.caretColumn,
        row: geometry.searchRow ?? geometry.boxTop + 1,
        width: paintedField.caretWidth,
      };
    } else {
      this.queryCaretCellValue = null;
    }
    this.list.visible = true;
    this.list.height = geometry.listRows;
    this.list.width =
      geometry.boxWidth -
      (this.constructor as typeof $BoundedListPopup).HORIZONTAL_FRAME_COLUMNS;
    const visibleMatches = matches.slice(
      geometry.firstVisible,
      geometry.firstVisible + geometry.listRows,
    );
    const chunks: TextChunk[] = [];
    if (visibleMatches.length === 0) {
      chunks.push(
        fg(palette.dim)(
          TextCoordinates.Class.padToDisplayWidth(
            TextCoordinates.Class.displayColumnWindow(
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
        const label = TextCoordinates.Class.padToDisplayWidth(
          TextCoordinates.Class.displayColumnWindow(
            (this.constructor as typeof $BoundedListPopup).itemRowText(
              match.item,
              geometry.listIconColumns,
            ),
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
      width:
        geometry.boxWidth -
        (this.constructor as typeof $BoundedListPopup).HORIZONTAL_FRAME_COLUMNS,
      height: geometry.listRows,
    });
  }

  dispose(): void {
    this.close();
    try {
      this.box.destroyRecursively();
      this.dismissal.dispose();
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

  protected createQueryInput(): TextInputModel.Model {
    return new TextInputModel.Class();
  }

  static enabledNavigation(
    matches: readonly BoundedListPopupMatch[],
  ): BoundedListPopupEnabledNavigation {
    const enabledFilteredIndices: number[] = [];
    const enabledPositionByFilteredIndex = new Int32Array(matches.length);
    enabledPositionByFilteredIndex.fill(-1);
    for (
      let filteredIndex = 0;
      filteredIndex < matches.length;
      filteredIndex++
    ) {
      if (matches[filteredIndex]?.item.enabled === false) continue;
      enabledPositionByFilteredIndex[filteredIndex] =
        enabledFilteredIndices.length;
      enabledFilteredIndices.push(filteredIndex);
    }
    return { enabledFilteredIndices, enabledPositionByFilteredIndex };
  }

  static nextEnabledFilteredIndex(
    navigation: BoundedListPopupEnabledNavigation,
    selectedIndex: number,
    direction: 1 | -1,
    movementSteps = 1,
  ): number {
    const enabledItemCount = navigation.enabledFilteredIndices.length;
    if (enabledItemCount === 0) return -1;
    const selectedEnabledPosition =
      navigation.enabledPositionByFilteredIndex[selectedIndex] ?? -1;
    const navigationOrigin =
      selectedEnabledPosition >= 0
        ? selectedEnabledPosition
        : direction === 1
          ? -1
          : 0;
    const wrappedEnabledPosition =
      (((navigationOrigin + direction * movementSteps) % enabledItemCount) +
        enabledItemCount) %
      enabledItemCount;
    return navigation.enabledFilteredIndices[wrappedEnabledPosition] ?? -1;
  }

  // One row-text generator for paint, exact box width, and the label column
  // every row shares. The icon column is derived once from the widest supplied
  // mark, so every row keeps the same label column even when a contributed item
  // does not use the theme's one-cell vocabulary.
  // invariant: Bounded list popups share paint and hit geometry (src/modules/ui/ui.invariants.md)
  static itemRowText(item: BoundedListPopupItem, iconColumns: number): string {
    if (iconColumns <= 0) return ` ${item.label}`;
    const iconCell = TextCoordinates.Class.padToDisplayWidth(
      item.icon ?? '',
      iconColumns,
    );
    return ` ${iconCell} ${item.label}`;
  }

  static itemSetIconColumns(items: readonly BoundedListPopupItem[]): number {
    let iconColumns = 0;
    for (const item of items) {
      iconColumns = Math.max(
        iconColumns,
        TextCoordinates.Class.lineWidth(item.icon ?? ''),
      );
    }
    return iconColumns;
  }

  static itemSetMaximumWidth(items: readonly BoundedListPopupItem[]): number {
    const iconColumns = this.itemSetIconColumns(items);
    let maximumWidth = 1;
    for (const item of items) {
      maximumWidth = Math.max(
        maximumWidth,
        TextCoordinates.Class.lineWidth(this.itemRowText(item, iconColumns)),
      );
    }
    return maximumWidth;
  }

  protected maximumItemWidth(items: readonly BoundedListPopupItem[]): number {
    const cachedMaximumWidth = this.maximumItemWidthByItems.get(items);
    if (cachedMaximumWidth !== undefined) return cachedMaximumWidth;
    const maximumWidth = (
      this.constructor as typeof $BoundedListPopup
    ).itemSetMaximumWidth(items);
    this.maximumItemWidthByItems.set(items, maximumWidth);
    return maximumWidth;
  }

  protected requestPaint(): void {
    this.paintRevision.value += 1;
    this.dependencies.renderer.requestRender();
  }

  // A pinned navigation row is reachable by Up, Down, and the pointer, but it is never where
  // selection COMES TO REST — landing on `..` by default would make Enter walk out of the folder the
  // user just opened.
  protected firstEnabledFilteredIndex(): number {
    const firstBrowsableIndex = this.filteredMatches.findIndex(
      (match) =>
        match.item.enabled !== false &&
        match.item.pinnedWhileQueryEmpty !== true,
    );
    if (firstBrowsableIndex >= 0) return firstBrowsableIndex;
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
    this.filteredMatchesValue = this.itemsAlreadyFilteredValue
      ? this.items.value.map((item, sourceIndex) => ({
          item,
          sourceIndex,
          score: 0,
        }))
      : $BoundedListPopup.filterItems(this.items.value, this.query.value);
    this.enabledNavigationValue = $BoundedListPopup.enabledNavigation(
      this.filteredMatchesValue,
    );
  }

  protected replaceItemSet(items: readonly BoundedListPopupItem[]): void {
    this.items.value = items;
    this.maximumItemWidthValue = this.maximumItemWidth(items);
    this.iconColumnsValue = (
      this.constructor as typeof $BoundedListPopup
    ).itemSetIconColumns(items);
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
    // Keep-open activation is popup behavior, so every hierarchical consumer gets the
    // same keyboard, pointer, filtering, and dismissal semantics from this shared seam.
    // invariant: Bounded list interactions live in one popup (src/modules/ui/ui.invariants.md)
    if (selectedItem.keepOpenOnSelect !== true) this.close();
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
    const handleWheel = (event: MouseEvent): void =>
      this.viewport.handleWheel(event);
    this.box.onMouseScroll = handleWheel;
    this.searchInput.onMouseScroll = handleWheel;
    this.list.onMouseScroll = handleWheel;
    this.searchInput.onMouseMove = () => {
      if (!this.searchEnabled || this.searchHovered) return;
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
  export const $Class = Static($BoundedListPopup);
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

export interface BoundedListPopupDependencies {
  renderer: CliRenderer;
  settings: Settings.Instance;
  theme: Theme.Instance;
  scrollPhysics: ScrollPhysics.Model;
  identifier?: string;
}

export interface BoundedListPopupItem {
  readonly identifier: string;
  readonly label: string;
  readonly icon?: string;
  readonly searchText?: string;
  readonly enabled?: boolean;
  readonly selected?: boolean;
  readonly drillable?: boolean;
  readonly keepOpenOnSelect?: boolean;
  readonly pinnedWhileQueryEmpty?: boolean;
}

export interface BoundedListPopupAnchor {
  column: number;
  row: number;
}

export interface BoundedListPopupOpenOptions {
  ownerIdentifier?: string;
  title?: string;
  searchThreshold?: number;
  minimumWidth?: number;
  selectedItemIdentifier?: string;
  searchVisible?: boolean;
  showBackdrop?: boolean;
  itemsAlreadyFiltered?: boolean;
  capturesKeyboard?: boolean;
  availableBottomExclusive?: number;
  navigateBackwardHandler?: () => void;
}

export interface BoundedListPopupReplaceOptions {
  resetQuery?: boolean;
  title?: string;
}

export interface BoundedListPopupMatch {
  item: BoundedListPopupItem;
  sourceIndex: number;
  score: number;
}

export interface BoundedListPopupEnabledNavigation {
  enabledFilteredIndices: readonly number[];
  enabledPositionByFilteredIndex: Int32Array;
}

export interface BoundedListPopupGeometryInput {
  screenWidth: number;
  screenHeight: number;
  anchor: BoundedListPopupAnchor;
  desiredBoxWidth: number;
  itemCount: number;
  searchVisible: boolean;
  iconColumns: number;
  scrollbarThickness: number;
  firstVisible: number;
  availableBottomExclusive?: number;
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
  listIconColumns: number;
  listRows: number;
  firstVisible: number;
  visibleItemCount: number;
  verticalOverflow: boolean;
}

/** The search field's painted caret cell in screen coordinates (width 2 over a wide glyph). */
export interface BoundedListPopupCaretCell {
  column: number;
  row: number;
  width: number;
}
