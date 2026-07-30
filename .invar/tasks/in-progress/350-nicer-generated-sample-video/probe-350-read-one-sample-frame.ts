// What this script finds out: whether the real FfmpegVideoSource can read a
// complete frame of the generated sample through its named pipe, and how long
// the first frame takes. It drives the same class the media pane uses, so a
// source that renders in a file but stalls in the pipe shows up here.
//
// Run it:
//   bun .invar/tasks/in-progress/350-nicer-generated-sample-video/probe-350-read-one-sample-frame.ts [width] [height] [output.png]
//
// How to read the output: it prints one line per frame with the milliseconds
// since the source started and the count of non-black pixels. A frame that
// never arrives prints "no frame" and means the pipeline stalls. Times of a
// few hundred milliseconds are normal; seconds mean the source is too slow
// for the 15 frames per second pane.
//
// With an output path it also writes the fifth frame as a PNG, straight from
// the bytes the class read. Compare that PNG with the pane capture: a picture
// that is straight here but sheared on screen puts the fault in the pane
// paint, not in the decode.

import { FfmpegVideoSource } from '../../../../src/modules/media/FfmpegVideoSource';

const width = Number(process.argv[2] ?? 81);
const height = Number(process.argv[3] ?? 26);
const ffmpegPath = FfmpegVideoSource.Class.locate();
if (!ffmpegPath) {
  console.error('no ffmpeg on PATH');
  process.exit(2);
}

const source = new FfmpegVideoSource.Class(ffmpegPath, width, height, 15);
const frame = new Uint8Array(width * height * 4);
const startMilliseconds = Bun.nanoseconds() / 1e6;
try {
  for (let frameNumber = 1; frameNumber <= 5; frameNumber += 1) {
    const complete = await source.readFrameInto(frame);
    if (!complete) {
      console.log(`frame ${frameNumber}: no frame`);
      break;
    }
    let litPixelCount = 0;
    for (let offset = 0; offset < frame.length; offset += 4) {
      if (frame[offset] || frame[offset + 1] || frame[offset + 2])
        litPixelCount += 1;
    }
    console.log(
      `frame ${frameNumber}: ${Math.round(Bun.nanoseconds() / 1e6 - startMilliseconds)} ms, ${litPixelCount} lit pixels of ${width * height}`,
    );
  }
  const picturePath = process.argv[4];
  if (picturePath) {
    const rasterPath = `${picturePath}.rgba`;
    await Bun.write(rasterPath, frame);
    const result = Bun.spawnSync([
      'ffmpeg',
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pixel_format',
      'rgba',
      '-video_size',
      `${width}x${height}`,
      '-i',
      rasterPath,
      '-vf',
      'scale=iw*8:ih*8:flags=neighbor',
      picturePath,
    ]);
    console.log(`picture ${picturePath}: exit ${result.exitCode}`);
  }
} finally {
  source.dispose();
}
