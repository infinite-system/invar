# Brief #451 round 1 — FfmpegVideoSource publishes a raw anchor

## In plain words

One class has static helpers but skips the wrapper that makes them
behave correctly for subclasses. Decide whether to anchor them or
delete them, and say which and why.

## Read first

The task file carries the sighting and the rule:
[task-451](task-451-ffmpeg-source-publishes-raw-anchor.md).

Then read the "Static() — the static-side sibling" section of
[the ivue skill](../../../../.claude/skills/ivue/SKILL.md) in full,
especially THE ANCHOR RULE. This is a small change whose whole value is
getting the rule right, so do not work from memory of it.

## The ladder — pick one and defend it

`src/modules/media/FfmpegVideoSource.ts` declares `locate` and
`sampleArgumentVector` as statics but publishes the raw
`$FfmpegVideoSource` anchor.

- **Rung 1 — delete the statics.** If nothing outside the class reads
  them, they become instance members and the class needs no anchor at
  all. #443 chose this five times out of six. Prefer it.
- **Anchor them** — `const $Class = Static($FfmpegVideoSource)` — only
  if something outside genuinely reads them or a subclass must be able
  to override them.

Enumerate every read of each static FIRST. The pair rule from #448
applies: a static produced at one site and matched at another must move
together, or a subclass produces values it cannot recognise, with no
type error and no test failure.

## One coupling to check

`sampleArgumentVector` sits on #448's rung-3 allowlist as a
deliberately fixed recipe. If your choice changes that row, update the
allowlist in the same change and say so. Leaving the allowlist
disagreeing with the code is the drift this task exists to remove.

## Invariants in scope

- [project.invariants.md](../../../../project.invariants.md) —
  `Public classes use the namespace pattern`. The task calls this a
  LIVE violation, not drift; confirm that reading or refute it.
- Also `Live static reads follow the receiving class` (landed with
  #443/#448). If you keep the statics, any self-read must follow the
  receiving class, not a pinned name.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy: runtime
defects, invariant violations in function, comment drift, distillation
possibilities, generator drift or introduced variance, plain nonsense.
Write the `## Bycatch` section even if it reads `None observed`.

## Verification

- Rerun #448's static-read census; the count must match your choice
  exactly, with no unexplained leftover.
- If you keep the statics and they are a live knob, add a subclass
  behaviour test that observes BEHAVIOUR, not the getter.
- `bun test` in FULL, not focused. `bunx tsc --noEmit`,
  `bash scripts/conventions-gate.sh`, invariant checker `--all --refs`.
- Drive the media path once to confirm nothing moved:
  `bun scripts/harness/smoke-animated-media-harness.ts`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## Scope boundary

Media only. Do NOT touch `src/modules/ui/` — #459 owns the panel
surfaces right now and a conflict there costs both tasks.

## End state

A report file in this folder opening with `## In plain words`, naming
the rung chosen with its reason, the read census, and the invariants
answered record by record.
