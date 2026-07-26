// Graphics-tier detection over the REAL env matrix (the truecolor-detection lesson: env-branching
// detection ships inverted unless every branch is pinned by a test). The precedence under test:
// forced env override → positive OpenTUI report → multiplexer floor without a positive report →
// remaining reported result → env heuristics when no report exists → half-block floor. A positive
// report is the terminal's own answer and is never second-guessed by multiplexer or env guesses.
// invariant: Graphics tier prefers the reported capability and degrades to cells (src/modules/theme/theme.invariants.md)
import { afterEach, expect, test } from 'bun:test';
import {
  TerminalCapabilities,
  type GraphicsTier,
  type ReportedGraphicsCapabilities,
} from './TerminalCapabilities';

const managedKeys = [
  'TUI_GRAPHICS_TIER',
  'TMUX',
  'TERM',
  'KITTY_WINDOW_ID',
  'TERM_PROGRAM',
] as const;
type ManagedKey = (typeof managedKeys)[number];
const originalValues = new Map<ManagedKey, string | undefined>(
  managedKeys.map((key) => [key, process.env[key]]),
);

function detectWithEnvironment(
  environment: Partial<Record<ManagedKey, string>>,
  reported: ReportedGraphicsCapabilities | null,
): GraphicsTier {
  for (const key of managedKeys) {
    if (environment[key] === undefined) delete process.env[key];
    else process.env[key] = environment[key];
  }
  return TerminalCapabilities.Class.detectGraphicsTier(reported);
}

afterEach(() => {
  for (const [key, value] of originalValues) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const reportedAll: ReportedGraphicsCapabilities = {
  kitty_graphics: true,
  sixel: true,
  multiplexer: 'none',
};
const reportedSixelOnly: ReportedGraphicsCapabilities = {
  kitty_graphics: false,
  sixel: true,
  multiplexer: 'none',
};
const reportedNone: ReportedGraphicsCapabilities = {
  kitty_graphics: false,
  sixel: false,
  multiplexer: 'none',
};

test('the reported capabilities decide the tier: kitty over sixel over half-block', () => {
  expect(detectWithEnvironment({}, reportedAll)).toBe('kitty');
  expect(detectWithEnvironment({}, reportedSixelOnly)).toBe('sixel');
  expect(detectWithEnvironment({}, reportedNone)).toBe('halfblock');
});

test('a report beats contradicting env hints in both directions', () => {
  // Env screams kitty but the terminal reports no graphics: believe the terminal.
  expect(
    detectWithEnvironment(
      { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1' },
      reportedNone,
    ),
  ).toBe('halfblock');
  // Env is silent but the terminal reports sixel: believe the terminal.
  expect(
    detectWithEnvironment({ TERM: 'xterm-256color' }, reportedSixelOnly),
  ).toBe('sixel');
});

test('reported kitty through a multiplexer remains kitty', () => {
  expect(
    detectWithEnvironment(
      { TMUX: '/tmp/tmux-1000/default,123,0' },
      reportedAll,
    ),
  ).toBe('kitty');
  expect(
    detectWithEnvironment(
      {},
      { kitty_graphics: true, sixel: true, multiplexer: 'tmux' },
    ),
  ).toBe('kitty');
  expect(
    detectWithEnvironment(
      {},
      { kitty_graphics: true, sixel: true, multiplexer: 'screen' },
    ),
  ).toBe('kitty');
});

test('a multiplexer without a reported rich capability stays at half-block', () => {
  expect(
    detectWithEnvironment(
      { TMUX: '/tmp/tmux-1000/default,123,0' },
      reportedNone,
    ),
  ).toBe('halfblock');
  expect(
    detectWithEnvironment(
      {},
      { kitty_graphics: false, sixel: false, multiplexer: 'tmux' },
    ),
  ).toBe('halfblock');
  expect(
    detectWithEnvironment(
      { TMUX: '/tmp/tmux-1000/default,123,0', TERM: 'xterm-kitty' },
      null,
    ),
  ).toBe('halfblock');
  // 'unknown' is the struct default, not a detected multiplexer.
  expect(
    detectWithEnvironment(
      {},
      { kitty_graphics: false, sixel: false, multiplexer: 'unknown' },
    ),
  ).toBe('halfblock');
});

test('the environment override wins with and without a reported rich capability', () => {
  expect(
    detectWithEnvironment(
      {
        TUI_GRAPHICS_TIER: 'halfblock',
        TMUX: '/tmp/tmux-1000/default,123,0',
      },
      { ...reportedAll, multiplexer: 'tmux' },
    ),
  ).toBe('halfblock');
  expect(
    detectWithEnvironment(
      {
        TUI_GRAPHICS_TIER: 'kitty',
        TMUX: '/tmp/tmux-1000/default,123,0',
      },
      { ...reportedNone, multiplexer: 'tmux' },
    ),
  ).toBe('kitty');
});

test('no report yet: conservative env heuristics, kitty terms first', () => {
  expect(detectWithEnvironment({ TERM: 'xterm-kitty' }, null)).toBe('kitty');
  expect(detectWithEnvironment({ TERM: 'xterm-ghostty' }, null)).toBe('kitty');
  expect(
    detectWithEnvironment(
      { TERM: 'xterm-256color', KITTY_WINDOW_ID: '2' },
      null,
    ),
  ).toBe('kitty');
  expect(
    detectWithEnvironment(
      { TERM: 'xterm-256color', TERM_PROGRAM: 'WezTerm' },
      null,
    ),
  ).toBe('sixel');
  expect(
    detectWithEnvironment(
      { TERM: 'xterm-256color', TERM_PROGRAM: 'iTerm.app' },
      null,
    ),
  ).toBe('sixel');
});

test('no report and no hints: the universal half-block floor (never flash a rich tier)', () => {
  expect(detectWithEnvironment({ TERM: 'xterm-256color' }, null)).toBe(
    'halfblock',
  );
  expect(detectWithEnvironment({}, null)).toBe('halfblock');
  expect(detectWithEnvironment({ TERM: 'dumb' }, null)).toBe('halfblock');
});

test('TUI_GRAPHICS_TIER forces any tier, beating the report and multiplexer floor', () => {
  expect(
    detectWithEnvironment(
      { TUI_GRAPHICS_TIER: 'kitty', TMUX: '/tmp/tmux-1000/default,1,0' },
      reportedNone,
    ),
  ).toBe('kitty');
  expect(
    detectWithEnvironment(
      { TUI_GRAPHICS_TIER: 'sixel', TMUX: '/tmp/tmux-1000/default,1,0' },
      reportedNone,
    ),
  ).toBe('sixel');
  expect(
    detectWithEnvironment({ TUI_GRAPHICS_TIER: 'halfblock' }, reportedAll),
  ).toBe('halfblock');
  // An invalid override is ignored, not honored.
  expect(
    detectWithEnvironment({ TUI_GRAPHICS_TIER: 'iterm' }, reportedAll),
  ).toBe('kitty');
});
