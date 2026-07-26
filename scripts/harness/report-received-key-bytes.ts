#!/usr/bin/env bun
// A RAW-KEY REPORTER meant to be run INSIDE the integrated terminal by the keyboard pass-through
// smoke. It puts its tty in raw mode (so no signal, echo, or line discipline intervenes) and appends
// every byte it receives to a file, one hex-pair line per read. The smoke then diffs those bytes
// against the bytes a real terminal would have sent for the chord it drove — which is the only honest
// way to answer "does the user's keystroke reach the child process".
//
// Raw mode is what makes Ctrl+C / Ctrl+Z / Ctrl+\ observable as BYTES instead of signals, so the
// sweep can cover them without killing the reporter.
//
// Usage (from inside the app's terminal pane): bun scripts/harness/report-received-key-bytes.ts <out>
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
import { appendFileSync, writeFileSync } from 'node:fs';

const outputPath = process.argv[2];
if (!outputPath) {
  process.stderr.write('usage: report-received-key-bytes.ts <output-path>\n');
  process.exit(2);
}

writeFileSync(outputPath, '');
process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.on('data', (receivedChunk: Buffer) => {
  const hexPairs = [...receivedChunk]
    .map((byteValue) => byteValue.toString(16).padStart(2, '0'))
    .join(' ');
  appendFileSync(outputPath, `${hexPairs}\n`);
  process.stdout.write(`got ${hexPairs}\r\n`);
});
// The READY marker is what the smoke WAITS ON before driving a single chord — the wait observes the
// same file the assertions read, never a sleep.
appendFileSync(outputPath, 'ready\n');
process.stdout.write('KEYBYTES-READY\r\n');
