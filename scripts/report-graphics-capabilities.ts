#!/usr/bin/env bun
// Prints what OpenTUI reports about THIS terminal, plus the tier Invar would choose from it.
// Run it inside the terminal you actually use (cmux, tmux, kitty, …) — capabilities are a property
// of the live terminal, so they cannot be observed from another shell.
//
// WHY IT BUFFERS INSTEAD OF PRINTING AS IT GOES: creating a renderer enters the ALTERNATE SCREEN
// (\e[?1049h), and tearing it down restores the primary screen (\e[?1049l) — which discards
// everything written while inside it. The first version of this script printed each observation
// immediately and the reader saw NOTHING at all, which looked like a broken script rather than a
// wiped screen. So every line is collected, and nothing is emitted until the renderer is gone: to a
// FILE unconditionally (survives any screen restore) and to the restored terminal with a synchronous
// write (no buffered stream that exit could drop).
import { writeFileSync, writeSync } from 'node:fs';
import { createCliRenderer } from '@opentui/core';
import { TerminalCapabilities } from '../src/modules/theme/TerminalCapabilities';

const reportFilePath = '/tmp/invar-graphics-report.txt';
const probeWindowMilliseconds = 3000;
const collectedReportLines: string[] = [];
let capabilitiesEventCount = 0;

const renderer = await createCliRenderer({ exitOnCtrlC: false });

const collectObservation = (label: string): void => {
  const capabilities = renderer.capabilities as
    | { kitty_graphics?: boolean; sixel?: boolean; multiplexer?: string }
    | undefined;
  const reported = capabilities
    ? {
        kitty_graphics: capabilities.kitty_graphics === true,
        sixel: capabilities.sixel === true,
        multiplexer: String(capabilities.multiplexer ?? 'unknown'),
      }
    : null;
  const tier = TerminalCapabilities.Class.detectGraphicsTier(reported);
  collectedReportLines.push(
    `${label}: reported=${JSON.stringify(reported)} -> tier=${tier}`,
  );
};

collectObservation('at-start');
renderer.on('capabilities', () => {
  capabilitiesEventCount = capabilitiesEventCount + 1;
  collectObservation(`after-probe-reply-${capabilitiesEventCount}`);
});

setTimeout(() => {
  collectObservation('final');
  // THE LOAD-BEARING DIAGNOSTIC. A silent probe and a probe answered "no kitty" are different
  // failures with different fixes: silence means the multiplexer swallowed the query (so the
  // halfblock floor is the only safe answer), while an answered "no" means the terminal genuinely
  // lacks the protocol. Without this line the two are indistinguishable in the output.
  collectedReportLines.push(
    capabilitiesEventCount === 0
      ? `probe: NO capabilities reply arrived within ${probeWindowMilliseconds}ms — the query was swallowed or unanswered`
      : `probe: ${capabilitiesEventCount} capabilities reply/replies arrived — the query reached a terminal that answered`,
  );
  collectedReportLines.push(
    `env TERM=${process.env.TERM ?? 'unset'}` +
      ` TERM_PROGRAM=${process.env.TERM_PROGRAM ?? 'unset'}` +
      ` TMUX=${process.env.TMUX ? 'set' : 'unset'}` +
      ` KITTY_WINDOW_ID=${process.env.KITTY_WINDOW_ID ?? 'unset'}` +
      ` TUI_GRAPHICS_TIER=${process.env.TUI_GRAPHICS_TIER ?? 'unset'}`,
  );

  renderer.destroy();

  const reportText = `${collectedReportLines.join('\n')}\n`;
  writeFileSync(reportFilePath, reportText);
  // One event-loop turn so the renderer's own screen-restore bytes land before ours; then a
  // synchronous write to the real fd, which cannot be dropped by process.exit.
  setTimeout(() => {
    writeSync(
      1,
      `\n== Invar graphics capability report ==\n${reportText}(also saved to ${reportFilePath})\n`,
    );
    process.exit(0);
  }, 50);
}, probeWindowMilliseconds);
