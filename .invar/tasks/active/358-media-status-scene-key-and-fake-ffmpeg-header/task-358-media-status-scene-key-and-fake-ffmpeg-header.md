# #358 — media status publishes a stale scene key; fake-ffmpeg header drift

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #350 (two small items)

1. Nonsense status: mediaScene="cube" is published while the pane shows
   VIDEO (mediaMode="video"). The key names a 3D demo scene that is not
   running — suspect an unconditional default publish rather than
   per-mode. Fix: publish the scene key only in demo mode (or null it).
2. Comment drift: the fake ffmpeg header in
   scripts/harness/smoke-media-harness.ts says it "emits deterministic
   raw RGBA frames" but omits that it also models the -y overwrite
   refusal (#336). Update the header.
