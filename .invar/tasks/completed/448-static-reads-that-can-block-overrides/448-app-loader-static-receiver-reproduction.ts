/**
 * This script shows whether AppLoader.main follows a subclass receiver without swapping AppLoader.Class.
 * Run it with `bun .invar/tasks/in-progress/448-static-reads-that-can-block-overrides/448-app-loader-static-receiver-reproduction.ts`.
 * Before the fix it prints zero subclass fatal calls and one base exit call. After the fix those counts reverse.
 */
import { AppLoader } from '../../../../src/modules/app/AppLoader';

const originalArguments = process.argv;
const originalExit = process.exit;
const originalStderrWrite = process.stderr.write;
let subclassFatalCalls = 0;
let baseExitCalls = 0;

class $ReceiverProbe extends AppLoader.$Class {
  static override handleFatal(): void {
    subclassFatalCalls += 1;
  }
}

process.argv = [
  originalArguments[0] as string,
  originalArguments[1] as string,
  'plugin',
  'unknown-action',
  'probe-target',
];
process.exit = ((code?: string | number | null): never => {
  baseExitCalls += 1;
  throw new Error(`base exit called with ${String(code)}`);
}) as typeof process.exit;
process.stderr.write = (() => true) as typeof process.stderr.write;

try {
  await $ReceiverProbe.main();
} catch {
  // The temporary process.exit replacement throws so this script can survive the base fatal path.
} finally {
  process.argv = originalArguments;
  process.exit = originalExit;
  process.stderr.write = originalStderrWrite;
}

console.log(`subclass fatal calls: ${subclassFatalCalls}`);
console.log(`base exit calls: ${baseExitCalls}`);
