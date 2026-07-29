// Standalone keyboard-shortcuts overlay. The caller supplies the resolved binding map and owns the
// open/close lifecycle; RootView and command dispatch deliberately remain outside this module.
//
// invariant: Advertised bindings are deliverable bindings (src/modules/keybindings/keybindings.invariants.md)
// invariant: A scrollable pane height is an input not an output (src/modules/ui/ui.invariants.md)
// invariant: Only the visible window is rendered (src/modules/ui/ui.invariants.md)
// invariant: One writer per scroll regime per frame (src/modules/ui/ui.invariants.md)
// invariant: A scrollbar track is derived per frame from its region rect (src/modules/ui/ui.invariants.md)

import {
  BoxRenderable,
  ScrollBarRenderable,
  StyledText,
  TextRenderable,
  bold,
  fg,
  type BoxOptions,
  type CliRenderer,
  type Renderable,
  type ScrollBarOptions,
  type TextChunk,
  type TextOptions,
} from '@opentui/core';
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import type {
  ChordPattern,
  Keybinding,
} from '../keybindings/KeybindingRegistry';
import type { Theme } from '../theme/Theme';
import type { Palette } from '../theme/ThemePalettes';
import {
  AT_REST,
  Momentum,
  VERTICAL_MOMENTUM,
  type ScrollMomentum,
} from './Momentum';
import { ScrollbarGeometry, type BarGeometry } from './ScrollbarGeometry';

export type EffectiveBindings = ReadonlyMap<string, Keybinding>;
export type EffectiveBindingsSource =
  EffectiveBindings | ((context: string) => EffectiveBindings);
export type ShortcutActionLabels =
  ReadonlyMap<string, string> | ((action: string) => string | undefined);

export interface ShortcutsViewCallbacks {
  onClose: () => void;
}

export interface ShortcutsViewOptions extends ShortcutsViewCallbacks {
  /** A complete post-shadowing map, or KeybindingRegistry.effectiveBindings bound as a callback. */
  effectiveBindings: EffectiveBindingsSource;
  /** Optional command-title seam. Unknown actions receive a deterministic readable fallback. */
  actionLabels?: ShortcutActionLabels;
  parentRenderable?: Renderable;
  title?: string;
  /** Live thickness seam so the reviewer can attach the Settings value without coupling this view. */
  scrollbarThickness?: number | (() => number);
}

export interface ShortcutContextRow {
  kind: 'context';
  context: string;
  label: string;
}

export interface ShortcutBindingRow {
  kind: 'binding';
  context: string;
  chord: string;
  action: string;
  actionLabel: string;
}

export type ShortcutRow = ShortcutContextRow | ShortcutBindingRow;

const CONTEXT_SEQUENCE = [
  'global',
  'editor',
  'files',
  'git',
  'settings',
  'palette',
  'menu',
] as const;
const CONTEXT_LABELS: Readonly<Record<string, string>> = {
  global: 'Global',
  editor: 'Editor',
  files: 'Files',
  git: 'Git',
  settings: 'Settings',
  palette: 'Command Palette',
  menu: 'Context Menu',
};
const NAMED_KEY_LABELS: Readonly<Record<string, string>> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  home: 'Home',
  end: 'End',
  return: 'Enter',
  enter: 'Enter',
  escape: 'Esc',
  backspace: 'Backspace',
  delete: 'Delete',
  tab: 'Tab',
  space: 'Space',
};

