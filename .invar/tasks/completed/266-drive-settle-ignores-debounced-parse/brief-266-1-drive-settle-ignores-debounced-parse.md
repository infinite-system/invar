# Brief — #266: the drive's settled frame still shows "Parsing Markdown…"

Read first: `.invar/tasks/in-progress/266-drive-settle-ignores-debounced-parse/task-266-*.md`.

One paragraph: `bun run drive --open README.md` prints a settled grid that
still shows "Parsing Markdown…" (`markdownParsing=true`) — the
settled-frame condition excludes debounced work. Harmless to a human; a
trap for any grid assertion against the settled print (the retry-flake
shape). Fix at the instrument: either the settle waits for declared
quiescence keys (small registry: `markdownParsing=false` when the key
exists — the wait-for-status pattern), or the settled print NAMES the
still-pending keys so the frame is honest. Do not widen any timeout; a
wait must be a condition. Positive control: a drive against a large
markdown file must show the difference (pending-named before, quiescent
after).

Since filing, TWO more instances of the same class landed in reports —
your fix should cover or explicitly scope them:
- #238: the boot frame shows the structure pane's "No file is open."
  headline for ~30ms before the debounced first refresh (the settled-boot
  print catches it). If your quiescence keys cover the structure refresh,
  that transient leaves the settled print too.
- #270 (filed, not dispatched): a settled frame showed the preview one
  revision behind the source; the markdown record lists that under
  Impossible-if-true. Your fix likely makes #270's reproduction impossible
  — if so, SAY SO in the report with the evidence; the conductor closes
  #270 with it. Do not edit the markdown record yourself unless your
  instrument work proves which reading is true.

## Invariants in scope

- [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md) — the settled-frame contract;
  the drive tool's records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## End state (mechanical)

READY report in the task folder: the chosen mechanism (quiescence registry
or named-pending print — or both, argued), the positive control quoted,
the #238/#270 coverage stated, green `bun test` + the harness smokes. The
conductor gates at landing.
