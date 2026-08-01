import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import type { StatusSnapshot } from '../system/StatusChannel';
import type { PaneContent } from '../ui/PaneContent.interface';
import type {
  PaneRuntime,
  PaneRuntimeHostPort,
  PaneRuntimeRequest,
} from '../ui/PaneRuntime.interface';
import type { PixelMountTerminal } from '../image/PixelImageMount';
import { FfmpegVideoSource } from './FfmpegVideoSource';
import {
  MediaPaneContent,
  type MediaPaneMode,
  type MediaPaneOptions,
} from './MediaPaneContent';
import { VideoFrameStream } from './VideoFrameStream';

// invariant: Animated media is a removable runtime plugin (src/modules/media/media.invariants.md)
// invariant: Missing ffmpeg is loud and harmless (src/modules/media/media.invariants.md)
// invariant: Plugin boundaries grant one authority (project.invariants.md)
class $MediaPlugin implements ApplicationContributor, PaneRuntime {
  readonly identifier = 'media';
  readonly name = 'Animated Media';
  readonly kind = 'media';
  readonly instanceLabel = '3D Demo';
  readonly offeredInPanelAddMenu = true;
  protected application: ApplicationContributionContext | null = null;
  protected hostPort: PaneRuntimeHostPort | null = null;
  protected disposeCommands: (() => void) | null = null;
  protected disposeStatusProjection: (() => void) | null = null;
  protected ffmpegPath: string | null = null;
  protected readonly panes = new Map<string, MediaPaneContent.Model>();

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    this.ffmpegPath = this.findFfmpeg();
    this.hostPort = context.registerPaneRuntime(this);
    context.registerKeybindings([
      {
        chord: { key: 'space' },
        action: 'media.togglePlayback',
        context: 'media',
      },
      {
        chord: { key: 'c' },
        action: 'media.showCube',
        context: 'media',
      },
      {
        chord: { key: 't' },
        action: 'media.showTorus',
        context: 'media',
      },
      {
        chord: { key: 'a' },
        action: 'media.automaticScene',
        context: 'media',
      },
    ]);
    this.disposeCommands = context.commands.registerAll([
      {
        id: 'media.openDemo',
        title: 'Media: Open 3D Cube and Torus Demo',
        category: 'Media',
        run: () => this.openMode('demo'),
      },
      {
        id: 'media.openVideo',
        title: 'Media: Play Generated Sample Video',
        category: 'Media',
        run: () => this.openMode('video'),
      },
      {
        id: 'media.togglePlayback',
        title: 'Media: Play or Pause',
        category: 'Media',
        when: () => this.currentPane() !== null,
        run: () => this.currentPane()?.togglePaused(),
      },
      {
        id: 'media.showCube',
        title: 'Media: Show Cube Scene',
        category: 'Media',
        when: () => this.currentPane()?.mediaMode === 'demo',
        run: () => this.currentPane()?.selectScene('cube'),
      },
      {
        id: 'media.showTorus',
        title: 'Media: Show Torus Scene',
        category: 'Media',
        when: () => this.currentPane()?.mediaMode === 'demo',
        run: () => this.currentPane()?.selectScene('torus'),
      },
      {
        id: 'media.automaticScene',
        title: 'Media: Alternate Cube and Torus',
        category: 'Media',
        when: () => this.currentPane()?.mediaMode === 'demo',
        run: () => this.currentPane()?.selectScene('automatic'),
      },
    ]);
    this.disposeStatusProjection =
      context.statusProjectionContributions.register({
        snapshot: () => this.statusSnapshot(),
      });
  }

  protected findFfmpeg(): string | null {
    return FfmpegVideoSource.Class.locate();
  }

  protected openMode(mode: MediaPaneMode): void {
    const application = this.application;
    if (!application) return;
    const isVideo = mode === 'video';
    application.openRuntimePane('media', {
      identifier: isVideo ? 'media-video' : 'media-demo',
      label: isVideo ? 'Sample Video' : '3D Demo',
      heading: isVideo ? 'Sample Video' : '3D Demo',
      columns: 80,
      rows: 24,
      workingDirectory: application.workspaceSet.active.root,
    });
  }

  createPane(request: PaneRuntimeRequest): PaneContent {
    const application = this.application;
    if (!application) throw new Error('The media runtime is not activated');
    if (this.panes.has(request.identifier)) {
      throw new Error(
        `Media pane identifier already belongs to another session: ${request.identifier}`,
      );
    }
    const mode: MediaPaneMode = request.identifier.includes('video')
      ? 'video'
      : 'demo';
    const pane = this.buildPane({
      identifier: request.identifier,
      label: request.label,
      mode,
      columns: request.columns,
      rows: request.rows,
      framesPerSecond: 15,
      pixelTerminal: this.pixelTerminal(application),
      createVideoStream:
        mode === 'video'
          ? (pixelWidth, pixelHeight) =>
              this.createVideoStream(pixelWidth, pixelHeight)
          : undefined,
    });
    this.panes.set(pane.id, pane);
    return pane;
  }

  // invariant: Construction goes through overridable seams (project.invariants.md)
  protected buildPane(options: MediaPaneOptions): MediaPaneContent.Model {
    return new MediaPaneContent.Class(options);
  }

  protected createVideoStream(
    pixelWidth: number,
    pixelHeight: number,
  ): VideoFrameStream.Model | null {
    if (!this.ffmpegPath) return null;
    return new VideoFrameStream.Class(
      new FfmpegVideoSource.Class(this.ffmpegPath, pixelWidth, pixelHeight, 15),
      pixelWidth,
      pixelHeight,
    );
  }

  protected pixelTerminal(
    application: ApplicationContributionContext,
  ): PixelMountTerminal {
    return {
      writePayload: (data) => {
        (
          application.renderer as unknown as {
            writeOut(chunk: string): boolean;
          }
        ).writeOut(`\x1b[?2026h${data}\x1b[?2026l`);
      },
      afterFramesSettled: () => application.renderer.idle(),
      cellPixelSize: () => {
        const resolution = application.renderer.resolution;
        if (
          !resolution ||
          application.renderer.width <= 0 ||
          application.renderer.height <= 0
        ) {
          return null;
        }
        return {
          width: resolution.width / application.renderer.width,
          height: resolution.height / application.renderer.height,
        };
      },
    };
  }

  paneRemoved(content: PaneContent): void {
    this.panes.delete(content.id);
  }

  currentPane(): MediaPaneContent.Model | null {
    const pane = this.hostPort?.currentPane() ?? null;
    return pane instanceof MediaPaneContent.Class ? pane : null;
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const pane = this.currentPane();
    return {
      mediaFfmpegAvailable: this.ffmpegPath !== null,
      mediaMode: pane?.mediaMode ?? null,
      mediaPaused: pane?.paused ?? false,
      mediaFrameIndex: pane?.frameIndex ?? -1,
      mediaScene: pane?.activeScene ?? null,
      mediaNotice: pane?.notice ?? null,
      mediaWorkingSetBytes: pane?.workingSetBytes ?? 0,
      mediaResidentVideoBufferCount: pane?.residentVideoBufferCount ?? 0,
      mediaBufferGeneration: pane?.bufferGeneration ?? 0,
      mediaDecodedFrameCount: pane?.decodedFrameCount ?? 0,
      mediaDroppedFrameCount: pane?.droppedFrameCount ?? 0,
    };
  }

  disposeApplication(): void {
    this.disposeCommands?.();
    this.disposeCommands = null;
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    const paneIdentifiers = [...this.panes.keys()];
    for (const paneIdentifier of paneIdentifiers) {
      this.hostPort?.releasePane(paneIdentifier);
    }
    this.panes.clear();
    this.hostPort?.dispose();
    this.hostPort = null;
    this.ffmpegPath = null;
    this.application = null;
  }
}

export namespace MediaPlugin {
  export const $Class = $MediaPlugin;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
