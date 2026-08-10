import { expect, test } from 'bun:test';
import { OpenPtyBackend } from './OpenPtyBackend';

test('the live backend publishes its plain construction seam', () => {
  expect(OpenPtyBackend.Class).toBe(OpenPtyBackend.$Class);
});

test('the live backend gives task arguments and environment to its shell', async () => {
  const backend = new OpenPtyBackend.Class({
    shell: '/bin/sh',
    command: '/bin/sh',
    arguments: [
      '-lc',
      'printf "TASK_LAUNCH:%s:%s\\n" "$1" "$TASK_CAPABILITY"',
      'task-shell',
      "argument with ' quote",
    ],
    environment: {
      TASK_CAPABILITY: 'present',
    },
  });
  let output = '';
  backend.onData((bytes) => {
    output += new TextDecoder().decode(bytes);
  });

  try {
    const deadline = performance.now() + 5_000;
    while (!output.includes("TASK_LAUNCH:argument with ' quote:present")) {
      if (performance.now() >= deadline) {
        throw new Error(`Timed out waiting for task output: ${output}`);
      }
      await Bun.sleep(5);
    }
    expect(output).toContain("TASK_LAUNCH:argument with ' quote:present");
  } finally {
    backend.kill();
  }
});
