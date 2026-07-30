// probe-media-ffmpeg.ts — reproduce the app's exact video path with the real ffmpeg.
// Runs FfmpegVideoSource (fifo + spawn + nonblocking reads) at a realistic pane size
// and reports whether complete frames arrive. Run: bun tmp/probe-media-ffmpeg.ts
// Reading: "frame N ok" lines mean the app path works; an early "FAILED" with the
// subprocess exit code reproduces the user's "ffmpeg stopped" notice.
import { FfmpegVideoSource } from '../src/modules/media/FfmpegVideoSource';

const ffmpegPath = Bun.which('ffmpeg');
if (!ffmpegPath) {
  console.log('FAILED: no ffmpeg on PATH');
  process.exit(1);
}
console.log(`ffmpeg: ${ffmpegPath}`);

// Realistic pane: 120 columns x 24 rows -> 120x48 pixels (half-blocks), 15fps.
const width = 120;
const height = 48;
const source = new FfmpegVideoSource.Class(ffmpegPath, width, height, 15);
const frameBytes = width * height * 4;
const target = new Uint8Array(frameBytes);

let ok = 0;
for (let frame = 0; frame < 10; frame++) {
  const complete = await source.readFrameInto(target);
  if (!complete) {
    console.log(
      `FAILED at frame ${frame}: readFrameInto returned false (this is the "ffmpeg stopped" path)`,
    );
    break;
  }
  ok++;
  console.log(`frame ${frame} ok (${frameBytes} bytes)`);
}
console.log(
  ok === 10 ? 'APP PATH OK: 10 complete frames' : `only ${ok} frames`,
);
source.dispose();
