// What this script finds out: how each candidate lavfi source for the demo
// "Sample Video" looks at the real pane resolution of the media pane.
//
// The media pane shows video with half blocks. One cell holds two pixels.
// A pane of 81 columns and 13 rows therefore shows 81 by 26 pixels. This
// script renders each candidate at that small size, and also at a larger
// maximised pane size, then writes PNG files. Each PNG is scaled up with
// nearest-neighbour, so one source pixel stays one visible block. What you
// see in the PNG is what the pane shows.
//
// Run it:
//   bun .invar/tasks/in-progress/350-nicer-generated-sample-video/candidate-350-render-sample-frames.ts <output-directory>
//
// How to read the output: for every candidate you get
//   <name>-<width>x<height>-t<seconds>.png
// Compare the files by eye. A good candidate keeps large shapes and strong
// colour at 81 by 26 pixels, and it changes between t0 and t3 without
// flicker. A candidate that only looks good at the large size is not good
// enough, because the small pane is the default.
//
// The script also prints the exit code of every ffmpeg run. A non-zero code
// means the source or the filter does not exist in this ffmpeg build.

const outputDirectory = process.argv[2];
if (!outputDirectory) {
  console.error('give an output directory as the first argument');
  process.exit(2);
}

const ffmpegPath = Bun.which('ffmpeg');
if (!ffmpegPath) {
  console.error('no ffmpeg on PATH');
  process.exit(2);
}

type Candidate = {
  name: string;
  // The lavfi input string. {W}, {H} and {R} stand for width, height and rate.
  source: string;
};

const candidates: Candidate[] = [
  { name: 'a-testsrc2-baseline', source: 'testsrc2=size={W}x{H}:rate={R}' },
  { name: 'b-mandelbrot', source: 'mandelbrot=size={W}x{H}:rate={R}' },
  {
    name: 'c-life',
    source:
      'life=size={W}x{H}:rate={R}:mold=10:ratio=0.1:death_color=#C83232:life_color=#00FF00',
  },
  { name: 'd-gradients', source: 'gradients=size={W}x{H}:rate={R}' },
  {
    name: 'e-gradients-hue',
    source: 'gradients=size={W}x{H}:rate={R},hue=H=2*PI*t/6',
  },
  {
    name: 'f-gradients-slow-3stop',
    source:
      'gradients=size={W}x{H}:rate={R}:c0=#1B2A6B:c1=#00B3A4:c2=#F2C14E:n=3:speed=0.02:type=radial',
  },
  {
    name: 'g-plasma-geq',
    source:
      'color=size={W}x{H}:rate={R}:color=black,' +
      "geq=r='128+120*sin((X/12)+T)':g='128+120*sin((Y/8)-T*1.3)':b='128+120*sin((X+Y)/16+T*0.7)'",
  },
  {
    name: 'h-cellauto',
    source: 'cellauto=size={W}x{H}:rate={R}:rule=110:random_fill=1:scroll=1',
  },
  {
    name: 'i-mandelbrot-zoom-hue',
    source:
      'mandelbrot=size={W}x{H}:rate={R}:maxiter=200:end_scale=0.02,hue=H=2*PI*t/8',
  },
  {
    name: 'j-gradients-radial-hue',
    source:
      'gradients=size={W}x{H}:rate={R}:type=radial:speed=0.05,hue=H=2*PI*t/10:s=1.4',
  },
];

// The two geometries: the default split pane, and a maximised pane.
const geometries = [
  { width: 81, height: 26 },
  { width: 118, height: 72 },
];
const rate = 15;
const captureSeconds = [0, 3];
const magnification = 8;

for (const candidate of candidates) {
  for (const geometry of geometries) {
    for (const seconds of captureSeconds) {
      const source = candidate.source
        .replaceAll('{W}', String(geometry.width))
        .replaceAll('{H}', String(geometry.height))
        .replaceAll('{R}', String(rate));
      const outputPath = `${outputDirectory}/${candidate.name}-${geometry.width}x${geometry.height}-t${seconds}.png`;
      const result = Bun.spawnSync(
        [
          ffmpegPath,
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          source,
          '-frames:v',
          '1',
          '-ss',
          String(seconds),
          '-vf',
          `scale=iw*${magnification}:ih*${magnification}:flags=neighbor`,
          outputPath,
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      const errorText = new TextDecoder().decode(result.stderr).trim();
      console.log(
        `${candidate.name} ${geometry.width}x${geometry.height} t${seconds}: exit ${result.exitCode}${errorText ? ` — ${errorText}` : ''}`,
      );
    }
  }
}
