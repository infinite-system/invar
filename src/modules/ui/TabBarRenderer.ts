// The tab-strip renderers: the workspace/project tab bar (horizontal or vertical) and the buffer
// tab bar, each turning a TabStrip model + the current interaction state into a StyledText plus the
// hit-test SEGMENTS and the reveal bookkeeping. Extracted from RootView's closure so the tab strips
// render with their own contract (smoke-tabs, smoke-workspace-tabs) instead of inside the god-view.
//
// These paint interaction state (hover/pressed) and remember which tab they last auto-revealed, so
// the context carries that state IN and each render returns the fresh segments + revealed index OUT;
// RootView owns the persistent fields and the hit-testers (which read the returned segments). The
// renderer stays a pure Static capability — no closure capture, no state held here.
//
// invariant: Renderables hold no model state (src/modules/ui/ui.invariants.md)
// invariant: Tab bars share paint and hit geometry (src/modules/ui/ui.invariants.md)
import { StyledText, fg, bg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import { TextCoordinates } from '../text/TextCoordinates';
import type { Palette } from '../theme/ThemePalettes';
import type { TabStrip } from './TabStrip';
import { Breadcrumb, type BreadcrumbPathSegment } from './Breadcrumb';

class $TabBarRenderer {
  protected static get WORKSPACE_TAB_MAX_LABEL_WIDTH() {
    return 18;
  }
  protected static ellipsize(text: string, width: number): string {
    if (width <= 0) return '';
    if (TextCoordinates.Class.lineWidth(text) <= width)
      return text.padEnd(width, ' ');
    if (width === 1) return '…';
    return `${text.slice(0, width - 1)}…`;
  }
  protected static appendHorizontalGap(
    chunks: TextChunk[],
    color: string,
    gapWidth: number,
  ): void {
    if (gapWidth > 0) chunks.push(fg(color)(' '.repeat(gapWidth)));
  }
  public static renderWorkspace(
    context: WorkspaceTabBarRenderContext,
  ): WorkspaceTabBarRender {
    const { strip, palette, hover } = context;
    const orientation = strip.orientation.value;
    const workspaceTabs = strip.items;
    const segments: WorkspaceTabBarSegment[] = [];
    const chunks: TextChunk[] = [];
    const activeWorkspaceIndex = strip.activeIndex;
    let revealedIndex = context.lastRevealedIndex;
    if (orientation === 'vertical') {
      const barWidth = 22;
      const barHeight = Math.max(
        4,
        context.barHeightValue || context.rendererHeight - 1,
      );
      const visibleWorkspaceCount = Math.max(1, barHeight - 3);
      const maximumScrollOffset = Math.max(
        0,
        workspaceTabs.length - visibleWorkspaceCount,
      );
      strip.clampScrollOffset(maximumScrollOffset);
      if (activeWorkspaceIndex >= 0 && activeWorkspaceIndex !== revealedIndex) {
        if (
          activeWorkspaceIndex < strip.scrollOffset.value ||
          activeWorkspaceIndex >=
            strip.scrollOffset.value + visibleWorkspaceCount
        ) {
          strip.scrollOffset.value = Math.min(
            activeWorkspaceIndex,
            maximumScrollOffset,
          );
        }
        revealedIndex = activeWorkspaceIndex;
      }
      const startWorkspaceIndex = strip.scrollOffset.value;
      const endWorkspaceIndex = Math.min(
        workspaceTabs.length,
        startWorkspaceIndex + visibleWorkspaceCount,
      );
      let rowIndex = 0;
      for (
        let workspaceIndex = startWorkspaceIndex;
        workspaceIndex < endWorkspaceIndex;
        workspaceIndex += 1
      ) {
        const workspaceTab = workspaceTabs[workspaceIndex]!;
        const hovered = hover?.workspaceIndex === workspaceIndex;
        const closeHovered = hovered && hover?.kind === 'close';
        const rowBackground = workspaceTab.active
          ? palette.selection
          : hovered
            ? palette.cursorLine
            : null;
        const labelWidth = barWidth - 5;
        const label = workspaceTab.label
          .slice(0, labelWidth)
          .padEnd(labelWidth, ' ');
        const closeGlyph = workspaceTabs.length > 1 ? context.closeGlyph : ' ';
        const rowText = ` ${workspaceTab.active ? '●' : ' '} ${label}${closeGlyph} `;
        const styledRow = fg(
          closeHovered
            ? palette.error
            : workspaceTab.active
              ? palette.fg
              : palette.dim,
        )(rowText);
        chunks.push(rowBackground ? bg(rowBackground)(styledRow) : styledRow);
        chunks.push(fg(palette.fg)('\n'));
        segments.push({
          kind: 'tab',
          workspaceIndex,
          primaryStart: rowIndex,
          primaryEnd: rowIndex + 1,
          closeCrossAxisCoordinate: barWidth - 2,
        });
        rowIndex += 1;
      }
      while (rowIndex < visibleWorkspaceCount) {
        chunks.push(fg(palette.fg)(`${' '.repeat(barWidth)}\n`));
        rowIndex += 1;
      }
      const controlRows: Array<{
        kind: 'panBackward' | 'panForward' | 'add';
        label: string;
      }> = [
        { kind: 'panBackward', label: ' ↑ Previous tabs' },
        { kind: 'panForward', label: ' ↓ More tabs' },
        { kind: 'add', label: ' + Add project' },
      ];
      controlRows.forEach((control, controlIndex) => {
        const hovered = hover?.kind === control.kind;
        const enabled =
          control.kind === 'add' ||
          (control.kind === 'panBackward'
            ? strip.scrollOffset.value > 0
            : strip.scrollOffset.value < maximumScrollOffset);
        const text = control.label.padEnd(barWidth, ' ').slice(0, barWidth);
        const styled = fg(enabled ? palette.accent : palette.border)(text);
        chunks.push(hovered ? bg(palette.cursorLine)(styled) : styled);
        if (controlIndex < controlRows.length - 1)
          chunks.push(fg(palette.fg)('\n'));
        segments.push({
          kind: control.kind,
          workspaceIndex: -1,
          primaryStart: visibleWorkspaceCount + controlIndex,
          primaryEnd: visibleWorkspaceCount + controlIndex + 1,
        });
      });
      return { text: new StyledText(chunks), segments, revealedIndex };
    }
    // Horizontal (top) strip: each project tab is TWO rows — row 0 has name + close and row 1 is the
    // worktree/branch detail indented under the name. Segments stay COLUMN spans (both rows of a tab
    // share the same x-span), and close lives on row 0 only (TabBar checks the cross axis).
    const barWidth = Math.max(
      1,
      context.barWidthValue || context.rendererWidth,
    );
    const controlsText = ' ‹  ›  + ';
    const controlsWidth = TextCoordinates.Class.lineWidth(controlsText);
    const availableTabsWidth = Math.max(1, barWidth - controlsWidth);
    const measuredWorkspaceTabs = workspaceTabs.map((workspaceTab) => ({
      workspaceTab,
      width: Math.min(
        availableTabsWidth,
        Math.min(
          this.WORKSPACE_TAB_MAX_LABEL_WIDTH,
          Math.max(
            TextCoordinates.Class.lineWidth(workspaceTab.label),
            TextCoordinates.Class.lineWidth(workspaceTab.detailLabel ?? ''),
          ),
        ) + 6,
      ),
    }));
    const maximumScrollOffset = Math.max(0, measuredWorkspaceTabs.length - 1);
    strip.clampScrollOffset(maximumScrollOffset);
    let startWorkspaceIndex = strip.scrollOffset.value;
    const visibleEndFrom = (startIndex: number): number => {
      let usedWidth = 0;
      let endIndex = startIndex;
      for (
        let workspaceIndex = startIndex;
        workspaceIndex < measuredWorkspaceTabs.length;
        workspaceIndex += 1
      ) {
        const measuredWorkspaceTab = measuredWorkspaceTabs[workspaceIndex]!;
        if (usedWidth + measuredWorkspaceTab.width > availableTabsWidth) break;
        usedWidth += measuredWorkspaceTab.width;
        endIndex = workspaceIndex + 1;
      }
      return Math.max(endIndex, startIndex + 1);
    };
    if (activeWorkspaceIndex >= 0 && activeWorkspaceIndex !== revealedIndex) {
      if (
        activeWorkspaceIndex < startWorkspaceIndex ||
        activeWorkspaceIndex >= visibleEndFrom(startWorkspaceIndex)
      ) {
        strip.scrollOffset.value = activeWorkspaceIndex;
        startWorkspaceIndex = activeWorkspaceIndex;
      }
      revealedIndex = activeWorkspaceIndex;
    }
    let columnIndex = 0;
    const endWorkspaceIndex = visibleEndFrom(startWorkspaceIndex);
    for (
      let workspaceIndex = startWorkspaceIndex;
      workspaceIndex < endWorkspaceIndex;
      workspaceIndex += 1
    ) {
      const measuredWorkspaceTab = measuredWorkspaceTabs[workspaceIndex]!;
      const workspaceTab = measuredWorkspaceTab.workspaceTab;
      const hovered = hover?.workspaceIndex === workspaceIndex;
      const closeHovered = hovered && hover?.kind === 'close';
      const rowBackground = workspaceTab.active
        ? palette.selection
        : hovered
          ? palette.cursorLine
          : null;
      const maximumLabelWidth = Math.max(1, measuredWorkspaceTab.width - 6);
      const label = this.ellipsize(workspaceTab.label, maximumLabelWidth);
      const tabText = ` ${workspaceTab.active ? '●' : ' '} ${label} `;
      const styledTab = fg(workspaceTab.active ? palette.fg : palette.dim)(
        tabText,
      );
      chunks.push(rowBackground ? bg(rowBackground)(styledTab) : styledTab);
      const closePrimaryCoordinate =
        columnIndex + TextCoordinates.Class.lineWidth(tabText);
      const closeGlyph = workspaceTabs.length > 1 ? context.closeGlyph : ' ';
      chunks.push(
        rowBackground
          ? bg(rowBackground)(
              fg(closeHovered ? palette.error : palette.dim)(closeGlyph),
            )
          : fg(closeHovered ? palette.error : palette.dim)(closeGlyph),
      );
      chunks.push(
        rowBackground
          ? bg(rowBackground)(fg(palette.dim)(' '))
          : fg(palette.dim)(' '),
      );
      segments.push({
        kind: 'tab',
        workspaceIndex,
        primaryStart: columnIndex,
        primaryEnd: columnIndex + measuredWorkspaceTab.width,
        closePrimaryCoordinate,
      });
      columnIndex += measuredWorkspaceTab.width;
    }
    const controlsGapWidth = availableTabsWidth - columnIndex;
    this.appendHorizontalGap(chunks, palette.fg, controlsGapWidth);
    columnIndex += controlsGapWidth;
    const controls: Array<{
      kind: 'panBackward' | 'panForward' | 'add';
      text: string;
    }> = [
      { kind: 'panBackward', text: ' ‹ ' },
      { kind: 'panForward', text: ' › ' },
      { kind: 'add', text: ' + ' },
    ];
    controls.forEach((control) => {
      const startColumn = columnIndex;
      const hovered = hover?.kind === control.kind;
      const styled = fg(control.kind === 'add' ? palette.accent : palette.fg)(
        control.text,
      );
      chunks.push(hovered ? bg(palette.cursorLine)(styled) : styled);
      columnIndex += TextCoordinates.Class.lineWidth(control.text);
      segments.push({
        kind: control.kind,
        workspaceIndex: -1,
        primaryStart: startColumn,
        primaryEnd: columnIndex,
      });
    });
    // Second row: the worktree/branch detail under each visible tab, sharing the tab's background so
    // the two rows read as one tab. The controls have no second row — plain background fills it.
    chunks.push(fg(palette.fg)('\n'));
    let detailColumnIndex = 0;
    for (
      let workspaceIndex = startWorkspaceIndex;
      workspaceIndex < endWorkspaceIndex;
      workspaceIndex += 1
    ) {
      const measuredWorkspaceTab = measuredWorkspaceTabs[workspaceIndex]!;
      const workspaceTab = measuredWorkspaceTab.workspaceTab;
      const hovered = hover?.workspaceIndex === workspaceIndex;
      const rowBackground = workspaceTab.active
        ? palette.selection
        : hovered
          ? palette.cursorLine
          : null;
      const maximumDetailWidth = Math.max(1, measuredWorkspaceTab.width - 6);
      const detailLabel = this.ellipsize(
        workspaceTab.detailLabel ?? '',
        maximumDetailWidth,
      );
      const detailText = `   ${detailLabel}   `;
      const styledDetail = fg(workspaceTab.active ? palette.fg : palette.dim)(
        detailText,
      );
      chunks.push(
        rowBackground ? bg(rowBackground)(styledDetail) : styledDetail,
      );
      detailColumnIndex += measuredWorkspaceTab.width;
    }
    const detailGapWidth = barWidth - detailColumnIndex;
    this.appendHorizontalGap(chunks, palette.fg, detailGapWidth);
    detailColumnIndex += detailGapWidth;
    return { text: new StyledText(chunks), segments, revealedIndex };
  }
  public static renderBuffer(
    context: BufferTabBarRenderContext,
  ): BufferTabBarRender {
    const { strip, palette, hover } = context;
    const tabs = strip.items;
    const segments: TabBarSegment[] = [];
    let revealedIndex = context.lastRevealedIndex;
    if (tabs.length === 0)
      return {
        text: new StyledText([fg(palette.dim)('  no open files')]),
        segments,
        revealedIndex,
      };
    const barWidth = Math.max(1, context.barWidth);
    // Each tab lays out as filename + dirty + close; close has a space BEFORE and AFTER so it is never
    // flush against the tab edge, and the padding is identical regardless of label length. The tab shows
    // just the FILENAME; the active file's full path renders in the breadcrumb bar BELOW the strip
    // (renderBreadcrumbBar), VS Code-style — so tabs stay compact (many fit) while the path is always
    // legible for the file you're editing.
    const measured = tabs.map((tab) => {
      const name =
        tab.identifier.split('/').filter(Boolean).pop() ?? tab.identifier;
      const labelWidth = 1 + TextCoordinates.Class.lineWidth(name) + 1 + 1 + 1; // ' ' + name + ' ' + dirtyGlyph + ' '
      return { tab, name, labelWidth, width: labelWidth + 2 }; // + close + trailing pad
    });
    const totalWidth = measured.reduce((sum, entry) => sum + entry.width, 0);
    // Right controls, pinned to the edge: a clickable ` active/total ` COUNT BADGE (always), and when
    // the strip overflows, an ellipsis "more" marker + two padded 3-cell ARROWS. Reserve their width.
    const total = tabs.length;
    const activeIndex = tabs.findIndex((tab) => tab.active);
    const badgeText = ` ${activeIndex + 1}/${total} `;
    const badgeWidth = TextCoordinates.Class.lineWidth(badgeText);
    const arrowCellWidth = 3; // ' « ' / ' » ' — padded so the hit target is easy to click
    const overflow = totalWidth + badgeWidth > barWidth;
    const rightControlsWidth =
      badgeWidth + (overflow ? 1 /* ellipsis */ + arrowCellWidth * 2 : 0);
    const tabsAreaWidth = Math.max(1, barWidth - rightControlsWidth);
    // How many whole tabs fit when rendering forward from a given start index.
    const windowEndFrom = (start: number): number => {
      let used = 0;
      let end = start;
      for (let index = start; index < total; index += 1) {
        const entry = measured[index];
        if (!entry || used + entry.width > tabsAreaWidth) break;
        used += entry.width;
        end = index + 1;
      }
      return Math.max(end, start + 1); // always show at least one tab
    };
    // Largest pan offset that still fills the strip to the last tab (so we never pan past the end).
    let maxScrollOffset = 0;
    if (overflow) {
      let used = 0;
      maxScrollOffset = total;
      for (let index = total - 1; index >= 0; index -= 1) {
        const entry = measured[index];
        if (!entry || used + entry.width > tabsAreaWidth) break;
        used += entry.width;
        maxScrollOffset = index;
      }
    }
    // Clamp the user's pan; then reveal the active tab ONLY when it actually changed (click / cycle) —
    // panning with the arrows leaves the active tab where it is, even if it scrolls out of view.
    strip.clampScrollOffset(maxScrollOffset);
    if (activeIndex >= 0 && activeIndex !== revealedIndex) {
      if (
        activeIndex < strip.scrollOffset.value ||
        activeIndex >= windowEndFrom(strip.scrollOffset.value)
      ) {
        strip.scrollOffset.value = Math.min(activeIndex, maxScrollOffset);
      }
      revealedIndex = activeIndex;
    }
    const startIndex = overflow ? strip.scrollOffset.value : 0;
    const chunks: TextChunk[] = [];
    let column = 0;
    let endIndex = startIndex;
    for (let index = startIndex; index < measured.length; index += 1) {
      const entry = measured[index];
      // A 1-cell gap sets every tab apart — the first off the splitter, the rest off the prior tab's
      // trailing close. NO powerline separator between tabs (close + gap is the divider; an arrow between
      // tabs read as clutter). The gap is in the fit check so a tab never half-renders past the edge.
      const leadWidth = 1;
      if (!entry || column + leadWidth + entry.width > tabsAreaWidth) break;
      chunks.push(fg(palette.fg)(' '));
      column += leadWidth;
      const isActive = entry.tab.active;
      const isTabHover = hover?.kind === 'tab' && hover.index === index;
      const isCloseHover = hover?.kind === 'close' && hover.index === index;
      const rowBackground = isActive
        ? palette.selection
        : isTabHover
          ? palette.cursorLine
          : null;
      // The FIRST buffer tab (index 0) takes a distinct accent tint when idle so it reads as the anchor
      // tab; the active tab always wins with the bright fg.
      const labelColor = isActive
        ? palette.fg
        : index === 0
          ? palette.accent
          : palette.dim;
      const paint = (text: string, color: string) =>
        rowBackground ? bg(rowBackground)(fg(color)(text)) : fg(color)(text);
      const start = column;
      chunks.push(paint(` ${entry.name} `, labelColor));
      chunks.push(
        paint(
          entry.tab.dirty ? '●' : ' ',
          isActive ? palette.warning : palette.accent,
        ),
      );
      chunks.push(paint(' ', labelColor));
      column += entry.labelWidth;
      const closeColumn = column;
      // The close glyph is an INDEPENDENTLY-stated target on EVERY tab (including active): idle →
      // hover (bright error color over the active tab's selection bg) → pressed (inverted).
      const isClosePressed = context.closePressed === index;
      const closeColor = isClosePressed
        ? palette.bg
        : isCloseHover
          ? palette.error
          : labelColor;
      const closeBackground = isClosePressed ? palette.error : rowBackground;
      chunks.push(
        closeBackground
          ? bg(closeBackground)(fg(closeColor)(context.closeGlyph))
          : fg(closeColor)(context.closeGlyph),
      );
      column += 1;
      chunks.push(paint(' ', labelColor)); // trailing pad — close never touches the edge
      column += 1;
      segments.push({ kind: 'tab', index, start, end: column, closeColumn });
      endIndex = index + 1;
    }
    // Fill the gap between the last tab and the right controls.
    const rightControlsGapWidth = tabsAreaWidth - column;
    this.appendHorizontalGap(chunks, palette.fg, rightControlsGapWidth);
    column += rightControlsGapWidth;
    let moreLeft = false;
    let moreRight = false;
    if (overflow) {
      moreLeft = startIndex > 0;
      moreRight = endIndex < total;
      // "More →" cutoff affordance: a bright ellipsis at the edge where tabs continue (so a clean cut
      // never reads as "no more tabs"); dim when there is nothing more that way.
      chunks.push(
        fg(moreRight ? palette.accent : palette.border)(moreRight ? '…' : ' '),
      );
      column += 1;
    }
    if (overflow) {
      // Bigger, easy-to-hit arrows: a bolder glyph in a padded 3-cell hit target. BRIGHT (fg/accent)
      // only when more tabs exist that direction; DIM (border) at the end — so "more exists" reads.
      const paintArrow = (
        which: 'arrowLeft' | 'arrowRight',
        enabled: boolean,
        glyph: string,
      ): void => {
        const pressed = context.arrowPressed === which && enabled;
        const hoverArrow = hover?.kind === which && enabled;
        const color = !enabled
          ? palette.border
          : pressed
            ? palette.accent
            : hoverArrow
              ? palette.accent
              : palette.fg;
        const background = pressed
          ? palette.selection
          : hoverArrow
            ? palette.cursorLine
            : null;
        const paintCell = (text: string) =>
          background ? bg(background)(fg(color)(text)) : fg(color)(text);
        const start = column;
        chunks.push(paintCell(` ${glyph} `)); // 3-cell padded hit target
        column += arrowCellWidth;
        segments.push({ kind: which, start, end: column });
      };
      paintArrow('arrowLeft', moreLeft, '«');
      paintArrow('arrowRight', moreRight, '»');
    }
    // COUNT BADGE ` active/total ` — always shown, pinned right; click opens the all-buffers dropdown.
    const badgeHover = hover?.kind === 'badge';
    const badgeStart = column;
    chunks.push(
      badgeHover
        ? bg(palette.cursorLine)(fg(palette.accent)(badgeText))
        : fg(palette.accent)(badgeText),
    );
    column += badgeWidth;
    segments.push({ kind: 'badge', start: badgeStart, end: column });
    return { text: new StyledText(chunks), segments, revealedIndex };
  }
  public static renderBreadcrumb(
    context: BreadcrumbBarRenderContext,
  ): BreadcrumbBarRender {
    const { strip, palette, projectRoot } = context;
    const activeTab = strip.items.find((tab) => tab.active);
    if (!activeTab)
      return {
        text: new StyledText([fg(palette.dim)('')]),
        segments: [],
      };
    const barWidth = Math.max(1, context.barWidth);
    const actionCellWidth = 3;
    const actionsWidth = context.editorTitleActions.length * actionCellWidth;
    const pathAreaWidth = Math.max(1, barWidth - actionsWidth);
    const crumbs = Breadcrumb.Class.fitPathSegments(
      Breadcrumb.Class.pathSegments(activeTab.identifier, projectRoot),
      // Reserve the row margin plus the hover pad cell each crumb row end carries.
      Math.max(1, pathAreaWidth - 2 - Breadcrumb.Class.HOVER_PAD_COLUMNS),
      3,
    );
    const chunks: TextChunk[] = [fg(palette.fg)(' ')];
    const segments: BreadcrumbBarSegment[] = [];
    let column = 1;
    crumbs.forEach((crumb, index) => {
      const isFilename = index === crumbs.length - 1;
      // ONE crumb geometry. The padded label is what the row shows, what the hover background
      // paints, and what `start`/`end` report — so the hit test and the picker anchor read the
      // same span the paint used. No second measurement anywhere.
      const paddedLabel = Breadcrumb.Class.paddedLabel(crumb.label);
      const start = column;
      const end = column + TextCoordinates.Class.lineWidth(paddedLabel);
      const styledCrumb = fg(isFilename ? palette.fg : palette.dim)(
        paddedLabel,
      );
      chunks.push(
        context.hoveredSourceIndex === crumb.sourceIndex
          ? bg(palette.cursorLine)(styledCrumb)
          : styledCrumb,
      );
      segments.push({ kind: 'crumb', ...crumb, start, end });
      column = end;
      // The separator glyph sits BETWEEN two padded crumbs and belongs to neither, so it never
      // takes the hover background and no crumb span covers it.
      if (!isFilename) {
        chunks.push(fg(palette.dim)('›'));
        column += 1;
      }
    });
    this.appendHorizontalGap(
      chunks,
      palette.fg,
      Math.max(0, pathAreaWidth - column),
    );
    column = pathAreaWidth;
    for (const [actionIndex, action] of context.editorTitleActions.entries()) {
      const start = column;
      const active = action.toggled;
      const hovered =
        context.hover?.kind === 'titleAction' &&
        context.hover.index === actionIndex;
      const pressed = context.pressedTitleActionIndex === actionIndex;
      const background = pressed
        ? palette.accent
        : active
          ? palette.selection
          : hovered
            ? palette.cursorLine
            : null;
      const color = pressed
        ? palette.bg
        : active || hovered
          ? palette.accent
          : palette.fg;
      const label = ` ${action.icon} `;
      chunks.push(
        background ? bg(background)(fg(color)(label)) : fg(color)(label),
      );
      column += actionCellWidth;
      segments.push({
        kind: 'titleAction',
        index: actionIndex,
        start,
        end: column,
      });
    }
    return { text: new StyledText(chunks), segments };
  }
}

export namespace TabBarRenderer {
  export const $Class = Static($TabBarRenderer);
  export let Class = $Class;
}

export type WorkspaceTabBarSegment = {
  kind: 'tab' | 'panBackward' | 'panForward' | 'add';
  workspaceIndex: number;
  primaryStart: number;
  primaryEnd: number;
  closePrimaryCoordinate?: number;
  closeCrossAxisCoordinate?: number;
};

export type WorkspaceTabBarHover = {
  kind: 'tab' | 'close' | 'panBackward' | 'panForward' | 'add';
  workspaceIndex: number;
} | null;

export type TabBarSegment =
  | {
      kind: 'tab';
      index: number;
      start: number;
      end: number;
      closeColumn: number;
    }
  | {
      kind: 'arrowLeft' | 'arrowRight' | 'badge';
      start: number;
      end: number;
    };

export type TabBarHover = {
  kind: 'tab' | 'close' | 'arrowLeft' | 'arrowRight' | 'badge';
  index: number;
} | null;

export interface WorkspaceTabBarRenderContext {
  strip: TabStrip.Instance;
  palette: Palette;
  hover: WorkspaceTabBarHover;
  /** The reveal index remembered across renders (in); the renderer returns the updated value (out). */
  lastRevealedIndex: number;
  /** Number(workspaceTabBar.width) — may be NaN when the renderable width is a percentage string. */
  barWidthValue: number;
  barHeightValue: number;
  rendererWidth: number;
  rendererHeight: number;
  /** The tier-aware close token shared with panel headings and the panel contents list. */
  closeGlyph: string;
}

export interface BufferTabBarRenderContext {
  strip: TabStrip.Instance;
  palette: Palette;
  barWidth: number;
  /** Active workspace root — the breadcrumb renders each tab's path relative to it. */
  projectRoot: string;
  /** Tier-aware powerline separator glyph drawn between crumbs/tabs (nerd  → unicode ❯ → ascii >). */
  separatorGlyph: string;
  /** The tier-aware close token shared with panel headings and the panel contents list. */
  closeGlyph: string;
  hover: TabBarHover;
  closePressed: number | null;
  arrowPressed: 'arrowLeft' | 'arrowRight' | null;
  lastRevealedIndex: number;
}

/** One clickable affordance in the breadcrumb row, projected from a command that declared an
 *  icon. The renderer never learns which plugin contributed it. */
export interface EditorTitleAction {
  readonly commandId: string;
  readonly title: string;
  readonly icon: string;
  readonly toggled: boolean;
}

export interface WorkspaceTabBarRender {
  text: StyledText;
  segments: WorkspaceTabBarSegment[];
  revealedIndex: number;
}

export interface BufferTabBarRender {
  text: StyledText;
  segments: TabBarSegment[];
  revealedIndex: number;
}

export interface BreadcrumbBarRenderContext {
  strip: TabStrip.Instance;
  palette: Palette;
  barWidth: number;
  /** Active workspace root — the breadcrumb is the active file's path relative to it. */
  projectRoot: string;
  hoveredSourceIndex: number | null;
  hover: BreadcrumbBarHover;
  pressedTitleActionIndex: number | null;
  /** Contributed editor-title affordances, already filtered by their command guards. */
  editorTitleActions: readonly EditorTitleAction[];
}

export type BreadcrumbBarSegment =
  | (BreadcrumbPathSegment & {
      kind: 'crumb';
      start: number;
      end: number;
    })
  | {
      kind: 'titleAction';
      index: number;
      start: number;
      end: number;
    };

export type BreadcrumbBarHover =
  | { kind: 'crumb'; sourceIndex: number }
  | { kind: 'titleAction'; index: number }
  | null;

export interface BreadcrumbBarRender {
  text: StyledText;
  segments: BreadcrumbBarSegment[];
}