function readableWords(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function readableKey(key: string): string {
  const knownLabel = NAMED_KEY_LABELS[key.toLowerCase()];
  if (knownLabel) return knownLabel;
  if (key.length === 1) return key.toUpperCase();
  return readableWords(key).replace(/\s+/g, '');
}

function $formatChord(chord: ChordPattern): string {
  const chordParts: string[] = [];
  if (chord.ctrl) chordParts.push('Ctrl');
  if (chord.shift) chordParts.push('Shift');
  if (chord.alt) chordParts.push('Alt/Option');
  if (chord.super) chordParts.push('Cmd');
  chordParts.push(readableKey(chord.key));
  return chordParts.join('+');
}

function formatBindingChord(binding: Keybinding): string {
  if (binding.chord) return $formatChord(binding.chord);
  if (binding.steps?.length)
    return binding.steps.map($formatChord).join(' then ');
  return 'Unbound';
}

function actionLabelFor(
  action: string,
  actionLabels?: ShortcutActionLabels,
): string {
  const suppliedLabel =
    typeof actionLabels === 'function'
      ? actionLabels(action)
      : actionLabels?.get(action);
  if (suppliedLabel) return suppliedLabel;
  const actionName = action.split('.').at(-1) ?? action;
  return readableWords(actionName);
}

function contextOrder(leftContext: string, rightContext: string): number {
  const leftSequenceIndex = CONTEXT_SEQUENCE.indexOf(
    leftContext as (typeof CONTEXT_SEQUENCE)[number],
  );
  const rightSequenceIndex = CONTEXT_SEQUENCE.indexOf(
    rightContext as (typeof CONTEXT_SEQUENCE)[number],
  );
  if (leftSequenceIndex >= 0 && rightSequenceIndex >= 0)
    return leftSequenceIndex - rightSequenceIndex;
  if (leftSequenceIndex >= 0) return -1;
  if (rightSequenceIndex >= 0) return 1;
  return leftContext.localeCompare(rightContext);
}

function $buildShortcutRows(
  effectiveBindings: EffectiveBindings,
  actionLabels?: ShortcutActionLabels,
): ShortcutRow[] {
  const bindingsByContext = new Map<string, ShortcutBindingRow[]>();
  for (const binding of effectiveBindings.values()) {
    const context = binding.context ?? 'global';
    const contextBindings = bindingsByContext.get(context) ?? [];
    contextBindings.push({
      kind: 'binding',
      context,
      chord: formatBindingChord(binding),
      action: binding.action,
      actionLabel: actionLabelFor(binding.action, actionLabels),
    });
    bindingsByContext.set(context, contextBindings);
  }

  const shortcutRows: ShortcutRow[] = [];
  const contexts = [...bindingsByContext.keys()].sort(contextOrder);
  for (const context of contexts) {
    shortcutRows.push({
      kind: 'context',
      context,
      label: CONTEXT_LABELS[context] ?? readableWords(context),
    });
    const contextBindings = bindingsByContext.get(context) ?? [];
    contextBindings.sort(
      (leftBinding, rightBinding) =>
        leftBinding.actionLabel.localeCompare(rightBinding.actionLabel) ||
        leftBinding.chord.localeCompare(rightBinding.chord) ||
        leftBinding.action.localeCompare(rightBinding.action),
    );
    shortcutRows.push(...contextBindings);
  }
  return shortcutRows;
}

function $renderShortcutRows(
  shortcutRows: readonly ShortcutRow[],
  width: number,
  palette: Palette,
  chordColumnWidth?: number,
): StyledText {
  const availableWidth = Math.max(1, Math.floor(width));
  const longestChord = shortcutRows.reduce(
    (longest, shortcutRow) =>
      shortcutRow.kind === 'binding'
        ? Math.max(longest, shortcutRow.chord.length)
        : longest,
    0,
  );
  const resolvedChordColumnWidth = Math.max(
    1,
    Math.min(
      chordColumnWidth ?? longestChord,
      Math.max(1, Math.floor(availableWidth * 0.45)),
    ),
  );
  const textChunks: TextChunk[] = [];

  shortcutRows.forEach((shortcutRow, shortcutRowIndex) => {
    if (shortcutRow.kind === 'context') {
      textChunks.push(
        bold(
          fg(palette.accent)(` ${shortcutRow.label}`.slice(0, availableWidth)),
        ),
      );
    } else {
      const chordText = shortcutRow.chord
        .slice(0, resolvedChordColumnWidth)
        .padEnd(resolvedChordColumnWidth, ' ');
      const actionWidth = Math.max(
        0,
        availableWidth - resolvedChordColumnWidth - 3,
      );
      textChunks.push(fg(palette.dim)(` ${chordText}`));
      if (actionWidth > 0)
        textChunks.push(
          fg(palette.fg)(`  ${shortcutRow.actionLabel.slice(0, actionWidth)}`),
        );
    }
    if (shortcutRowIndex < shortcutRows.length - 1)
      textChunks.push(fg(palette.fg)('\n'));
  });
  return new StyledText(textChunks);
}

class $ShortcutsView {
  static formatChord = $formatChord;
  static buildShortcutRows = $buildShortcutRows;
  static renderShortcutRows = $renderShortcutRows;

  readonly rootRenderable: BoxRenderable;
  private readonly headingRenderable: TextRenderable;
  private readonly bodyRenderable: BoxRenderable;
  private readonly shortcutsRenderable: TextRenderable;
  private readonly verticalScrollbarRenderable: ScrollBarRenderable;
  private isApplyingScrollbarGeometry = false;
  private reportedToTrueScale = 0;

  get scrollOffset() {
    return ref(0);
  }

  get scrollMomentum() {
    return shallowRef<ScrollMomentum>(AT_REST);
  }

  constructor(
    public readonly renderer: CliRenderer,
    public readonly theme: Theme.Instance,
    public readonly options: ShortcutsViewOptions,
  ) {
    this.rootRenderable = this.createBoxRenderable({
      id: 'shortcuts-view',
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      overflow: 'hidden',
      border: true,
      title: options.title ?? 'Keyboard Shortcuts',
    });
    this.headingRenderable = this.createTextRenderable({
      id: 'shortcuts-heading',
      width: '100%',
      height: 1,
      content: ' Shortcut                     Action',
      selectable: false,
      wrapMode: 'none',
    });
    this.bodyRenderable = this.createBoxRenderable({
      id: 'shortcuts-body',
      width: '100%',
      flexGrow: 1,
      overflow: 'hidden',
    });
    this.shortcutsRenderable = this.createTextRenderable({
      id: 'shortcuts-list',
      width: '100%',
      height: '100%',
      content: '',
      selectable: false,
      wrapMode: 'none',
      overflow: 'hidden',
    });
    this.verticalScrollbarRenderable = this.createScrollBarRenderable({
      id: 'shortcuts-scrollbar',
      orientation: 'vertical',
      position: 'absolute',
      width: 1,
      showArrows: false,
      onChange: (reportedPosition) =>
        this.onVerticalScrollbarChanged(reportedPosition),
    });

    this.bodyRenderable.onMouseScroll = (event) => {
      const direction = event.scroll?.direction;
      this.impulseVerticalScroll(direction === 'up' ? -1 : 1);
    };
    this.bodyRenderable.onSizeChange = () => this.update();
    this.bodyRenderable.add(this.shortcutsRenderable);
    this.bodyRenderable.add(this.verticalScrollbarRenderable);
    this.rootRenderable.add(this.headingRenderable);
    this.rootRenderable.add(this.bodyRenderable);
    (options.parentRenderable ?? renderer.root).add(this.rootRenderable);
    this.update();
  }

  createBoxRenderable(options: BoxOptions): BoxRenderable {
    return new BoxRenderable(this.renderer, options);
  }

  createTextRenderable(options: TextOptions): TextRenderable {
    return new TextRenderable(this.renderer, options);
  }

  createScrollBarRenderable(options: ScrollBarOptions): ScrollBarRenderable {
    return new ScrollBarRenderable(this.renderer, options);
  }

  close(): void {
    this.options.onClose();
  }

  impulseVerticalScroll(deltaRows: number): void {
    this.scrollMomentum.value = Momentum.Class.addImpulse(
      this.scrollMomentum.value,
      deltaRows,
      VERTICAL_MOMENTUM,
    );
  }

  tickScrollMomentum(deltaTimeSeconds: number): boolean {
    const momentumStep = Momentum.Class.stepMomentum(
      this.scrollMomentum.value,
      deltaTimeSeconds,
      VERTICAL_MOMENTUM,
    );
    this.scrollMomentum.value = momentumStep.momentum;
    if (momentumStep.rows !== 0) {
      const nextScrollOffset = this.clampScrollOffset(
        this.scrollOffset.value + momentumStep.rows,
      );
      if (nextScrollOffset === this.scrollOffset.value) {
        this.scrollMomentum.value = Momentum.Class.halt();
      } else {
        this.scrollOffset.value = nextScrollOffset;
        this.update();
      }
    }
    return Momentum.Class.isMoving(this.scrollMomentum.value);
  }

  moveByKeyboardRows(deltaRows: number): void {
    this.scrollMomentum.value = Momentum.Class.halt();
    this.scrollOffset.value = this.clampScrollOffset(
      this.clampedScrollOffset() + deltaRows,
    );
    this.update();
  }

  pageByKeyboard(direction: -1 | 1): void {
    this.moveByKeyboardRows(direction * this.viewportRowCount());
  }

  moveToBoundary(boundary: 'start' | 'end'): void {
    this.scrollMomentum.value = Momentum.Class.halt();
    this.scrollOffset.value =
      boundary === 'start' ? 0 : this.maximumScrollOffset();
    this.update();
  }

  haltScrollMomentum(): void {
    this.scrollMomentum.value = Momentum.Class.halt();
  }

  update(): void {
    const palette = this.theme.palette;
    const shortcutRows = this.shortcutRows();
    const firstVisibleRow = this.clampScrollOffset(
      this.scrollOffset.value,
      shortcutRows.length,
    );
    const visibleShortcutRows = shortcutRows.slice(
      firstVisibleRow,
      firstVisibleRow + this.viewportRowCount(),
    );
    const contentWidth = this.contentWidth();
    const longestChord = shortcutRows.reduce(
      (longest, shortcutRow) =>
        shortcutRow.kind === 'binding'
          ? Math.max(longest, shortcutRow.chord.length)
          : longest,
      0,
    );

    this.rootRenderable.backgroundColor = palette.panel;
    this.rootRenderable.borderColor = palette.borderActive;
    this.rootRenderable.titleColor = palette.accent;
    this.headingRenderable.bg = palette.statusBg;
    this.headingRenderable.fg = palette.dim;
    this.bodyRenderable.backgroundColor = palette.panel;
    this.shortcutsRenderable.content = $renderShortcutRows(
      visibleShortcutRows,
      contentWidth,
      palette,
      longestChord,
    );
    this.synchronizeScrollbar(shortcutRows.length, firstVisibleRow);
    this.renderer.requestRender();
  }

  private effectiveBindings(): EffectiveBindings {
    if (typeof this.options.effectiveBindings !== 'function')
      return this.options.effectiveBindings;

    // effectiveBindings(context) includes global bindings plus that context. Query every context,
    // then retain only the rows owned by the queried context so global actions appear exactly once.
    const combinedEffectiveBindings = new Map<string, Keybinding>();
    for (const context of CONTEXT_SEQUENCE) {
      for (const binding of this.options.effectiveBindings(context).values()) {
        if ((binding.context ?? 'global') !== context) continue;
        combinedEffectiveBindings.set(`${context}:${binding.action}`, binding);
      }
    }
    return combinedEffectiveBindings;
  }

  private shortcutRows(): ShortcutRow[] {
    return $buildShortcutRows(
      this.effectiveBindings(),
      this.options.actionLabels,
    );
  }

  private viewportRowCount(): number {
    const laidOutBodyHeight = Number(this.bodyRenderable.height) || 0;
    if (laidOutBodyHeight > 0) return Math.max(1, laidOutBodyHeight);
    return Math.max(1, (Number(this.rootRenderable.height) || 22) - 3);
  }

  private contentWidth(): number {
    const laidOutBodyWidth =
      Number(this.bodyRenderable.width) ||
      Number(this.rootRenderable.width) - 2;
    return Math.max(1, (laidOutBodyWidth || 78) - 1);
  }

  private maximumScrollOffset(
    shortcutRowCount = this.shortcutRows().length,
  ): number {
    return Math.max(0, shortcutRowCount - this.viewportRowCount());
  }

  private clampScrollOffset(
    scrollOffset: number,
    shortcutRowCount = this.shortcutRows().length,
  ): number {
    return Math.max(
      0,
      Math.min(
        Math.round(scrollOffset),
        this.maximumScrollOffset(shortcutRowCount),
      ),
    );
  }

  private clampedScrollOffset(): number {
    return this.clampScrollOffset(this.scrollOffset.value);
  }

  private scrollbarThickness(): number {
    const configuredThickness =
      typeof this.options.scrollbarThickness === 'function'
        ? this.options.scrollbarThickness()
        : this.options.scrollbarThickness;
    return Math.max(1, Math.round(configuredThickness ?? 1));
  }

  private synchronizeScrollbar(
    shortcutRowCount: number,
    scrollOffset: number,
  ): void {
    const bodyWidth = Math.max(1, Number(this.bodyRenderable.width) || 1);
    const bodyHeight = Math.max(1, Number(this.bodyRenderable.height) || 1);
    const geometry = ScrollbarGeometry.Class.scrollbarGeometry(
      'vertical',
      { top: 0, left: 0, width: bodyWidth, height: bodyHeight },
      {
        scrollSize: shortcutRowCount,
        viewportSize: this.viewportRowCount(),
        scrollPosition: scrollOffset,
      },
    );
    this.applyScrollbarGeometry(geometry, shortcutRowCount);
  }

  private applyScrollbarGeometry(
    geometry: BarGeometry | null,
    shortcutRowCount: number,
  ): void {
    if (!geometry) {
      this.verticalScrollbarRenderable.visible = false;
      this.verticalScrollbarRenderable.scrollSize = 0;
      this.reportedToTrueScale = 0;
      return;
    }
    const thickness = this.scrollbarThickness();
    this.verticalScrollbarRenderable.visible = true;
    this.verticalScrollbarRenderable.top = geometry.trackTop;
    this.verticalScrollbarRenderable.left =
      geometry.trackLeft - (thickness - 1);
    this.verticalScrollbarRenderable.height = geometry.trackLength;
    this.verticalScrollbarRenderable.width = thickness;
    const slider = (
      this.verticalScrollbarRenderable as unknown as {
        slider?: { width?: number };
      }
    ).slider;
    if (slider) slider.width = thickness;
    this.isApplyingScrollbarGeometry = true;
    try {
      this.verticalScrollbarRenderable.scrollSize = shortcutRowCount;
      this.verticalScrollbarRenderable.viewportSize =
        geometry.reportedViewportSize;
      this.verticalScrollbarRenderable.scrollPosition =
        geometry.reportedPosition;
    } finally {
      this.isApplyingScrollbarGeometry = false;
    }
    this.reportedToTrueScale = geometry.reportedToTrueScale;
  }

  private onVerticalScrollbarChanged(reportedPosition: number): void {
    if (this.isApplyingScrollbarGeometry) return;
    this.scrollMomentum.value = Momentum.Class.halt();
    this.scrollOffset.value = this.clampScrollOffset(
      Math.round(reportedPosition * this.reportedToTrueScale),
    );
    this.update();
  }

  dispose(): void {
    try {
      (this.options.parentRenderable ?? this.renderer.root).remove(
        this.rootRenderable,
      );
      this.rootRenderable.destroyRecursively();
    } catch {
      // Disposal is idempotent from the caller's perspective.
    }
  }
}

export namespace ShortcutsView {
  export const $Class = $ShortcutsView;
  export let Class = Reactive($Class);
  export const formatChord = $Class.formatChord;
  export const buildShortcutRows = $Class.buildShortcutRows;
  export const renderShortcutRows = $Class.renderShortcutRows;
  export type Instance = typeof Class.Instance;
}
