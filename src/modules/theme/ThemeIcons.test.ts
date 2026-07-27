import { expect, test } from 'bun:test';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import { TerminalEmulator } from '../terminal/TerminalEmulator';
import type { GlyphLevel } from './TerminalCapabilities';
import { ThemeIcons } from './ThemeIcons';

interface ThemeGlyphEntry {
  readonly name: string;
  readonly glyph: string;
}

function themeGlyphEntriesFor(level: GlyphLevel): ThemeGlyphEntry[] {
  const agentTranscriptIcons = ThemeIcons.Class.agentTranscriptIconsFor(level);
  const namedEntries = (
    vocabularyName: string,
    vocabulary: object,
  ): ThemeGlyphEntry[] =>
    Object.entries(vocabulary).map(([slot, glyph]) => ({
      name: `${level}.${vocabularyName}.${slot}`,
      glyph: String(glyph),
    }));

  return [
    ...namedEntries('symbol', ThemeIcons.Class.symbolMarksFor(level)),
    ...namedEntries('action', ThemeIcons.Class.actionIconsFor(level)),
    ...namedEntries('checkbox', ThemeIcons.Class.checkboxIconsFor(level)),
    ...namedEntries('activity', ThemeIcons.Class.activityIconsFor(level)),
    ...namedEntries(
      'interface',
      ThemeIcons.Class.interfaceGlyphVocabularyFor(level),
    ),
    ...namedEntries('find', ThemeIcons.Class.findIconsFor(level)),
    ...namedEntries('agentTranscript', {
      caretCollapsed: agentTranscriptIcons.caretCollapsed,
      caretExpanded: agentTranscriptIcons.caretExpanded,
      tool: agentTranscriptIcons.tool,
      resultOk: agentTranscriptIcons.resultOk,
      resultError: agentTranscriptIcons.resultError,
      ellipsis: agentTranscriptIcons.ellipsis,
      ellipsisCell: agentTranscriptIcons.ellipsisCell,
      rule: agentTranscriptIcons.rule,
    }),
    ...agentTranscriptIcons.spinnerFrames.map((glyph, frameIndex) => ({
      name: `${level}.agentTranscript.spinner.${frameIndex}`,
      glyph,
    })),
    {
      name: `${level}.settings`,
      glyph: ThemeIcons.Class.settingsIconFor(level),
    },
    {
      name: `${level}.terminal`,
      glyph: ThemeIcons.Class.terminalIconFor(level),
    },
    {
      name: `${level}.agent`,
      glyph: ThemeIcons.Class.agentIconFor(level),
    },
    {
      name: `${level}.rightDock`,
      glyph: ThemeIcons.Class.rightDockIconFor(level),
    },
    {
      name: `${level}.alert`,
      glyph: ThemeIcons.Class.alertIconFor(level),
    },
    {
      name: `${level}.tabSeparator`,
      glyph: ThemeIcons.Class.tabSeparatorFor(level),
    },
  ];
}

test('icon fallback ladder: nerd has glyphs, ascii uses markers', () => {
  expect(
    ThemeIcons.Class.iconFor('nerd', 'x.ts', false).length,
  ).toBeGreaterThan(0);
  expect(ThemeIcons.Class.iconFor('ascii', 'sub', true, false)).toBe('+');
  expect(ThemeIcons.Class.iconFor('ascii', 'sub', true, true)).toBe('-');
});

test('right dock affordance has one cell at every glyph tier', () => {
  expect(ThemeIcons.Class.rightDockIconFor('ascii')).toBe('R');
  for (const level of ['nerd', 'unicode', 'ascii'] as const) {
    expect([...ThemeIcons.Class.rightDockIconFor(level)].length).toBe(1);
  }
});

test('unicode icon set resolves known extension and falls back for unknown', () => {
  const unicodeSymbolMarks = ThemeIcons.Class.symbolMarksFor('unicode');
  expect(ThemeIcons.Class.iconFor('unicode', 'main.ts', false)).toBe('◆');
  expect(ThemeIcons.Class.iconFor('unicode', 'weird.zzz', false)).toBe(
    unicodeSymbolMarks.file,
  );
});

