import { Reactive } from 'ivue';
import { Static } from 'ivue/extras';
import { ref, shallowRef } from 'vue';
import { Momentum, type ScrollMomentum } from '../system/Momentum';

// The scroll window one text surface shows: offsets, size, and wheel momentum. A surface renders
// only the lines this window exposes — memory and render cost track the visible set, not the
// file size.
//
// invariant: The terminal shows a bounded viewport (project.invariants.md)
// invariant: Cost tracks the actively observed set (project.invariants.md)
// invariant: Explicit jumps use one reading position (src/modules/text/text.invariants.md)
class $TextViewport {
  protected static get READING_CONTEXT_ROWS(): number {
    return 2;
  }

  /**
   * Return the scroll position that reveals one target row. Ordinary movement changes the window
   * only when the target leaves it. A reading jump places up to two context rows above the target.
   */
  static scrollTopForTarget(
    targetRow: number,
    currentScrollTop: number,
    viewportRows: number,
    totalRows: number,
    placement: ViewportTargetPlacement = 'nearest',
  ): number {
    const normalizedViewportRows = Math.max(1, Math.floor(viewportRows));
    const normalizedTotalRows = Math.max(0, Math.floor(totalRows));
    const maximumScrollTop = Math.max(
      0,
      normalizedTotalRows - normalizedViewportRows,
    );
    const normalizedTargetRow = Math.max(
      0,
      Math.min(Math.max(0, normalizedTotalRows - 1), Math.floor(targetRow)),
    );
    const normalizedCurrentScrollTop = Math.max(
      0,
      Math.min(maximumScrollTop, Math.floor(currentScrollTop)),
    );

    if (placement === 'reading') {
      const contextRows = Math.min(
        this.READING_CONTEXT_ROWS,
        Math.max(0, normalizedViewportRows - 2),
      );
      return Math.max(
        0,
        Math.min(maximumScrollTop, normalizedTargetRow - contextRows),
      );
    }
    if (normalizedTargetRow < normalizedCurrentScrollTop) {
      return normalizedTargetRow;
    }
    if (
      normalizedTargetRow >=
      normalizedCurrentScrollTop + normalizedViewportRows
    ) {
      return Math.max(
        0,
        Math.min(
          maximumScrollTop,
          normalizedTargetRow - normalizedViewportRows + 1,
        ),
      );
    }
    return normalizedCurrentScrollTop;
  }

  get scrollTop() {
    return ref(0);
  }
  get scrollLeft() {
    return ref(0);
  }
  get verticalScrollMomentum() {
    return shallowRef<ScrollMomentum>(Momentum.Class.AT_REST);
  }
  get horizontalScrollMomentum() {
    return shallowRef<ScrollMomentum>(Momentum.Class.AT_REST);
  }
  get height() {
    return ref(20);
  }
  get width() {
    return ref(80);
  }

  setSize(width: number, height: number): void {
    this.width.value = Math.max(1, width);
    this.height.value = Math.max(1, height);
  }

  /** Ensure line `line` is visible within [scrollTop, scrollTop+height). */
  scrollToLine(line: number, totalLines: number): void {
    this.haltScrollMomentum();
    const viewportClass = this.constructor as typeof $TextViewport;
    this.scrollTop.value = viewportClass.scrollTopForTarget(
      line,
      this.scrollTop.value,
      this.height.value,
      totalLines,
    );
  }

  scrollBy(delta: number, totalLines: number): void {
    const maxScrollTop = Math.max(0, totalLines - this.height.value);
    this.scrollTop.value = Math.max(
      0,
      Math.min(this.scrollTop.value + delta, maxScrollTop),
    );
  }

  /** Horizontal wheel/scrollbar: move the column window, clamped to the full content width. */
  scrollByColumns(delta: number, contentWidth: number): void {
    const maxScrollLeft = Math.max(0, contentWidth - this.width.value);
    this.scrollLeft.value = Math.max(
      0,
      Math.min(this.scrollLeft.value + delta, maxScrollLeft),
    );
  }

  /** Precise cursor movement or a scrollbar drag adopts both axes and stops wheel glide. */
  haltScrollMomentum(): void {
    this.verticalScrollMomentum.value = Momentum.Class.halt();
    this.horizontalScrollMomentum.value = Momentum.Class.halt();
  }

  /** Keep `displayColumn` visible within [scrollLeft, scrollLeft + width): auto-hscroll on cursor moves. */
  scrollToColumn(displayColumn: number): void {
    const width = Math.max(1, this.width.value);
    if (displayColumn < this.scrollLeft.value) {
      this.scrollLeft.value = displayColumn;
    } else if (displayColumn >= this.scrollLeft.value + width) {
      this.scrollLeft.value = displayColumn - width + 1;
    }
  }

  get firstVisible(): number {
    return this.scrollTop.value;
  }
  get visibleCount(): number {
    return this.height.value;
  }
}

export namespace TextViewport {
  export const $Class = Static($TextViewport);
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export type ViewportTargetPlacement = 'nearest' | 'reading';
