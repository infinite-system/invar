#!/usr/bin/env bun
// Prints what OpenTUI reports about THIS terminal, plus the tier Invar would choose from it.
// Run it inside the terminal you actually use (cmux, tmux, kitty, …) — capabilities are a property
// of the live terminal, so they cannot be observed from another shell.
import { createCliRenderer } from '@opentui/core';
import { TerminalCapabilities } from '../src/modules/theme/TerminalCapabilities';

const renderer = await createCliRenderer({ exitOnCtrlC: false });
const reportOnce = (label: string): void => {
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
  process.stderr.write(
    `${label}: reported=${JSON.stringify(reported)} -> tier=${tier}\n` +
      `  env TERM=${process.env.TERM ?? 'unset'}` +
      ` TERM_PROGRAM=${process.env.TERM_PROGRAM ?? 'unset'}` +
      ` TMUX=${process.env.TMUX ? 'set' : 'unset'}` +
      ` KITTY_WINDOW_ID=${process.env.KITTY_WINDOW_ID ?? 'unset'}` +
      ` TUI_GRAPHICS_TIER=${process.env.TUI_GRAPHICS_TIER ?? 'unset'}\n`,
  );
};
reportOnce('at-start');
renderer.on('capabilities', () => reportOnce('after-probe'));
setTimeout(() => {
  reportOnce('final');
  renderer.destroy();
  process.exit(0);
}, 1500);