test('checkbox icons ladder: real glyphs on nerd/unicode, single-cell, ascii degrades', () => {
  expect(ThemeIcons.Class.checkboxIconsFor('ascii')).toEqual({
    unchecked: ' ',
    checked: 'x',
  });
  for (const level of ['unicode', 'nerd'] as const) {
    const box = ThemeIcons.Class.checkboxIconsFor(level);
    expect([...box.unchecked].length).toBe(1); // single cell so the click hit-column stays fixed
    expect([...box.checked].length).toBe(1);
    expect(box.unchecked).not.toBe(box.checked); // the two states are visually distinct
  }
});

test('git action icons ladder: real glyphs on nerd/unicode, letters as the ascii fallback', () => {
  // Ascii is the graceful degrade: o / d / + / - so a no-nerd-font terminal still reads.
  expect(ThemeIcons.Class.actionIconsFor('ascii')).toEqual({
    open: 'o',
    discard: 'd',
    stage: '+',
    unstage: '-',
    preview: 'p',
  });
  // Nerd + unicode are real single-cell glyphs (distinct from the letters).
  const unicode = ThemeIcons.Class.actionIconsFor('unicode');
  const nerd = ThemeIcons.Class.actionIconsFor('nerd');
  for (const level of [unicode, nerd]) {
    for (const glyph of [
      level.open,
      level.discard,
      level.stage,
      level.unstage,
    ]) {
      expect([...glyph].length).toBe(1); // exactly one code point -> one cell, hit-zones stay aligned
      expect('od+-'.includes(glyph)).toBe(false); // not the ascii letters
    }
  }
});

test('semantic interface glyph slots resolve through every capability tier', () => {
  const candidateGlyphSlots = [
    'activityFiles',
    'activitySourceControl',
    'activityExtensions',
    'activitySearch',
    'activitySettings',
    'panelAdd',
    'panelExpand',
    'panelRestore',
    'panelClose',
    'diffPreviousChange',
    'diffNextChange',
    'overviewMark',
    'foldOpen',
    'foldClosed',
  ] as const;
  const expectedVocabularies = {
    nerd: [
      '\u{f07b}',
      '\u{e702}',
      '\u{f487}',
      '\u{f002}',
      '\u{f013}',
      '\u{f067}',
      '\u{f065}',
      '\u{f066}',
      '\u{f00d}',
      '↑',
      '↓',
      '•',
      '⌄',
      '›',
    ],
    unicode: [
      '≡',
      '⑂',
      '⧫',
      '⌕',
      '⚙',
      '+',
      '↗',
      '↙',
      '×',
      '↑',
      '↓',
      '•',
      '⌄',
      '›',
    ],
    ascii: [
      'F',
      'G',
      'X',
      '/',
      '*',
      '+',
      '>',
      '<',
      'x',
      'U',
      'D',
      '.',
      'v',
      ']',
    ],
  } as const;

  for (const level of ['nerd', 'unicode', 'ascii'] as const) {
    expect(
      candidateGlyphSlots.map((slot) => ThemeIcons.Class.glyphFor(level, slot)),
    ).toEqual([...expectedVocabularies[level]]);
  }
});

test('the extensions glyph is one cell and is claimed by nobody else', () => {
  // Two recorded failures for this slot: ⊞ was unrecognisable (a thin internal cross that vanished at
  // terminal size) and ⬢ was legible but read as oversized. The claim here is not "avoid this list of
  // glyphs" — it is that no OTHER surface means something by this slot's mark, asked of the recorded
  // ownership table rather than of a literal list a test would have to keep in step by hand.
  for (const level of ['nerd', 'unicode', 'ascii'] as const) {
    const glyph = ThemeIcons.Class.glyphFor(level, 'activityExtensions');
    expect(EditorCoordinates.Class.lineWidth(glyph)).toBe(1);
  }
  expect(
    ThemeIcons.Class.markOwnersFor(
      ThemeIcons.Class.glyphFor('unicode', 'activityExtensions'),
    ),
  ).toEqual(['activity: Extensions']);
});

test('activity and panel control glyphs stay pairwise distinct at every tier', () => {
  const distinctGlyphSlots = [
    'activityFiles',
    'activitySourceControl',
    'activityExtensions',
    'activitySearch',
    'activitySettings',
    'panelAdd',
    'panelExpand',
    'panelRestore',
    'panelClose',
    'diffPreviousChange',
    'diffNextChange',
  ] as const;

  for (const level of ['nerd', 'unicode', 'ascii'] as const) {
    const glyphs = distinctGlyphSlots.map((slot) =>
      ThemeIcons.Class.glyphFor(level, slot),
    );
    expect(new Set(glyphs).size).toBe(distinctGlyphSlots.length);
  }
});

