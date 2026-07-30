import {
  closeSync,
  constants,
  mkdtempSync,
  openSync,
  read,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Processes, type SpawnedProcess } from '../system/Processes';
import type { VideoFrameSource } from './VideoFrameSource.interface';

// invariant: A streaming producer can outrun the display (src/modules/media/media.invariants.md)
// invariant: Missing ffmpeg is loud and harmless (src/modules/media/media.invariants.md)
class $FfmpegVideoSource implements VideoFrameSource {
  protected readonly subprocess: SpawnedProcess<'ignore', 'ignore', 'ignore'>;
  protected readonly readFileDescriptor: number;
  protected readonly pipeDirectory: string;
  protected disposed = false;

  constructor(
    ffmpegPath: string,
    width: number,
    height: number,
    framesPerSecond = 15,
  ) {
    const pipeDirectory = mkdtempSync(join(tmpdir(), 'invar-media-'));
    this.pipeDirectory = pipeDirectory;
    const pipePath = join(pipeDirectory, 'video.rgba');
    const makePipeResult = Bun.spawnSync(['mkfifo', pipePath], {
      stdout: 'ignore',
      stderr: 'pipe',
    });
    if (makePipeResult.exitCode !== 0) {
      rmSync(pipeDirectory, { recursive: true, force: true });
      throw new Error(
        `could not create the video pipe: ${new TextDecoder()
          .decode(makePipeResult.stderr)
          .trim()}`,
      );
    }
    try {
      this.readFileDescriptor = openSync(
        pipePath,
        constants.O_RDWR | constants.O_NONBLOCK,
      );
    } catch (error) {
      rmSync(pipeDirectory, { recursive: true, force: true });
      throw error;
    }
    try {
      this.subprocess = Processes.Class.spawn(
        FfmpegVideoSource.Class.sampleArgumentVector(
          ffmpegPath,
          width,
          height,
          framesPerSecond,
          pipePath,
        ),
        {
          stdin: 'ignore',
          stdout: 'ignore',
          stderr: 'ignore',
        },
      );
    } catch (error) {
      closeSync(this.readFileDescriptor);
      rmSync(pipeDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  static locate(): string | null {
    return Bun.which('ffmpeg');
  }

  static sampleArgumentVector(
    ffmpegPath: string,
    width: number,
    height: number,
    framesPerSecond: number,
    outputPath = '-',
  ): string[] {
    const pixelWidth = Math.max(1, Math.floor(width));
    const pixelHeight = Math.max(2, Math.floor(height));
    const frameRate = Math.max(1, Math.floor(framesPerSecond));
    return [
      ffmpegPath,
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      // A morphing Mandelbrot set, not a zooming one. Every zooming variant
      // ends in a flat or speckled frame once the detail is finer than one
      // pane pixel. Holding the scale and morphing keeps large shapes and
      // strong colour at the pane sizes this player uses.
      `mandelbrot=size=${pixelWidth}x${pixelHeight}:rate=${frameRate}` +
        ':maxiter=150:start_scale=1.4:end_scale=1.4:morphamp=0.3',
      '-an',
      '-threads',
      '1',
      '-pix_fmt',
      'rgba',
      '-f',
      'rawvideo',
      outputPath,
    ];
  }

  async readFrameInto(target: Uint8Array): Promise<boolean> {
    let targetOffset = 0;
    while (targetOffset < target.length && !this.disposed) {
      let bytesRead = 0;
      try {
        bytesRead = await new Promise<number>((resolve, reject) => {
          read(
            this.readFileDescriptor,
            target,
            targetOffset,
            target.length - targetOffset,
            null,
            (error, completedBytesRead) => {
              if (error) reject(error);
              else resolve(completedBytesRead);
            },
          );
        });
      } catch (error) {
        if (this.disposed) return false;
        if ((error as NodeJS.ErrnoException).code !== 'EAGAIN') throw error;
        if (this.subprocess.exitCode !== null) return false;
        await Bun.sleep(1);
        continue;
      }
      if (bytesRead === 0) return false;
      targetOffset += bytesRead;
    }
    return targetOffset === target.length;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      closeSync(this.readFileDescriptor);
    } catch {
      // The descriptor already closed after an ffmpeg failure.
    }
    this.subprocess.kill();
    rmSync(this.pipeDirectory, { recursive: true, force: true });
  }
}

export namespace FfmpegVideoSource {
  export const $Class = $FfmpegVideoSource;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
