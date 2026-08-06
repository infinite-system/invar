import { StyledText, fg, type KeyEvent } from '@opentui/core';
import { ref, type Ref } from 'vue';
import type { DecodedImage } from '../image/ImageDecoders';
import { HalfBlockRenderer } from '../image/HalfBlockRenderer';
import { ImageRenderers } from '../image/ImageRenderers';
import {
  PixelImageMount,
  type PixelMountTerminal,
} from '../image/PixelImageMount';
import type {
  PaneContent,
  PaneRenderContext,
} from '../ui/PaneContent.interface';
import { CellFramebuffer } from './CellFramebuffer';
import { SoftwareScene, type MediaSceneKind } from './SoftwareScene';
import { VideoFrameStream } from './VideoFrameStream';

// invariant: Animation reuses one fixed framebuffer working set (src/modules/media/media.invariants.md)
// invariant: Video decoding never exceeds the showing and decoding frames (src/modules/media/media.invariants.md)
// invariant: Missing ffmpeg is loud and harmless (src/modules/media/media.invariants.md)
class $MediaPaneContent implements PaneContent {
  constructor(protected readonly options: MediaPaneOptions) {
    this.id = options.identifier;
    this.instanceLabel = options.label;
    this.mode = options.mode;
    this.viewportColumns = Math.max(1, options.columns);
    this.viewportRows = Math.max(1, options.rows);
    this.pixelMount = new PixelImageMount.Class(options.pixelTerminal);
    if (this.mode === 'demo') {
      this.framebuffer = new CellFramebuffer.Class(
        this.viewportColumns,
        this.viewportRows,
      );
      this.scene = new SoftwareScene.Class();
      this.activeSceneValue = this.scene.render(
        this.framebuffer,
        0,
        this.requestedScene,
      );
      this.demoImage = {
        width: this.framebuffer.width,
        height: this.framebuffer.height,
        rgba: this.framebuffer.rgba,
      };
      this.stillImage = null;
    } else if (this.mode === 'image') {
      this.framebuffer = null;
      this.scene = null;
      this.demoImage = null;
      try {
        this.stillImage = options.loadImage?.() ?? null;
        if (!this.stillImage)
          this.noticeValue = 'The image could not be decoded.';
      } catch (error) {
        this.stillImage = null;
        this.noticeValue = `The image could not be decoded: ${String(error)}`;
      }
    } else {
      this.framebuffer = null;
      this.scene = null;
      this.demoImage = null;
      this.stillImage = null;
      this.restartVideo();
    }
  }

  readonly id: string;
  readonly kind = 'media';
  readonly instanceLabel: string;
  readonly keybindingContext = 'media';
  readonly renderRevision: Ref<number> = ref(0);
  protected readonly mode: MediaPaneMode;
  protected readonly pixelMount: PixelImageMount.Model;
  protected readonly framebuffer: CellFramebuffer.Model | null;
  protected readonly scene: SoftwareScene.Model | null;
  protected readonly demoImage: DecodedImage | null;
  protected readonly stillImage: DecodedImage | null;
  protected readonly graphicsSupersamplingScale = 8;
  protected videoStream: VideoFrameStream.Model | null = null;
  protected videoImage: DecodedImage | null = null;
  protected timer: ReturnType<typeof setTimeout> | null = null;
  protected disposed = false;
  protected pausedValue = false;
  protected frameIndexValue = 0;
  protected decodedFrameCountValue = 0;
  protected droppedFrameCountValue = 0;
  protected noticeValue: string | null = null;
  protected activeSceneValue: MediaSceneKind = 'cube';
  protected requestedScene: MediaSceneKind | 'automatic' = 'automatic';
  protected animationStartMilliseconds = performance.now();
  protected viewportColumns: number;
  protected viewportRows: number;
  protected framebufferSupersamplingScale = 1;

  get title(): string {
    if (this.mode === 'image') return this.instanceLabel;
    if (this.mode === 'video') {
      return this.pausedValue
        ? `${this.instanceLabel} · Paused`
        : this.instanceLabel;
    }
    const sceneName = this.activeSceneValue === 'cube' ? 'Cube' : 'Torus';
    return this.pausedValue
      ? `3D Demo · ${sceneName} · Paused`
      : `3D Demo · ${sceneName}`;
  }

  get mediaMode(): MediaPaneMode {
    return this.mode;
  }

  get paused(): boolean {
    return this.pausedValue;
  }

  get frameIndex(): number {
    return this.frameIndexValue;
  }

  get decodedFrameCount(): number {
    return this.decodedFrameCountValue;
  }

  get droppedFrameCount(): number {
    return this.droppedFrameCountValue;
  }

  get notice(): string | null {
    return this.noticeValue;
  }