test('file icon sets keep every file mark one cell at every tier', () => {
  for (const level of ['nerd', 'unicode', 'ascii'] as const) {
    for (const mark of Object.values(ThemeIcons.Class.symbolMarksFor(level))) {
      expect(EditorCoordinates.Class.lineWidth(mark)).toBe(1);
    }
  }
  expect(
    ThemeIcons.Class.markOwnersFor(
      ThemeIcons.Class.symbolMarkFor('unicode', 'lockfile'),
    ),
  ).toEqual(['symbol class: lockfile']);
  expect(
    ThemeIcons.Class.markOwnersFor(
      ThemeIcons.Class.symbolMarkFor('unicode', 'image'),
    ),
  ).toEqual(['symbol class: image']);
});

// The complete symbol-mark table, pinned per tier. One whole-row `toEqual` is STRICTER than per-class
// checks: it catches a missing class, an extra class, and — the reason it exists — a file-type mark
// that changed while the extension keys were being folded into symbol classes. Every value below was
// byte-identical to what the extension-keyed table painted before the fold, which was the
// appearance-preservation proof for the file tree and the breadcrumb popup; the one deliberate change
// since is `javascript`, moved off the dirty-tab marker's code point by the mark-ownership check.
test('the symbol-mark table resolves every class at every tier', () => {
  const symbolClasses = [
    'directoryOpen',
    'directoryClosed',
    'file',
    'typescript',
    'javascript',
    'json',
    'markdown',
    'lockfile',
    'shellScript',
    'stylesheet',
    'markup',
    'vueComponent',
    'webAssembly',
    'image',
    'versionControl',
    'configuration',
    'callable',
    'type',
    'value',
    'module',
    'syntax',
    'unclassified',
  ] as const;
  const expectedMarks = {
    nerd: [
      '\u{f07c}',
      '\u{f07b}',
      '\u{f15b}',
      '\u{e628}',
      '\u{e781}',
      '\u{e60b}',
      '\u{f48a}',
      '\u{f023}',
      '\u{f489}',
      '\u{e749}',
      '\u{e736}',
      '\u{fd42}',
      '\u{e6a1}',
      '\u{f1c5}',
      '\u{e702}',
      '\u{e6b2}',
      'ƒ',
      '▣',
      '▪',
      '▤',
      '✱',
      '▫',
    ],
    unicode: [
      '▾',
      '▸',
      '·',
      '◆',
      '◉',
      '⛃',
      '✎',
      '⚿',
      '⚙',
      '❖',
      '◈',
      '◇',
      '⬡',
      '▞',
      '⑂',
      '⚙',
      'ƒ',
      '▣',
      '▪',
      '▤',
      '✱',
      '▫',
    ],
    ascii: [
      '-',
      '+',
      ' ',
      ' ',
      ' ',
      ' ',
      ' ',
      ' ',
      ' ',
      ' ',
      ' ',
      ' ',
      ' ',
      ' ',
      ' ',
      ' ',
      'f',
      't',
      'v',
      'm',
      'k',
      '.',
    ],
  } as const;

  for (const level of ['nerd', 'unicode', 'ascii'] as const) {
    expect(
      symbolClasses.map((symbolClass) =>
        ThemeIcons.Class.symbolMarkFor(level, symbolClass),
      ),
    ).toEqual([...expectedMarks[level]]);
  }
});

// A completion popup puts its mark in ONE column, so every class a completion item can resolve to
// must be exactly one cell — including `file` and `directoryClosed`, which an LSP File or Folder item
// shares with the tree. This is the property that #95 broke: a mark the app measures as one cell and
// the terminal renders as two shifts every label right of it.
test('every code-symbol mark is one display cell at every tier', () => {
  const completionSymbolClasses = [
    'callable',
    'type',
    'value',
    'module',
    'syntax',
    'unclassified',
    'file',
    'directoryClosed',
  ] as const;

  for (const level of ['nerd', 'unicode', 'ascii'] as const) {
    for (const symbolClass of completionSymbolClasses) {
      const mark = ThemeIcons.Class.symbolMarkFor(level, symbolClass);
      expect(EditorCoordinates.Class.lineWidth(mark)).toBe(1);
      expect([...mark].length).toBe(1);
    }
  }
});

