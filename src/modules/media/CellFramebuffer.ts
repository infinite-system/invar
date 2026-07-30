import { StyledText, bg, fg, type TextChunk } from '@opentui/core';

// invariant: Animation reuses one fixed framebuffer working set (src/modules/media/media.invariants.md)
class $CellFramebuffer {
  protected pixelColumns = 1;
  protected pixelRows = 2;
  protected pixelStorage = new Uint8Array(1 * 2 * 4);
  protected depthStorage = new Float32Array(1 * 2);
  protected bufferGenerationValue = 1;

  constructor(cellColumns = 1, cellRows = 1) {
    this.resize(cellColumns, cellRows);
  }

  get width(): number {
    return this.pixelColumns;
  }

  get height(): number {
    return this.pixelRows;
  }

  get cellColumns(): number {
    return this.pixelColumns;
  }

  get cellRows(): number {
    return Math.ceil(this.pixelRows / 2);
  }

  get rgba(): Uint8Array {
    return this.pixelStorage;
  }

  get depth(): Float32Array {
    return this.depthStorage;
  }

  get bufferGeneration(): number {
    return this.bufferGenerationValue;
  }

  get workingSetBytes(): number {
    return this.pixelStorage.byteLength + this.depthStorage.byteLength;
  }

  resize(cellColumns: number, cellRows: number): boolean {
    const nextPixelColumns = Math.max(1, Math.floor(cellColumns));
    const nextPixelRows = Math.max(2, Math.floor(cellRows) * 2);
    if (
      nextPixelColumns === this.pixelColumns &&
      nextPixelRows === this.pixelRows
    ) {
      return false;
    }
    this.pixelColumns = nextPixelColumns;
    this.pixelRows = nextPixelRows;
    this.pixelStorage = new Uint8Array(this.pixelColumns * this.pixelRows * 4);
    this.depthStorage = new Float32Array(this.pixelColumns * this.pixelRows);
    this.bufferGenerationValue += 1;
    return true;
  }

  clear(red: number, green: number, blue: number): void {
    for (
      let pixelOffset = 0;
      pixelOffset < this.pixelStorage.length;
      pixelOffset += 4
    ) {
      this.pixelStorage[pixelOffset] = red;
      this.pixelStorage[pixelOffset + 1] = green;
      this.pixelStorage[pixelOffset + 2] = blue;
      this.pixelStorage[pixelOffset + 3] = 255;
    }
    this.depthStorage.fill(Number.POSITIVE_INFINITY);
  }

  setPixel(
    column: number,
    row: number,
    red: number,
    green: number,
    blue: number,
    depth = 0,
  ): void {
    if (
      column < 0 ||
      row < 0 ||
      column >= this.pixelColumns ||
      row >= this.pixelRows
    ) {
      return;
    }
    const pixelIndex = row * this.pixelColumns + column;
    if (depth >= this.depthStorage[pixelIndex]!) return;
    this.depthStorage[pixelIndex] = depth;
    const pixelOffset = pixelIndex * 4;
    this.pixelStorage[pixelOffset] = red;
    this.pixelStorage[pixelOffset + 1] = green;
    this.pixelStorage[pixelOffset + 2] = blue;
    this.pixelStorage[pixelOffset + 3] = 255;
  }

  copyRgba(source: Uint8Array): void {
    this.pixelStorage.set(
      source.subarray(0, Math.min(source.length, this.pixelStorage.length)),
    );
  }

  renderHalfBlocks(): StyledText {
    const chunks: TextChunk[] = [];
    for (let rowIndex = 0; rowIndex < this.cellRows; rowIndex++) {
      let runText = '';
      let runTopColor = '';
      let runBottomColor = '';
      const flushRun = (): void => {
        if (runText.length === 0) return;
        chunks.push(fg(runTopColor)(bg(runBottomColor)(runText)));
        runText = '';
      };
      for (let columnIndex = 0; columnIndex < this.cellColumns; columnIndex++) {
        const topOffset = (rowIndex * 2 * this.pixelColumns + columnIndex) * 4;
        const bottomRow = Math.min(rowIndex * 2 + 1, this.pixelRows - 1);
        const bottomOffset = (bottomRow * this.pixelColumns + columnIndex) * 4;
        const topColor = this.pixelHex(topOffset);
        const bottomColor = this.pixelHex(bottomOffset);
        if (
          runText.length > 0 &&
          (topColor !== runTopColor || bottomColor !== runBottomColor)
        ) {
          flushRun();
        }
        runTopColor = topColor;
        runBottomColor = bottomColor;
        runText += '▀';
      }
      flushRun();
      if (rowIndex < this.cellRows - 1) chunks.push(fg('#000000')('\n'));
    }
    return new StyledText(chunks);
  }

  protected pixelHex(pixelOffset: number): string {
    return (
      '#' +
      this.pixelStorage[pixelOffset]!.toString(16).padStart(2, '0') +
      this.pixelStorage[pixelOffset + 1]!.toString(16).padStart(2, '0') +
      this.pixelStorage[pixelOffset + 2]!.toString(16).padStart(2, '0')
    );
  }
}

export namespace CellFramebuffer {
  export const $Class = $CellFramebuffer;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