  get activeScene(): MediaSceneKind {
    return this.activeSceneValue;
  }

  get workingSetBytes(): number {
    return (
      (this.framebuffer?.workingSetBytes ?? 0) +
      (this.videoStream?.workingSetBytes ?? 0)
    );
  }

  get residentVideoBufferCount(): number {
    return this.videoStream?.residentBufferCount ?? 0;
  }

  get bufferGeneration(): number {
    return this.framebuffer?.bufferGeneration ?? 0;
  }

  render(context: PaneRenderContext): StyledText {
    if (this.noticeValue) {
      this.pixelMount.clear();
      const unavailableLabel =
        this.mode === 'image' ? 'IMAGE UNAVAILABLE' : 'VIDEO UNAVAILABLE';
      const recovery =
        this.mode === 'image'
          ? ''
          : '\n\n  Install ffmpeg, then run\n  Media: Play Sample Video again.';
      return new StyledText([
        fg(context.palette.error)(
          `\n  ${unavailableLabel}\n\n  ${this.noticeValue}${recovery}\n`,
        ),
      ]);
    }
    if (this.mode !== 'image') this.scheduleNextFrame();
    const graphicsTier = context.graphicsTier ?? 'halfblock';
    const pixelEncoder = ImageRenderers.Class.encoderFor(graphicsTier);
    const screenColumn = context.screenColumn;
    const screenRow = context.screenRow;
    const projectsPixels =
      pixelEncoder !== null &&
      screenColumn !== undefined &&
      screenRow !== undefined;
    this.synchronizeDemoSupersampling(
      projectsPixels ? this.graphicsSupersamplingScale : 1,
    );
    const image = this.currentImage();
    if (!image) {
      this.pixelMount.clear();
      return new StyledText([
        fg(context.palette.dim)('\n  Loading sample video…\n'),
      ]);
    }
    if (
      !projectsPixels ||
      !pixelEncoder ||
      screenColumn === undefined ||
      screenRow === undefined
    ) {
      this.pixelMount.clear();
      if (this.framebuffer) return this.framebuffer.renderHalfBlocks();
      return HalfBlockRenderer.Class.render({
        image,
        columns: context.width,
        rows: context.height,
        panelBackground: context.palette.panel,
      }).styledText;
    }
    if (context.screenObscured) {
      this.pixelMount.clear();
    } else {
      this.pixelMount.sync({
        tier: graphicsTier,
        encoder: pixelEncoder,
        image,
        path: `media:${this.id}:${this.frameIndexValue}`,
        region: {
          x: screenColumn,
          y: screenRow,
          columns: context.width,
          rows: context.height,
        },
        panelBackground: context.palette.panel,
      });
    }
    return new StyledText([]);
  }

  protected synchronizeDemoSupersampling(supersamplingScale: number): void {
    if (
      !this.framebuffer ||
      !this.scene ||
      supersamplingScale === this.framebufferSupersamplingScale
    ) {
      return;
    }
    this.framebufferSupersamplingScale = supersamplingScale;
    this.framebuffer.resize(
      this.viewportColumns,
      this.viewportRows,
      supersamplingScale,
    );
    if (this.demoImage) {
      this.demoImage.width = this.framebuffer.width;
      this.demoImage.height = this.framebuffer.height;
      this.demoImage.rgba = this.framebuffer.rgba;
    }
    this.scene.render(
      this.framebuffer,
      Math.max(0, this.frameIndexValue) / this.options.framesPerSecond,
      this.requestedScene,
    );
  }

  protected currentImage(): DecodedImage | null {
    return this.demoImage ?? this.stillImage ?? this.videoImage;
  }