test('code-symbol marks never take a mark another surface already owns', () => {
  const codeSymbolClasses = [
    'callable',
    'type',
    'value',
    'module',
    'syntax',
    'unclassified',
  ] as const;

  for (const symbolClass of codeSymbolClasses) {
    const mark = ThemeIcons.Class.symbolMarkFor('unicode', symbolClass);
    expect(ThemeIcons.Class.markOwnersFor(mark)).toEqual([
      `symbol class: ${symbolClass}`,
    ]);
  }
});

// The collision detector, and the two claims that make it an instrument rather than a note. A mark
// carried by two surfaces with unrelated meanings is unreadable, so every sharing must be DECLARED
// with a reason — and a declaration whose sharing no longer exists must be removed, so the record
// cannot outlive the reality it describes. The ownership table this reads is complete for the surfaces
// whose marks can meet, which is exactly what the earlier recorded-but-unchecked collisions lacked.
test('every shared mark is declared, and every declaration is still real', () => {
  expect(
    ThemeIcons.Class.undeclaredMarkSharings.map((sharing) => ({
      mark: sharing.mark,
      owners: sharing.owners,
    })),
  ).toEqual([]);
  expect(ThemeIcons.Class.staleMarkSharingDeclarations).toEqual([]);
  for (const [, reason] of ThemeIcons.Class.declaredMarkSharings) {
    expect(reason.length).toBeGreaterThan(40);
  }
});

// Positive control: the detector must be ABLE to report a sharing. Driven with a synthetic ownership
// list, because a check whose only evidence is "it says nothing about the real table" proves nothing.
test('the mark-sharing detector reports a collision when one exists', () => {
  expect(
    ThemeIcons.Class.markSharingsIn([
      { mark: '@', owner: 'first surface' },
      { mark: '#', owner: 'second surface' },
      { mark: '@', owner: 'third surface' },
    ]),
  ).toEqual([{ mark: '@', owners: ['first surface', 'third surface'] }]);
  expect(
    ThemeIcons.Class.markSharingsIn([
      { mark: '@', owner: 'first surface' },
      { mark: '#', owner: 'second surface' },
    ]),
  ).toEqual([]);
});

// The resolved collision, stated so it cannot silently come back: the JavaScript file mark and the
// dirty/active tab marker were the same code point with unrelated meanings.
test('the javascript mark is not the dirty tab marker', () => {
  const dirtyTabMarker = '●';
  expect(ThemeIcons.Class.markOwnersFor(dirtyTabMarker)).toEqual([
    'the dirty and active tab marker (a TabBarRenderer literal)',
  ]);
  expect(ThemeIcons.Class.symbolMarkFor('unicode', 'javascript')).not.toBe(
    dirtyTabMarker,
  );
});

// The families must be distinguishable from each other AND from the folder/file marks that share the
// column, at the ascii rung too: a degraded tier that paints one letter for every kind carries no
// information, which is the honest-degradation half of the glyph ladder.
test('the code-symbol families stay pairwise distinct including at the ascii rung', () => {
  const columnSharingClasses = [
    'callable',
    'type',
    'value',
    'module',
    'syntax',
    'unclassified',
    'file',
    'directoryClosed',
    'directoryOpen',
  ] as const;

  for (const level of ['nerd', 'unicode', 'ascii'] as const) {
    const marks = columnSharingClasses.map((symbolClass) =>
      ThemeIcons.Class.symbolMarkFor(level, symbolClass),
    );
    expect(new Set(marks).size).toBe(columnSharingClasses.length);
  }
  for (const symbolClass of [
    'callable',
    'type',
    'value',
    'module',
    'syntax',
    'unclassified',
  ] as const) {
    expect(
      ThemeIcons.Class.symbolMarkFor('ascii', symbolClass).trim().length,
    ).toBe(1);
  }
});

