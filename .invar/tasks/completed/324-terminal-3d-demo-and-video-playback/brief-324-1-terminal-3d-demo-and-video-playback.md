# Brief — #324: terminal 3D demo + sample video playback

USER-DIRECTED. Read first:
[task-324-terminal-3d-demo-and-video-playback.md](task-324-terminal-3d-demo-and-video-playback.md)
— his verbatim words GOVERN; the record's four design arms are the work.

## Work discipline

- Suggested split, ONE COMMIT each, all `(#324)`: (1) cell framebuffer
  surface + capability routing, (2) 3D scenes + command entry, (3)
  video playback. Full gate through the enforcing hook on the final
  commit minimum; NO SKIP_GATE product commits.
- REUSE the existing pixel/image capability machinery for tier
  detection (image-preview owns it) — census it first and cite the
  seam in the report; do not duplicate detection.
- #320/#321 are IN FLIGHT on the terminal pane render path (DEC 2026
  honoring + theme palette). You are NOT touching the terminal pane —
  the demo/video render in their own pane surface. Emit DEC 2026
  brackets around your own frames regardless (harmless where
  unsupported). If you find yourself editing the same files as the
  fidelity bundle, STOP and report the collision instead of racing it.
- Plugin-shaped: core-untouched polarity proven the Vue way — a
  removal build (plugin off) leaves zero dangling references; assert
  it the way #312's report did.
- Video: ffmpeg DETECTED loudly (present → plays; absent → loud
  graceful notice, positive control both arms); the sample fixture is
  GENERATED deterministically (ffmpeg synth source or drawn frames) —
  no binary blobs committed. VIDEO ONLY — no audio improvisation
  (#325 owns sound research).
- Acceptance drives per the record: animation frame capture with zero
  blank-frame flashes; pane resize mid-animation clean (no crash, no
  smear); play/pause; both glyph tiers where chrome is involved.

## Invariants in scope

image/pixel-capability records, render-loop records, plugin/module
records (removability), terminal records ONLY as a reader (no edits —
collision rule above).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report with per-arm evidence (frame captures quoted, removal
build output, ffmpeg both-polarity control), commit hashes,
GATE_EXIT=0 through the enforcing hook. The conductor gates at landing
and completes the record.
