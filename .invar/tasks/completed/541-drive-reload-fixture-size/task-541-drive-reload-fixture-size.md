# 541 — drive reload fixture size

Priority: architecture-hygiene
State: COMPLETED — 333720c5 (landed with #522)
Engine: claude
Environment: linux
Model: fable-5
Effort: low

## In plain words

Reloading the warm drive server with a new fixture size keeps the old
workspace. The flag looks accepted but does nothing. Make reload honor
the size or refuse loudly.

## Evidence (from #540 bycatch, 2026-08-11, seen once)

- `bun run drive -- --reload --size 10` kept the server's original
  100,000-line workspace; screen still showed scale-100000.txt. A fresh
  server with --size 10 produced the correct fixture.

## Outline

Make --reload rebuild the fixture when --size differs (or refuse with
"stop and re-serve to change size" — a silent no-op flag is the defect).
Both polarities: reload-with-new-size lands in the new fixture; a
planted silent-no-op fails the check.
