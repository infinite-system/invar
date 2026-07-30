# Brief — #325: RESEARCH map — sound synced with video in Invar

USER-DIRECTED RESEARCH, #311-style map, ZERO product code. Read first:
[task-325-audio-video-sync-research.md](task-325-audio-video-sync-research.md)
— his verbatim words and the record's five numbered areas GOVERN.

## Work discipline

- Deliverable: a map file named project-audio-video-sync-map (a new .md IN THE TASK FOLDER).
  Record-only commit (SKIP_GATE with a written verdict is correct for a
  map; quote the verdict in the report).
- Ground every ecosystem claim with a citation; MEASURE what is
  measurable on THIS machine (audio path latency probes are cheap —
  run them, quote numbers). Name Invar's actual seams by file path
  (the espeak-ng narration seam exists — find it and cite it).
- #324 is IN FLIGHT building video WITHOUT audio (its record forbids
  sound improvisation and its rendering invariants are: flyweight
  buffers, double-buffer streaming ceiling, memory flatness). Your
  recommendation must compose with those invariants and name where the
  audio clock attaches to that pipeline.
- Rank by the record's four alignment criteria (plugin seams, loud
  graceful degradation, PTY-harness testability, cost). Design the
  acceptance instrument: the deterministic beep-and-flash fixture with
  measurable offset.
- End with recommendation + phasing + ranked open questions FOR THE
  USER — he reviews before any implementation task exists.

## Invariants in scope

None to modify (research-only). Cite: narration seam, terminal/render
records read-only, #324's rendering invariants as stated in its record.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; `## Bycatch` section
required even if `None observed`.

## End state (mechanical)

READY report summarising recommendation + user questions; map file
committed in the task folder; no product code changed.
