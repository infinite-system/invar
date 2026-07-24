# Terminal emulator recorded fixtures

These streams were captured on 2026-07-24 from the real OpenTUI app through
`PtyTestDriver` at 80×24 on branch `feat-emulator-conformance-corpus`, based on
`origin/main` `a01c576`.

- `boot` is the dark-theme stream through the first ready frame.
- `keypress-diff` is the output emitted by pressing F1 after that boot; its test
  replays `boot` first, then the diff.
- `light-theme` is a fresh boot with user settings `{ "theme": "light",
  "glyphMode": "unicode" }`.

Each `.base64` file is the captured byte stream. Its `.expected.json` companion
pins all text rows and the cursor, plus one representative cell for every
distinct foreground/background/attribute/width signature in that grid.

Re-record from the repository root:

```sh
bun scripts/harness/record-terminal-emulator-fixtures.ts
bun test src/modules/terminal/TerminalEmulatorConformance.test.ts
```

Review the expected-grid diff before committing it. A changed recording is
evidence that OpenTUI's emitted dialect or the visible frame changed; it is not
an automatic baseline update.
