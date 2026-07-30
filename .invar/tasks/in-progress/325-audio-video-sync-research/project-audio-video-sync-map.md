# Audio and video synchronization map

Date: 2026-07-29

Task: [Audio and video synchronization research (#325)](task-325-audio-video-sync-research.md)

Status: research complete. No product code or invariant record changed.

## Decision

Use the audio device clock as the playback clock. Invar should schedule video
against that clock. It should never ask audio and video to follow separate wall
clocks.

The first implementation should add a timestamped audio sidecar behind a new
`AudioPlaybackBackend` seam. The sidecar should:

- accept bounded PCM chunks with media timestamps;
- own the platform audio stream;
- report the played media position and device delay;
- support start, pause, flush, seek epoch, stop, and dispose;
- report device loss and underruns as typed events.

The video owner from
[terminal 3D demo and video playback (#324)](../324-terminal-3d-demo-and-video-playback/task-324-terminal-3d-demo-and-video-playback.md)
should read that position once per render turn. It should show the newest
decoded frame due at that position. It should drop older late frames and hold
the current frame when the next frame is early.

This attaches the clock at the boundary between #324's decoder pipe and its two
reused display buffers. It does not add a third frame queue. Audio buffering is
also bounded by a declared duration. Playback length must not increase either
working set.

Do not extend
[TtsBackend](../../../../src/modules/narration/TtsBackend.interface.ts).
Narration produces interruptible utterances. Media playback produces a
continuous timestamped sample stream. The generators differ.

The existing narration code still supplies three useful patterns:

- one backend interface in
  [TtsBackend.interface.ts](../../../../src/modules/narration/TtsBackend.interface.ts);
- one construction seam in
  [TtsFactory.ts](../../../../src/modules/narration/TtsFactory.ts);
- guarded process ownership and loud capability state in
  [SystemTtsBackend.ts](../../../../src/modules/narration/SystemTtsBackend.ts).

## 1. What exists on this machine

The measurements below ran inside the task's Ubuntu guest. The guest is Ubuntu
24.04 on AArch64. `systemd-detect-virt` returned `parallels`.

### Installed paths

| Item | Observed result |
| --- | --- |
| PipeWire | `1.0.5`, active |
| WirePlumber | active |
| PulseAudio compatibility server | `pipewire-pulse`, active |
| Default sink | `Built-in Audio Analog Stereo` |
| Guest ALSA hardware | `HDA Intel`, `Generic Analog` |
| Native PipeWire tools | `pw-play`, `pw-cat`, `pw-top`, `pw-cli` |
| ALSA tools | `aplay`, `arecord`, `speaker-test` |
| PulseAudio tools | `paplay` and `pactl` absent |
| Media players | `ffmpeg`, `ffplay`, and `mpv` absent |
| GStreamer | `1.24.2` tools and `appsink` present |
| GStreamer audio sinks | PipeWire, PulseAudio, and ALSA present |
| Narration engines | `piper` and `espeak-ng` present |

`wpctl status` showed one PipeWire ALSA sink and one source. It also showed the
virtual HDA device. WirePlumber documents `wpctl status` as the live graph and
device view. Its test guide names `pw-play`, `paplay`, and `aplay -D pipewire`
as the native, PulseAudio-compatible, and ALSA-compatible client paths.
[WirePlumber wpctl reference](https://pipewire.pages.freedesktop.org/wireplumber/tools/wpctl.html)
and
[WirePlumber client-path guide](https://pipewire.pages.freedesktop.org/wireplumber/resources/testing.html)

The current narration backend reported:

```text
{"available":true,"engineName":"piper"}
```

Four Piper models were present. `SystemTtsBackend` therefore selects Piper and
then `aplay`. This is a live change from the narration record's 2026-07-23
machine evidence.

### Measured PipeWire timing

The PipeWire graph metadata reported:

```text
clock.rate=48000
clock.quantum=1024
clock.min-quantum=1024
clock.max-quantum=2048
```

The default graph cycle is therefore `1024 / 48000 = 21.33 ms`. The allowed
maximum is `42.67 ms`.

I generated a silent 205 ms, 22,050 Hz mono WAV with `espeak-ng`. Five
start-to-drain runs gave these wall times:

| Client path | Runs in seconds | Median | Median beyond media duration |
| --- | --- | --- | --- |
| `pw-play`, default 100 ms request | 0.33, 0.34, 0.31, 0.33, 0.34 | 330 ms | 125 ms |
| `pw-play --latency=20ms` | 0.30, 0.27, 0.31, 0.31, 0.30 | 300 ms | 95 ms |
| `aplay -D default` | 0.35, 0.33, 0.33, 0.33, 0.31 | 330 ms | 125 ms |

These numbers are process-start-to-stream-drain measurements. They are not
speaker acoustic latency. They include client startup, graph connection,
buffering, guest output, and drain.

`pw-top` showed these live stream shapes:

```text
pw-play default: source quantum 2205 / 22050 = 100.00 ms
pw-play 20 ms:   source quantum  441 / 22050 =  20.00 ms
sink cycle:      1024 / 48000 = 21.33 ms at the 20 ms request
ALSA default:    source quantum 2756 / 22050 = 125.0 ms
```

A polling probe observed the `pw-play` node in the PipeWire graph after 6 to
14 ms across ten runs. This is an observation upper bound. It includes one
`pw-cli` poll.

PipeWire exposes the value needed for real synchronization.
`pw_stream_get_time_n()` returns a stream time snapshot. Its `delay` covers the
path through filters, hardware, and configured offsets. Its `ticks` supply the
graph timeline and expose discontinuities from underruns.
[PipeWire stream API](https://docs.pipewire.org/group__pw__stream.html) and
[PipeWire time model](https://docs.pipewire.org/structpw__time.html)

The native implementation must use that API. A `pw-play` child does not return
the same timing data to Invar.

### Device ownership result

`aplay -D default` succeeded and appeared as a PipeWire client. Direct
`aplay -D hw:0,0` failed:

```text
audio open error: Device or resource busy
```

PipeWire owned the virtual HDA device during the probe. The ALSA `hw` plugin
talks to the kernel device without conversion. ALSA exposes playback delay,
pause, drop, and drain for an open PCM handle.
[ALSA PCM interface](https://www.alsa-project.org/alsa-doc/alsa-lib/pcm.html),
[ALSA PCM operations](https://www.alsa-project.org/alsa-doc/alsa-lib/group___p_c_m.html),
and
[ALSA hardware plugin](https://www.alsa-project.org/alsa-doc/alsa-lib/pcm_plugins.html)

Direct ALSA would fight the desktop audio server for this device. It would
also bypass the user's PipeWire routing and mixing. It is not a suitable
default.

### The VM boundary

The guest sees a virtual HDA card. Parallels maps a virtual sound card to a
named physical host output. The host can also disconnect or mute the virtual
sound device.
[Parallels Desktop 20 command reference](https://download.parallels.com/desktop/v20/docs/en_US/Parallels%20Desktop%20Command-Line%20Reference.pdf)
and
[Parallels sound-device guide](https://download.parallels.com/stm/docs/en/Parallels_Desktop_Users_Guide.pdf)

The measured PipeWire values cover the guest path. They do not cover the final
Parallels bridge, macOS mixer, speaker, or terminal display. A production
offset setting and a real host calibration probe remain necessary.

If Invar later runs natively on macOS, the corresponding backend should use
Core Audio timing. Apple exposes the running device clock, playback timelines,
pause and reset controls, and output presentation latency.
[Core Audio device time](https://developer.apple.com/documentation/coreaudio/audiodevicegetcurrenttime%28_%3A_%3A%29),
[Audio Queue Services](https://developer.apple.com/documentation/audiotoolbox/audio-queue-services),
and
[output presentation latency](https://developer.apple.com/documentation/avfaudio/avaudionode/outputpresentationlatency)

## 2. Audio output path map

Scores run from 1 to 5. A higher cost score means lower implementation cost.
The four criteria have equal weight in this table.

| Rank | Output path | Plugin seam | Loud degradation | PTY testability | Cost | Finding |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | Native PipeWire client behind a sidecar | 5 | 5 | 5 | 3 | Best Ubuntu path. It exposes the graph clock and total delay. |
| 2 | PulseAudio client on `pipewire-pulse` | 5 | 5 | 4 | 3 | Good compatibility path. It adds a protocol layer and its tools are absent here. |
| 3 | Native Core Audio backend | 5 | 5 | 3 | 2 | Best future native macOS path. It does not help the guest build directly. |
| 4 | GStreamer sidecar with `pipewiresink` | 4 | 5 | 5 | 2 | Best one-engine option. It adds a media framework dependency and control helper. |
| 5 | Spawn `pw-play`, `paplay`, or `aplay` | 4 | 4 | 3 | 5 | Cheap prototype. Child exit and bytes-written do not prove presentation time. |
| 6 | ALSA `default` client | 4 | 4 | 3 | 3 | Works here through PipeWire. It gives less direct graph timing. |
| 7 | Direct ALSA `hw` | 3 | 2 | 3 | 2 | Device ownership conflicts already reproduced. Reject as a default. |

PipeWire's Pulse protocol is a complete PulseAudio server compatibility layer.
Normal Pulse clients use the original client library.
[PipeWire Pulse protocol](https://docs.pipewire.org/devel/page_module_protocol_pulse.html)

PulseAudio clients can request an overall latency through
`PA_STREAM_ADJUST_LATENCY`. Lower buffers trade latency for more underruns.
[PulseAudio buffer attributes](https://www.freedesktop.org/software/pulseaudio/doxygen/structpa__buffer__attr.html)

This makes PulseAudio a valid fallback backend. It does not make `paplay` a
clock source, because the subprocess interface still hides stream timing.

## 3. Synchronization architectures

### A. One external engine owns both streams

The sound device clock is the master. One media engine demuxes and decodes both
streams. It plays audio and releases video frames at their media timestamps.

`ffplay` already uses audio as its default master clock and drops late video
frames. It renders through SDL, so it does not expose decoded frames to Invar.
[ffplay sync options](https://www.ffmpeg.org/ffplay.html#Advanced-options) and
[ffplay description](https://www.ffmpeg.org/ffplay.html#Description)

`mpv` also defaults to timing video from audio. Its normal CLI video outputs
paint their own window, terminal, image files, or embedded render target.
`libmpv` is the recommended embedding API. A normal stdout raw-frame video
output is not present.
[mpv video synchronization](https://mpv.io/manual/master/#video-sync),
[mpv video outputs](https://mpv.io/manual/master/#video-output-drivers), and
[libmpv embedding](https://mpv.io/manual/master/#embedding-into-other-programs-libmpv)

Therefore, “spawn mpv or ffplay and read synchronized frames from a pipe” is
not a complete architecture. The player can own synchronization or give Invar
raw frames through its CLI. These programs do not provide both properties
together.

GStreamer makes this architecture real. An audio sink can provide a
sample-accurate clock. `appsink` gives the application raw video samples. Its
queue must set an explicit buffer limit and drop policy, because the default
queue is unbounded.
[GStreamer audio-sink design](https://gstreamer.freedesktop.org/documentation/additional/design/audiosinks.html),
[GStreamer clocked sinks](https://gstreamer.freedesktop.org/documentation/base/gstbasesink.html),
and
[GStreamer appsink](https://gstreamer.freedesktop.org/documentation/app/appsink.html)

For #324, set the appsink queue to at most two frames. Drop the oldest frame
when full. Pull into the two buffers that #324 already owns. Never retain a
`GstSample` after its pixels enter the reusable buffer.

Under load, the audio sink continues. The video sink drops late frames before
they can accumulate. Pause and seek stay coherent because one pipeline owns
both streams. Device absence becomes a pipeline error that the plugin must
translate into a persistent video-only notice.

This has the best built-in sync. It has the highest integration cost. A
purpose-built GStreamer helper needs a control channel for pause, seek, stream
selection, device loss, and timing. `gst-launch-1.0` alone is not that helper.

### B. Invar wall time owns both streams

Invar starts a monotonic media epoch. It schedules video frames and pushes PCM
according to that epoch.

This looks simple but creates two clocks. The audio device consumes samples at
its own physical rate. The terminal renderer advances on event-loop and
terminal cadence. Their rates will differ.

The correction choices are:

- drop or repeat video against the audio clock;
- resample audio against the video or wall clock;
- make discontinuous audio drops or inserts.

`mpv` documents the same trade. Its audio mode drops or repeats video. Its
display-resample modes resample audio, and some modes drop video or audio to
correct drift.
[mpv sync mode tradeoffs](https://mpv.io/manual/master/#video-sync)

If Invar reads the audio device position and follows it, this design is no
longer “Invar as the clock.” Invar becomes the scheduler and audio becomes the
clock. That is the recommended reduction.

Under load, a wall-clock design either starves audio or lets video fall late.
The repository has already recorded 28 pool-starvation events in one day in
[panel chrome agent close intermittent (#214)](../../active/214-panel-chrome-agent-close-intermittent/task-214-panel-chrome-agent-close-intermittent.md).
A sync design must treat load spikes as normal input.

Pause requires freezing the media epoch and the audio stream at the same
boundary. Seek requires flushing all audio, invalidating both video buffers,
starting a new epoch, and rejecting every old-epoch decode result.

This architecture has the highest custom sync cost. Do not choose it while a
device clock is available.

### C. Timestamped audio sidecar

An audio sidecar owns the audio stream and returns clock snapshots. #324 keeps
its video decoder and frame buffers. The video owner follows the sidecar's
played media position.

This keeps one new authority narrow:

```text
decoder PTS + PCM
        │
        ├── AudioPlaybackBackend sidecar → device clock snapshot
        │
        └── #324 two video buffers
                                  │
device media position ────────────┘ → choose, drop, hold → terminal frame
```

Under load, audio playback remains continuous. The display may skip frames,
but it returns to the correct media position on the next render. It never
plays a late queue in fast motion.

Pause stops consumption and preserves one media position. Seek creates a new
integer epoch. The implementation flushes PCM, clears both reusable frame
states, seeks the decoder, and rejects every response from the old epoch.

If the device disappears, the backend emits `unavailable`. The video owner
can continue on a monotonic fallback clock only after it shows a persistent
“Video only: audio output unavailable” notice. It must not imply that playback
is synchronized.

This architecture fits #324 with the smallest replacement surface. It also
lets a later GStreamer or libmpv backend replace both decoder and audio without
changing the framebuffer or pane.

### D. Plain audio player sidecar

The cheapest form spawns `pw-play`, `paplay`, or `aplay` and estimates media
position from bytes written.

This is suitable for a spike only. Pipe buffering means bytes written are not
bytes heard. Process start and exit do not expose the device clock or delay.
The local measurements showed 95 to 125 ms beyond the 205 ms media duration.

Pause usually means a signal or process restart. Seek means killing and
restarting the player. Device loss appears as child exit or a stuck pipe. A
test can assert process control, but it cannot assert presentation sync.

Do not ship this as the final clock source.

## 4. Terminal rendering and perceptual bounds

ITU-R BT.1359 reports average detectability thresholds of 45 ms when sound
leads vision and 125 ms when sound lags vision. It reports wider acceptability
thresholds of 90 ms and 185 ms.
[ITU-R BT.1359](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1359-0-199802-S%21%21PDF-E.pdf)

Define signed offset as:

```text
offset = audio presentation time - completed visual-frame time
```

A negative value means audio leads the flash. A positive value means audio
lags the flash.

The product target should be one render period in either direction at the
measured app boundary. At 30 frames per second, that is ±33.33 ms. The hard
acceptance boundary should also stay inside the cited detectability window:

```text
-45 ms <= offset <= +125 ms
```

The app boundary ends when FrameProbe observes a complete synchronized
terminal frame. It does not include terminal display scanout. The audio
boundary ends at the backend's reported graph edge. It does not include the
Parallels host path or speaker travel.

The implementation should expose a user calibration offset. Apply it once at
the video-selection boundary. Do not mutate file timestamps or add delay in
several layers.

At 30 frames per second, one video choice occurs every 33.33 ms. The audio
graph on this guest currently runs every 21.33 ms. The selector must use media
timestamps, not frame numbers. Variable-frame-rate video makes frame ordinals
invalid.

When the renderer misses a deadline:

- keep audio continuous;
- select the newest due decoded frame;
- discard every older due frame;
- keep the displayed buffer when the next frame is early;
- request no catch-up renders for discarded frames.

That policy composes with #324's flyweight buffers, two-frame streaming
ceiling, and memory flatness. Repeating a displayed frame reuses a buffer. It
does not duplicate pixels.

## 5. Acceptance instrument

The acceptance instrument is a deterministic beep-and-flash fixture. It must
cross the real PTY video path and the selected audio backend path.

### Fixture

Generate a 10-second media source during the test. Do not commit a binary.

- Use 48 kHz signed 16-bit PCM.
- Put a 10 ms, 1 kHz pulse at 1, 3, 5, 7, and 9 seconds.
- Show a full-pane white flash at the same five media timestamps.
- Keep every other video frame black.
- Put the media PTS in a small visual corner marker for diagnosis.
- Add one deliberately offset variant with audio advanced by 200 ms.

The fixture generator must be deterministic and bounded. If it uses FFmpeg,
the absent-FFmpeg control must run first and show the same notice as the
product.

### Observation

FrameProbe records the monotonic completion time for each white frame. The
audio probe records the graph-edge presentation time for each pulse.

For a native PipeWire backend, use `pw_stream_get_time_n()` and the stream
delay. For the hermetic backend, consume the same PCM chunks through a
deterministic virtual device clock. Do not infer audio time from bytes written
to a child pipe.

Pair pulse and flash events by their media PTS. Print every signed offset, not
only a pass verdict:

```text
pts=1.000 audio=... visual=... offset_ms=...
```

The contract requires:

- all five pairs observed;
- no duplicate or reordered pair;
- each app-boundary offset within one render period;
- each offset inside `-45 ms` to `+125 ms`;
- no growth trend across the five offsets;
- zero video buffers beyond #324's two-buffer ceiling;
- bounded audio duration in flight;
- no completed blank interior frame.

The 200 ms planted offset must fail and quote the measured pair. This is the
positive control.

### Pause and seek arms

At 4.25 seconds, pause for an observed condition. Do not use a fixed sleep.
Require:

- audio media position holds;
- the current video buffer holds;
- buffered audio does not continue beyond the declared pause allowance;
- resume keeps the next pair within the same bounds.

At the next observed 5-second pair, seek to 1 second. Require:

- a new epoch;
- no old-epoch pulse or frame after the seek;
- the 1-second pair appears again;
- the first post-seek pair meets the same offset bounds.

### Failure arms

Run each failure through the real plugin notice:

- audio device absent;
- backend helper absent;
- FFmpeg absent;
- audio device removed during playback;
- backend process exits during playback;
- decoder stalls while audio continues.

The pane must stay usable. It must say whether playback is stopped or
video-only. Silence without a notice fails.

### Load and scale arms

Run the same fixture at default settings in these conditions:

| Axis | Small | Large |
| --- | --- | --- |
| Pane geometry | `40x15` | `160x50` |
| Playback duration | 10 seconds | 100 seconds |
| Host load | quiet | deterministic render and worker pressure |

Compare the five-event offset sequence, drop sequence, audio underruns, video
buffer count, audio buffered duration, and memory. Do not reduce the result to
an average.

The 100-second arm must use the same working set as the 10-second arm. A
planted retained-frame list must make the memory-flatness control fail. This
reuses #324's required leak polarity.

## 6. Alignment ranking

This table ranks complete synchronization architectures. A higher cost score
again means lower cost.

| Rank | Architecture | Plugin seam | Loud degradation | PTY testability | Cost | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | Timestamped audio sidecar, video follows device clock | 5 | 5 | 5 | 3 | Recommended first implementation |
| 2 | One GStreamer media helper with audio sink and bounded appsink | 5 | 5 | 5 | 2 | Best cohesive engine, larger dependency |
| 3 | Embedded `libmpv` | 4 | 5 | 4 | 1 | Strong player, awkward CPU-frame extraction |
| 4 | Invar wall-clock scheduler with audio resampling | 4 | 4 | 4 | 1 | Too much custom clock and resampler policy |
| 5 | Spawned player with estimated position | 4 | 4 | 2 | 5 | Prototype only |
| 6 | Direct ALSA device | 3 | 2 | 3 | 2 | Reject |

The first two ranks can share one `AudioPlaybackBackend` contract. The
sidecar is the smaller first step. A cohesive media helper can later move
demux and decode below the same plugin without changing the video surface.

## 7. Phasing

### Phase 0: protocol spike

Build no product surface.

1. Prove a PipeWire client can return media position and total delay.
2. Feed deterministic PCM and verify pause, flush, and device-loss events.
3. Prove the beep probe can observe the planted 200 ms failure.
4. Decide how one FFmpeg decode exposes both PCM and timestamped video without
   an unbounded extra pipe.

Stop if the clock snapshot cannot share a monotonic time base with FrameProbe.
That is a fatal protocol result, not a reason to estimate time from bytes.

### Phase 1: backend seam and mock

Add the new plugin-owned `AudioPlaybackBackend`. Add its deterministic virtual
clock backend. Keep narration unchanged.

Ratchet:

- bounded audio in flight;
- epoch reset;
- pause and dispose;
- missing backend notice;
- planted offset control.

### Phase 2: Linux PipeWire backend

Add the native helper. Make PipeWire timing authoritative. Attach it at #324's
frame-selection boundary.

Drive the quiet, loaded, small, large, 10-second, and 100-second arms. Prove
the two video buffers and flat memory.

### Phase 3: pause, seek, and device recovery

Add shared epoch transitions. Add device removal and reappearance. Keep
video-only continuation an explicit user choice if audio cannot resume.

### Phase 4: macOS native backend or cohesive media helper

Choose one after real use:

- native Core Audio for a native macOS Invar build;
- one GStreamer helper if unified demux, decode, clock, and stream selection
  reduce the total implementation;
- `libmpv` only if a spike proves bounded CPU-frame delivery without graphics
  readback or image-file output.

## 8. Out of scope

The first implementation must not add:

- audio recording or microphone capture;
- network streaming or live broadcast synchronization;
- Bluetooth-specific compensation;
- surround output or passthrough codecs;
- audio effects, equalization, or volume normalization;
- subtitle synchronization;
- time stretching for playback speed;
- pitch-preserving resampling;
- a macOS native backend while Invar runs only in the Linux guest;
- reuse of the narration backend for media PCM;
- a second video frame queue;
- a silent fallback when audio is unavailable.

## 9. Ranked open questions for the user

1. **Required first host.** Is the first implementation only for Invar inside
   the Ubuntu Parallels guest, or must a native macOS build ship in the same
   task?
2. **Fallback policy.** When audio fails, should playback stop, or continue
   video-only after a persistent notice?
3. **Dependency policy.** May Invar ship a small native PipeWire helper, or
   must it use installed command-line programs only?
4. **Media scope.** Does the first release need local files only, or also URLs
   and live streams?
5. **Pause and seek scope.** Is exact pause plus arbitrary seek required in the
   first release, or can seek follow in phase 3?
6. **Calibration.** Should Invar expose one manual A/V offset setting for the
   Parallels and terminal display path?
7. **Playback speed.** Is any speed other than 1.0 required? A yes answer adds
   resampling policy and changes the first backend contract.
8. **Audio tracks.** Must the first release select among several audio tracks,
   or may it use the source default?
9. **Quality target.** Is one app-boundary video period the accepted target,
   with the ITU detectability window as the hard boundary?

The first three answers control the architecture. The next three control the
first implementation size.

## Bycatch

- **Comment and record drift:** the
  [narration invariant record](../../../../src/modules/narration/narration.invariants.md#a-missing-speech-engine-degrades-to-silence-never-an-error)
  and the header in
  [SystemTtsBackend.ts](../../../../src/modules/narration/SystemTtsBackend.ts)
  say no speech engine is installed on this box. The live backend now reports
  `available=true` and `engineName=piper`. `espeak-ng` is also installed. This
  reproduced in two independent path and backend probes. Not fixed.

