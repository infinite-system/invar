/**
 * Count real `PtyTestDriver` constructions during one smoke process without tracing child syscalls.
 * Run: bun --preload=./.invar/tasks/in-progress/484-per-file-smoke-reuse-experiment/484-runtime-boot-counter-preload.ts scripts/harness/smoke-activitybar-harness.ts
 * The final `HARNESS_RUNTIME_BOOT_COUNT` value is the number of Invar apps that smoke booted.
 */

import type { PtyTestDriverOptions } from '../../../../scripts/harness/PtyTestDriver';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

let runtimeBootCount = 0;

class $RuntimeBootCountingPtyTestDriver extends PtyTestDriver.$Class {
  constructor(options: PtyTestDriverOptions) {
    runtimeBootCount += 1;
    super(options);
  }
}

PtyTestDriver.Class = $RuntimeBootCountingPtyTestDriver;

process.on('exit', () => {
  console.log(`HARNESS_RUNTIME_BOOT_COUNT=${runtimeBootCount}`);
});