  protected scheduleNextFrame(): void {
    if (this.timer || this.pausedValue || this.disposed) return;
    const frameDurationMilliseconds = 1000 / this.options.framesPerSecond;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.advanceFrame();
    }, frameDurationMilliseconds);
  }

  protected async advanceFrame(): Promise<void> {
    if (this.pausedValue || this.disposed) return;
    const elapsedSeconds =
      (performance.now() - this.animationStartMilliseconds) / 1000;
    const targetFrameIndex = Math.max(
      this.frameIndexValue + 1,
      Math.floor(elapsedSeconds * this.options.framesPerSecond),
    );
    if (this.mode === 'demo' && this.framebuffer && this.scene) {
      this.frameIndexValue = targetFrameIndex;
      this.activeSceneValue = this.scene.render(
        this.framebuffer,
        elapsedSeconds,
        this.requestedScene,
      );
      this.renderRevision.value += 1;
      return;
    }
    const stream = this.videoStream;
    if (!stream) return;
    const frameAvailable = await stream.pullFrame(targetFrameIndex);
    if (this.disposed) return;
    if (!frameAvailable) {
      this.noticeValue =
        'ffmpeg stopped before it produced a complete video frame.';
      this.renderRevision.value += 1;
      return;
    }
    this.frameIndexValue = stream.decodedFrameIndex;
    this.decodedFrameCountValue = stream.decodedFrameCount;
    this.droppedFrameCountValue = stream.droppedFrameCount;
    if (this.videoImage) {
      this.videoImage.rgba = stream.showingFrame;
    } else {
      this.videoImage = {
        width: stream.width,
        height: stream.height,
        rgba: stream.showingFrame,
      };
    }
    this.renderRevision.value += 1;
  }

  protected restartVideo(): void {
    this.videoStream?.dispose();
    this.videoStream = null;
    this.videoImage = null;
    this.noticeValue = null;
    const pixelWidth = Math.max(1, this.viewportColumns);
    const pixelHeight = Math.max(2, this.viewportRows * 2);
    let stream: VideoFrameStream.Model | null | undefined;
    try {
      stream = this.options.createVideoStream?.(pixelWidth, pixelHeight);
    } catch (error) {
      this.noticeValue = `ffmpeg could not start: ${String(error)}`;
      return;
    }
    if (!stream) {
      this.noticeValue = 'ffmpeg was not found on PATH.';
      return;
    }
    this.videoStream = stream;
    this.frameIndexValue = -1;
    this.decodedFrameCountValue = 0;
    this.droppedFrameCountValue = 0;
    this.animationStartMilliseconds = performance.now();
  }

  togglePaused(): void {
    if (this.mode === 'image') return;
    this.pausedValue = !this.pausedValue;
    if (!this.pausedValue) {
      this.animationStartMilliseconds =
        performance.now() -
        (Math.max(0, this.frameIndexValue) / this.options.framesPerSecond) *
          1000;
      this.scheduleNextFrame();
    } else if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.renderRevision.value += 1;
  }

  selectScene(scene: MediaSceneKind | 'automatic'): void {
    if (this.mode !== 'demo' || !this.framebuffer || !this.scene) return;
    this.requestedScene = scene;
    this.activeSceneValue = this.scene.render(
      this.framebuffer,
      Math.max(0, this.frameIndexValue) / this.options.framesPerSecond,
      scene,
    );
    this.renderRevision.value += 1;
  }

  handleKey(key: KeyEvent): boolean {
    if (
      this.mode !== 'image' &&
      (key.name === 'space' || key.sequence === ' ')
    ) {
      this.togglePaused();
      return true;
    }
    if (this.mode === 'demo' && key.name === 'c') {
      this.selectScene('cube');
      return true;
    }
    if (this.mode === 'demo' && key.name === 't') {
      this.selectScene('torus');
      return true;
    }
    if (this.mode === 'demo' && key.name === 'a') {
      this.selectScene('automatic');
      return true;
    }
    return false;
  }

  onResize(columns: number, rows: number): void {
    const nextColumns = Math.max(1, columns);
    const nextRows = Math.max(1, rows);
    if (
      nextColumns === this.viewportColumns &&
      nextRows === this.viewportRows
    ) {
      return;
    }
    this.viewportColumns = nextColumns;
    this.viewportRows = nextRows;
    this.pixelMount.clear();
    if (this.framebuffer && this.scene) {
      this.framebuffer.resize(
        nextColumns,
        nextRows,
        this.framebufferSupersamplingScale,
      );
      if (this.demoImage) {
        this.demoImage.width = this.framebuffer.width;
        this.demoImage.height = this.framebuffer.height;
        this.demoImage.rgba = this.framebuffer.rgba;
      }
      this.activeSceneValue = this.scene.render(
        this.framebuffer,
        Math.max(0, this.frameIndexValue) / this.options.framesPerSecond,
        this.requestedScene,
      );
    } else if (this.mode === 'video') {
      this.restartVideo();
    }
    this.renderRevision.value += 1;
  }

  onFocus(): void {}

  onBlur(): void {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.videoStream?.dispose();
    this.videoStream = null;
    this.videoImage = null;
    this.pixelMount.dispose();
  }
}

export namespace MediaPaneContent {
  export const $Class = $MediaPaneContent;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export type MediaPaneMode = 'demo' | 'video' | 'image';

export interface MediaPaneOptions {
  readonly identifier: string;
  readonly label: string;
  readonly mode: MediaPaneMode;
  readonly columns: number;
  readonly rows: number;
  readonly framesPerSecond: number;
  readonly pixelTerminal: PixelMountTerminal;
  readonly loadImage?: () => DecodedImage | null;
  readonly createVideoStream?: (
    pixelWidth: number,
    pixelHeight: number,
  ) => VideoFrameStream.Model | null;
}
