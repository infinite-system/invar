#!/usr/bin/env bun
// Stress the descriptor lifetime that the double-close race corrupts.
//
// The defect: the read stream closes the descriptor it was handed even with
// autoClose:false, from an I/O thread. The master then has two closers, and
// whichever loses the race closes a NUMBER that a later allocation already
// owns. So the victim is a DIFFERENT OpenPty than the one being disposed.
//
// The shape that exposes it: keep several instances alive, dispose one while
// constructing another, and require every survivor's descriptor to still be
// valid. A construction that throws is also a hit (that is the reported
// signature). Report a count, never a boolean, so a zero can be distinguished
// from a probe that never ran.
//
// Usage: bun stress-openpty-descriptors.ts <treeRoot> [rounds] [liveCount]

const treeRoot = process.argv[2];
const roundCount = Number(process.argv[3] ?? 400);
const liveCount = Number(process.argv[4] ?? 6);
if (!treeRoot) {
  console.error('usage: stress-openpty-descriptors.ts <treeRoot> [rounds]');
  process.exit(2);
}

const { OpenPty } = await import(`${treeRoot}/src/modules/terminal/OpenPty.ts`);

let constructionFailureCount = 0;
let statusFlagFailureCount = 0;
let survivorInvalidCount = 0;
let observedRoundCount = 0;
const distinctErrors = new Map<string, number>();

function recordError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  distinctErrors.set(message, (distinctErrors.get(message) ?? 0) + 1);
}

const liveInstances: Array<{ instance: any; identifier: number }> = [];

for (let round = 0; round < roundCount; round += 1) {
  observedRoundCount += 1;
  let created: any = null;
  try {
    created = new OpenPty.Class(80, 24);
    // Registering the data callback is the exact path that both establishes the
    // read stream and re-applies the blocking status flags.
    created.onData(() => {});
  } catch (error) {
    // A construction/registration throw IS the reported failure signature.
    constructionFailureCount += 1;
    recordError(error);
    created = null;
  }
  if (created) liveInstances.push({ instance: created, identifier: round });

  // Every surviving instance must still hold a usable descriptor. Reading the
  // slave descriptor getter is cheap and throws once the value is released;
  // writing a byte exercises the write path's own status-flag handling.
  for (const survivor of liveInstances) {
    try {
      void survivor.instance.slaveFileDescriptor;
      survivor.instance.write('.');
    } catch (error) {
      survivorInvalidCount += 1;
      recordError(error);
    }
  }

  // Dispose the oldest once the window is full, so a close always overlaps
  // other live instances rather than happening in isolation.
  if (liveInstances.length > liveCount) {
    const retired = liveInstances.shift();
    try {
      retired?.instance.close();
    } catch (error) {
      statusFlagFailureCount += 1;
      recordError(error);
    }
  }
  // Yield so the I/O thread's close can interleave with the next construction.
  await Bun.sleep(0);
}

for (const remaining of liveInstances) {
  try {
    remaining.instance.close();
  } catch (error) {
    statusFlagFailureCount += 1;
    recordError(error);
  }
}

const totalFailureCount =
  constructionFailureCount + statusFlagFailureCount + survivorInvalidCount;

console.log(`tree:                   ${treeRoot}`);
console.log(`rounds observed:        ${observedRoundCount}`);
console.log(`construction failures:  ${constructionFailureCount}`);
console.log(`close failures:         ${statusFlagFailureCount}`);
console.log(`survivor invalid:       ${survivorInvalidCount}`);
console.log(`TOTAL failures:         ${totalFailureCount}`);
for (const [message, count] of distinctErrors) {
  console.log(`  ${count}x ${message}`);
}
