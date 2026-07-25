import {
  BoxRenderable,
  type CliRenderer,
  type MouseEvent,
} from '@opentui/core';
import { SplitterModel } from '../layout/SplitterModel';
import type { Palette } from '../theme/ThemePalettes';

// invariant: Splitter paint and hit testing share one geometry (src/modules/ui/ui.invariants.md)
class $SplitterElement {
  readonly renderable: BoxRenderable;
  readonly model: SplitterModel.Instance;
  protected hovered = false;
  protected dragActive = false;

  constructor(readonly options: SplitterElementOptions) {
    this.model = this.createSplitterModel();
    this.renderable = this.createRenderable();
    this.bindPointerEvents();
  }

  protected createSplitterModel(): SplitterModel.Instance {
    return new SplitterModel.Class({
      orientation: this.options.orientation,
      mode: this.options.reportUnit,
      initialSize: this.options.initialSize,
      minimumSize: this.options.minimumSize,
      maximumSize: this.options.maximumSize,
      extentCells: this.options.extentCells,
      onSizeChange: (size) => this.options.onSizeChange(size),
    });
  }

  protected createRenderable(): BoxRenderable {
    const crossAxisCellCount = $SplitterElement.crossAxisCellCount;
    return new BoxRenderable(this.options.renderer, {
      id: this.options.identifier,
      width:
        this.options.orientation === 'vertical' ? crossAxisCellCount : '100%',
      height:
        this.options.orientation === 'horizontal' ? crossAxisCellCount : '100%',
      flexShrink: 0,
    });
  }

  protected static get crossAxisCellCount(): number {
    return 1;
  }

  get active(): boolean {
    return this.hovered || this.model.dragging.value;
  }

  get size(): number {
    return this.model.size.value;
  }

  set size(size: number) {
    this.model.size.value = size;
  }

  setExtentCells(extentCells: number): void {
    this.model.setExtentCells(extentCells);
  }

  setGeometry(geometry: SplitterElementGeometry): void {
    this.renderable.position = 'absolute';
    this.renderable.left = geometry.left;
    this.renderable.top = geometry.top;
    this.renderable.visible = geometry.visible ?? true;
    if (this.options.orientation === 'vertical') {
      this.renderable.width = $SplitterElement.crossAxisCellCount;
      this.renderable.height = Math.max(0, geometry.length);
    } else {
      this.renderable.width = Math.max(0, geometry.length);
      this.renderable.height = $SplitterElement.crossAxisCellCount;
    }
  }

  updateAppearance(palette: Palette): void {
    this.renderable.backgroundColor = this.active
      ? palette.accent
      : palette.border;
  }

  protected pointerPosition(event: MouseEvent): number {
    const axisPosition =
      this.options.orientation === 'vertical' ? event.x : event.y;
    const pointerDirection =
      typeof this.options.pointerDirection === 'function'
        ? this.options.pointerDirection()
        : (this.options.pointerDirection ?? 1);
    return axisPosition * pointerDirection;
  }

  protected capturePointer(): void {
    const renderableWithContext = this.renderable as unknown as {
      _ctx?: {
        setCapturedRenderable?: (renderable: unknown) => void;
      };
    };
    renderableWithContext._ctx?.setCapturedRenderable?.(this.renderable);
  }

  protected bindPointerEvents(): void {
    this.renderable.onMouseDown = (event) => {
      this.capturePointer();
      const currentSize = this.options.currentSize?.();
      if (currentSize !== undefined) this.model.size.value = currentSize;
      const extentCells = this.options.currentExtentCells?.();
      if (extentCells !== undefined) this.model.setExtentCells(extentCells);
      this.model.beginDrag(this.pointerPosition(event));
      this.dragActive = true;
      this.options.onDragStart?.();
      this.options.renderer.requestRender();
    };
    this.renderable.onMouseDrag = (event) => {
      if (!this.dragActive) return;
      this.model.dragTo(this.pointerPosition(event));
      this.options.renderer.requestRender();
    };
    const endDrag = (): void => {
      if (!this.dragActive) return;
      this.dragActive = false;
      this.model.endDrag();
      this.options.onDragEnd?.();
      this.options.renderer.requestRender();
    };
    this.renderable.onMouseUp = endDrag;
    this.renderable.onMouseDragEnd = endDrag;
    this.renderable.onMouseMove = () => {
      if (this.hovered) return;
      this.hovered = true;
      this.options.renderer.requestRender();
    };
    this.renderable.onMouseOut = () => {
      if (!this.hovered) return;
      this.hovered = false;
      this.options.renderer.requestRender();
    };
  }
}

export namespace SplitterElement {
  export const $Class = $SplitterElement;
  export const Class = $SplitterElement;
  export type Model = InstanceType<typeof Class>;
}

export interface SplitterElementOptions {
  renderer: CliRenderer;
  identifier: string;
  orientation: 'vertical' | 'horizontal';
  reportUnit: 'cells' | 'ratio';
  initialSize: number;
  minimumSize?: number;
  maximumSize?: number | (() => number);
  extentCells?: number;
  pointerDirection?: 1 | -1 | (() => 1 | -1);
  currentSize?: () => number;
  currentExtentCells?: () => number;
  onSizeChange: (size: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export interface SplitterElementGeometry {
  left: number;
  top: number;
  length: number;
  visible?: boolean;
}
