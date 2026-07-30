# 325 — RESEARCH: sound synced with video in Invar — approaches + tradeoffs (map, no implementation)

State: IN-PROGRESS
Engine: codex
Model: 5.6-sol
Effort: high
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> then next research project to the agent work how to have sound sync
> with video, what's the best possible ways and tradeoff of each in
> alignment with our needs

## Scope — RESEARCH ONLY, #311-style map; zero product code

Deliverable: a written map (project-audio-video-sync-map.md in this
task folder) the implementation task builds from. Ground every claim:
cite sources for ecosystem facts; MEASURE on this machine what is
measurable (latency probes are cheap); name Invar's actual seams.

Cover:

1. **Audio output paths from a terminal app on our stack** (Ubuntu VM +
   macOS host relevant): PulseAudio/PipeWire native clients, ALSA,
   spawning a player (ffplay/mpv/paplay/espeak precedent — the agent
   narration feature already uses espeak-ng: name that seam and what it
   teaches), latency and device-ownership tradeoffs of each. Note the
   VM boundary: guest audio -> host speakers quality/latency.
2. **Sync architectures**: (a) mux-side sync — let one external process
   (mpv/ffplay) own BOTH streams and Invar only renders its video
   frames via pipe (who owns the clock?); (b) Invar as the clock —
   decode video in-process/via ffmpeg pipe, audio to a native client,
   A/V drift correction (drop/dup frames vs resample); (c) audio-only
   sidecar with timestamps. For each: drift behaviour under load (our
   pool-starvation census PROVES load spikes happen), pause/seek
   complexity, failure modes when audio device is absent.
3. **Terminal-rendering coupling**: frame pacing vs audio clock when
   the renderer is cell-based (#324's framebuffer) — what sync
   tolerance is perceptible (cite lipsync research thresholds,
   ~±45-125ms).
4. **Alignment with our needs**: rank by (i) fits the plugin/capability
   seams, (ii) degrades loudly-and-gracefully (no device, no ffmpeg,
   VM without audio), (iii) testability in the PTY harness (how do you
   ASSERT sync? A deterministic beep-and-flash fixture with a
   measurable offset is the acceptance instrument — design it), (iv)
   implementation cost.
5. **Recommendation + phasing** with an explicit out-of-scope boundary,
   and the ranked open questions the user answers before implementation.

## Acceptance

Map committed (record-only, SKIP_GATE correct); READY report summarises
the recommendation and the user-facing questions. The user reviews
before any implementation task is dispatched.