// One instrument closes the emoji-presentation class across EVERY public
// ThemeIcons vocabulary surface. `lineWidth` is the app's OpenTUI-backed
// authority; `@xterm/headless`, behind the harness emulator, is independent.
// A mismatch reserves a phantom column, while any terminal-rendered two-cell
// glyph breaks one-cell icon rows even if both authorities happen to agree.
test('every theme glyph agrees and avoids double-cell rendering', async () => {
  const emulator = new TerminalEmulator.Class(8, 2);
  const renderedWidthOf = async (glyph: string): Promise<number> => {
    emulator.write(`\u001b[2J\u001b[H${glyph}`);
    await emulator.flush();
    return emulator.cursorColumn;
  };

  try {
    // Positive control: both authorities must be able to answer two.
    expect(await renderedWidthOf('漢')).toBe(2);
    expect(EditorCoordinates.Class.lineWidth('漢')).toBe(2);

    const glyphLevels = ['nerd', 'unicode', 'ascii'] as const;
    const vocabularyEntries = glyphLevels.flatMap((level) =>
      themeGlyphEntriesFor(level),
    );
    expect(glyphLevels).toEqual(['nerd', 'unicode', 'ascii']);
    expect(vocabularyEntries.length).toBeGreaterThan(200);
    expect(
      vocabularyEntries.every(
        (entry) => entry.name.length > 0 && entry.glyph.length > 0,
      ),
    ).toBe(true);
    expect(new Set(vocabularyEntries.map((entry) => entry.name)).size).toBe(
      vocabularyEntries.length,
    );

    const widthOffenders: Array<{
      name: string;
      glyph: string;
      measuredWidth: number;
      renderedWidth: number;
    }> = [];
    for (const entry of vocabularyEntries) {
      const measuredWidth = EditorCoordinates.Class.lineWidth(entry.glyph);
      const renderedWidth = await renderedWidthOf(entry.glyph);
      if (measuredWidth !== renderedWidth || renderedWidth === 2) {
        widthOffenders.push({
          name: entry.name,
          glyph: entry.glyph,
          measuredWidth,
          renderedWidth,
        });
      }
    }
    expect(widthOffenders).toEqual([]);
  } finally {
    emulator.dispose();
  }
});

test('a filesystem entry classifies before any mark is chosen', () => {
  expect(ThemeIcons.Class.symbolClassForFileEntry('src', true, true)).toBe(
    'directoryOpen',
  );
  expect(ThemeIcons.Class.symbolClassForFileEntry('src', true, false)).toBe(
    'directoryClosed',
  );
  expect(ThemeIcons.Class.symbolClassForFileEntry('View.tsx', false)).toBe(
    'typescript',
  );
  expect(ThemeIcons.Class.symbolClassForFileEntry('.gitignore', false)).toBe(
    'versionControl',
  );
  expect(ThemeIcons.Class.symbolClassForFileEntry('notes.zzz', false)).toBe(
    'file',
  );
  expect(ThemeIcons.Class.symbolClassForFileEntry('Makefile', false)).toBe(
    'file',
  );
});

test('every semantic interface icon is one display cell and avoids reserved markers', () => {
  const candidateGlyphSlots = [
    'activityFiles',
    'activitySourceControl',
    'activityExtensions',
    'activitySearch',
    'activitySettings',
    'panelAdd',
    'panelExpand',
    'panelRestore',
    'panelClose',
    'diffPreviousChange',
    'diffNextChange',
    'overviewMark',
    'foldOpen',
    'foldClosed',
  ] as const;
  const reservedMarkers = new Set(['▎', '●', '❯']);

  for (const level of ['nerd', 'unicode', 'ascii'] as const) {
    for (const slot of candidateGlyphSlots) {
      const glyph = ThemeIcons.Class.glyphFor(level, slot);
      expect(EditorCoordinates.Class.lineWidth(glyph)).toBe(1);
      expect(reservedMarkers.has(glyph)).toBe(false);
    }
  }
});

test('fold controls avoid every reserved unicode mark', () => {
  const reservedMarkers = new Set([
    '▎',
    '●',
    '❯',
    '•',
    '↗',
    '↙',
    '+',
    '×',
    '◉',
    '≡',
    '⑂',
    '⌕',
    '⚙',
    '⧫',
  ]);
  const foldMarks = [
    ThemeIcons.Class.glyphFor('unicode', 'foldOpen'),
    ThemeIcons.Class.glyphFor('unicode', 'foldClosed'),
  ];

  expect(new Set(foldMarks).size).toBe(2);
  expect(foldMarks.every((mark) => !reservedMarkers.has(mark))).toBe(true);
});
