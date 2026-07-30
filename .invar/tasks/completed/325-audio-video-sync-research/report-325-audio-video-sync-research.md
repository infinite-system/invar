# READY — audio and video synchronization research (#325)

State: READY

Branch: `fleet/325-audio-video-sync-research`

Commit: `209d7a0e7c76022a1661015d62b61f4932ec7c72`

Worktree: clean

## Result

The
[audio and video synchronization map](project-audio-video-sync-map.md)
is complete. It has 610 lines of machine evidence, upstream citations,
architecture comparisons, acceptance design, phasing, and user questions.

No product code or invariant record changed.

The map recommends a timestamped audio sidecar behind a new
`AudioPlaybackBackend` seam. The audio device clock owns playback time. The
video owner from
[terminal 3D demo and video playback (#324)](../324-terminal-3d-demo-and-video-playback/task-324-terminal-3d-demo-and-video-playback.md)
reads that media position once per render turn.

The clock attaches between #324's decoder output and its two reusable display
buffers. The selector shows the newest due frame. It drops older late frames
and holds the current buffer when the next frame is early.

This preserves #324's flyweight allocation rule, two-frame streaming ceiling,
and duration-independent memory. It adds no third video queue.

The map keeps media audio separate from
[TtsBackend](../../../../src/modules/narration/TtsBackend.interface.ts).
Narration owns interruptible utterances. Media playback owns continuous
timestamped PCM. The two features do not share a generator.

## Measured machine facts

The guest is Ubuntu 24.04 AArch64 under Parallels.

- PipeWire `1.0.5`, WirePlumber, and `pipewire-pulse` are active.
- The guest exposes one `HDA Intel` `Generic Analog` device.
- `pw-play`, `pw-cat`, `aplay`, GStreamer, Piper, and `espeak-ng` are present.
- `ffmpeg`, `ffplay`, `mpv`, `paplay`, and `pactl` are absent.
- The live narration backend reports
  `{"available":true,"engineName":"piper"}`.

The PipeWire graph reported 48 kHz and a 1,024-sample default quantum. One
graph cycle is 21.33 ms. The allowed 2,048-sample maximum is 42.67 ms.

I played a silent 205 ms WAV five times through each available client path:

| Path | Median start-to-drain | Time beyond media duration |
| --- | ---: | ---: |
| `pw-play`, default 100 ms request | 330 ms | 125 ms |
| `pw-play --latency=20ms` | 300 ms | 95 ms |
| `aplay -D default` | 330 ms | 125 ms |

These are process-start-to-drain measurements. They are not acoustic speaker
latency.

`pw-top` confirmed the requested 100 ms and 20 ms PipeWire stream shapes.
`aplay -D default` appeared as a PipeWire client with a 125 ms source quantum.

Direct `aplay -D hw:0,0` failed with:

```text
audio open error: Device or resource busy
```

PipeWire owned the virtual HDA device. The map rejects direct ALSA as the
default.

## Architecture findings

A normal `ffplay` process owns A/V sync, but it renders through SDL. A normal
`mpv` process also owns sync, but its CLI video outputs render themselves.
Neither normal CLI supplies synchronized raw frames to Invar through stdout.

The map therefore rejects “spawn mpv or ffplay and read its synchronized raw
frames” as incomplete.

GStreamer can make one-engine ownership real. Its audio sink can own the
clock, and `appsink` can provide video frames. Its appsink queue must be
limited to two frames with an old-frame drop policy.

That cohesive helper has the strongest built-in sync. It also has a larger
integration and dependency cost. The recommended first step keeps #324's
decoder and adds only the timestamped audio sidecar.

The map rejects an Invar wall clock as the master. The audio device and
terminal renderer advance on independent clocks. Long playback therefore
needs audio resampling or video correction. Reading the device clock removes
that extra policy.

The load model is not theoretical. The
[panel chrome agent close intermittent task (#214)](../../active/214-panel-chrome-agent-close-intermittent/task-214-panel-chrome-agent-close-intermittent.md)
records 28 pool-starvation events in one day. The proposed policy keeps audio
continuous and drops late video under load.

## Acceptance instrument

The map specifies a deterministic 10-second beep-and-flash fixture:

- five 10 ms, 1 kHz pulses at fixed media timestamps;
- five full-pane white flashes at the same timestamps;
- FrameProbe timestamps every completed white frame;
- the audio backend timestamps every pulse at the graph edge;
- every signed offset is printed and paired by media PTS.

The app-boundary target is one render period. At 30 FPS, that is ±33.33 ms.
The hard boundary also uses the cited ITU detectability range:

```text
-45 ms <= audio presentation - visual completion <= +125 ms
```

A planted 200 ms audio advance must fail and quote the measured pair.

The instrument also covers pause, resume, seek epochs, device loss, backend
exit, and decoder stall. It runs at `40x15` and `160x50`, for 10 and 100
seconds, under quiet and deterministic load.

The 100-second run must retain the same audio and video working set as the
10-second run. A planted retained-frame list must make the memory control red.

## Proposed phases

1. Prove the PipeWire clock protocol and the planted offset failure.
2. Add `AudioPlaybackBackend` and a deterministic virtual device clock.
3. Add the Linux PipeWire helper and attach it to #324's frame selector.
4. Add pause, seek epochs, device removal, and recovery.
5. Add native Core Audio or one cohesive GStreamer helper only after real use.

## Ranked open questions

1. Must the first implementation support only the Ubuntu Parallels guest, or
   also a native macOS build?
2. If audio fails, should playback stop or continue video-only after a
   persistent notice?
3. May Invar ship a small native PipeWire helper, or must it use installed
   command-line programs?
4. Does the first release support local files only, or also URLs and live
   streams?
5. Must arbitrary seek ship with the first audio release?
6. Should Invar expose one manual A/V offset for Parallels and terminal
   display delay?
7. Is playback speed other than 1.0 required?
8. Must the first release select among several audio tracks?
9. Is one app-boundary video period the target, with the ITU detectability
   range as the hard boundary?

The first three answers control the architecture. The next three control the
first implementation size.

## Verification

- `bun run drive --geometry 100x30` reached a settled default frame. Narration
  was disabled, and no video surface existed on this branch.
- Live backend construction reported Piper as available.
- Native PipeWire, low-latency PipeWire, ALSA-to-PipeWire, and direct ALSA
  probes completed.
- Ten graph-appearance probes observed `pw-play` after 6 to 14 ms.
- Link lint passed on the map.
- Flavored STE lint ran on the map. It reported 2.40 findings per 100 words.
- `git diff --check` passed.
- The invariant checker resolved 1,181 annotations and 223 lattice links with
  zero problems.
- Commit `209d7a0e7c76022a1661015d62b61f4932ec7c72` contains only the new map.

Full gate verdict:

```text
SKIP_GATE=1 — correct for this record-only research commit.
No product code, test, checker, or invariant record changed.
```

The pre-commit hook acknowledged the bypass:

```text
pre-commit: SKIP_GATE=1 — skipping the full merge-gate (bypass acknowledged).
```

## Bycatch

- **Comment and record drift:** the
  [narration invariant record](../../../../src/modules/narration/narration.invariants.md#a-missing-speech-engine-degrades-to-silence-never-an-error)
  and
  [SystemTtsBackend.ts](../../../../src/modules/narration/SystemTtsBackend.ts)
  say no speech engine is installed on this box. The live backend now reports
  Piper as available. `espeak-ng` is also installed. Two independent path and
  backend probes reproduced the disagreement. Not fixed.

