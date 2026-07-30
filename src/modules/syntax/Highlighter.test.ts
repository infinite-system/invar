import { test, expect } from 'bun:test';
import { TextCoordinates } from '../text/TextCoordinates';
import { EditorWrap } from '../editor/EditorWrap';
import { Highlighter, type LangId } from './Highlighter';

const roles = (line: string, language: LangId) =>
  Highlighter.Class.highlightLine(line, language).map((span) => span.role);

const textOf = (line: string, language: LangId) =>
  Highlighter.Class.highlightLine(line, language)
    .map((span) => span.text)
    .join('');

test('tokenizer preserves the exact line text (lossless spans)', () => {
  const line = "const x = foo('bar', 42); // note";
  expect(textOf(line, 'typescript')).toBe(line);
});

test('keywords, strings, numbers, comments get distinct roles', () => {
  const spans = Highlighter.Class.highlightLine(
    "const s = 'hi'; // c",
    'typescript',
  );
  const byText = (text: string) =>
    spans.find((span) => span.text === text)?.role;
  expect(byText('const')).toBe('keyword');
  expect(spans.find((span) => span.role === 'string')?.text).toBe("'hi'");
  expect(
    spans.some((span) => span.role === 'comment' && span.text.includes('// c')),
  ).toBe(true);
});

test('SCSS has variables, nesting, interpolation, and line comments', () => {
  const line = '$tone: red; .card { &__title { color: #{$tone}; } // nested }';
  const spans = Highlighter.Class.highlightLine(line, 'scss');

  expect(textOf(line, 'scss')).toBe(line);
  expect(spans).toContainEqual({ text: '$tone', role: 'variable' });
  expect(spans).toContainEqual({ text: '&', role: 'operator' });
  expect(spans).toContainEqual({ text: '#{', role: 'operator' });
  expect(spans).toContainEqual({ text: '// nested }', role: 'comment' });
  expect(Highlighter.Class.highlightLine('// nested }', 'css')).not.toEqual([
    { text: '// nested }', role: 'comment' },
  ]);
});

test('PascalCase identifiers are typed, call sites are funcs', () => {
  const spans = Highlighter.Class.highlightLine(
    'new Widget(); doThing()',
    'typescript',
  );
  expect(spans.find((span) => span.text === 'Widget')?.role).toBe('type');
  expect(spans.find((span) => span.text === 'doThing')?.role).toBe('func');
});

test('json keys vs string values differ, numbers and literals colored', () => {
  const spans = Highlighter.Class.highlightLine(
    '"key": "value", "n": 42, "b": true',
    'json',
  );
  expect(
    spans.some((span) => span.role === 'type' && span.text.includes('"key"')),
  ).toBe(true);
  expect(
    spans.some((span) => span.role === 'string' && span.text === '"value"'),
  ).toBe(true);
  expect(
    spans.some((span) => span.role === 'number' && span.text === '42'),
  ).toBe(true);
  expect(
    spans.some((span) => span.role === 'keyword' && span.text === 'true'),
  ).toBe(true);
});

test('markdown headings and lists are recognized', () => {
  expect(roles('## Title', 'markdown')).toEqual(['keyword']);
  expect(Highlighter.Class.highlightLine('- item', 'markdown')[0]!.role).toBe(
    'operator',
  );
});

test('plain language returns a single text span', () => {
  expect(Highlighter.Class.highlightLine('anything at all', 'plain')).toEqual([
    { text: 'anything at all', role: 'text' },
  ]);
});

test('html: tags are keywords, attribute values strings, comments/entities colored — lossless', () => {
  const line = '<a href="x.html" class="c">Hi&amp;</a><!-- note';
  expect(textOf(line, 'html')).toBe(line); // lossless
  const spans = Highlighter.Class.highlightLine(line, 'html');
  expect(spans.find((span) => span.text === 'a')?.role).toBe('keyword');
  expect(spans.find((span) => span.text === 'href')?.role).toBe('variable');
  expect(
    spans.some((span) => span.role === 'string' && span.text === '"x.html"'),
  ).toBe(true);
  expect(
    spans.some((span) => span.role === 'type' && span.text === '&amp;'),
  ).toBe(true);
  expect(
    spans.some(
      (span) => span.role === 'comment' && span.text.includes('<!-- note'),
    ),
  ).toBe(true);
});

test('vue: directives pop as keywords and interpolation is highlighted — lossless', () => {
  const line = '<button v-if="ok" :class="c" @click="go">{{ label }}</button>';
  expect(textOf(line, 'vue')).toBe(line); // lossless
  const spans = Highlighter.Class.highlightLine(line, 'vue');
  expect(spans.find((span) => span.text === 'v-if')?.role).toBe('keyword');
  expect(spans.find((span) => span.text === ':class')?.role).toBe('keyword');
  expect(spans.find((span) => span.text === '@click')?.role).toBe('keyword');
  expect(
    spans.some(
      (span) => span.role === 'variable' && span.text.includes('label'),
    ),
  ).toBe(true);
  // Plain HTML (vue off) does NOT treat v-if as a directive keyword.
  const htmlSpans = Highlighter.Class.highlightLine(line, 'html');
  expect(htmlSpans.find((span) => span.text === 'v-if')?.role).toBe('variable');
});

// --- doc-block comment classification (JSDoc middle/closing lines) ---------------------------

test('doc-block middle lines (leading *) are comments, lossless', () => {
  expect(
    Highlighter.Class.highlightLine(' * The answer, described.', 'typescript'),
  ).toEqual([{ text: ' * The answer, described.', role: 'comment' }]);
  expect(Highlighter.Class.highlightLine('   *', 'typescript')).toEqual([
    { text: '   *', role: 'comment' },
  ]);
  expect(
    Highlighter.Class.highlightLine(
      ' ** double-star continuation',
      'typescript',
    ),
  ).toEqual([{ text: ' ** double-star continuation', role: 'comment' }]);
  expect(
    Highlighter.Class.highlightLine('/** opener with prose', 'typescript'),
  ).toEqual([{ text: '/** opener with prose', role: 'comment' }]);
});

test('doc-block closing */ is a comment; code after it on the line still tokenizes', () => {
  expect(Highlighter.Class.highlightLine(' */', 'typescript')).toEqual([
    { text: ' */', role: 'comment' },
  ]);
  const spans = Highlighter.Class.highlightLine(
    ' */ const x = 1;',
    'typescript',
  );
  expect(spans[0]).toEqual({ text: ' */', role: 'comment' });
  expect(spans.find((span) => span.text === 'const')?.role).toBe('keyword');
  expect(spans.map((span) => span.text).join('')).toBe(' */ const x = 1;');
});

test('a generator method star is NOT mistaken for a doc-block line', () => {
  const spans = Highlighter.Class.highlightLine(
    '  *generate() {',
    'typescript',
  );
  expect(spans.every((span) => span.role !== 'comment')).toBe(true);
  expect(spans.find((span) => span.text === 'generate')?.role).toBe('func');
});

// --- span slicing (wrap continuations / sub-windows of a tokenized line) ---------------------

test('sliceSpans keeps roles across the cut and stays lossless', () => {
  const line = 'const s = 1; // trailing comment';
  const spans = Highlighter.Class.highlightLine(line, 'typescript');
  // A slice that starts INSIDE the comment stays comment-roled (a re-tokenization would not).
  const commentStart = line.indexOf('//');
  const tail = Highlighter.Class.sliceSpans(
    spans,
    commentStart + 5,
    line.length,
  );
  expect(tail.length).toBeGreaterThan(0);
  expect(tail.every((span) => span.role === 'comment')).toBe(true);
  expect(tail.map((span) => span.text).join('')).toBe(
    line.slice(commentStart + 5),
  );
  // A slice across several spans preserves each role and concatenates to the window text.
  const middle = Highlighter.Class.sliceSpans(spans, 2, 13);
  expect(middle.map((span) => span.text).join('')).toBe(line.slice(2, 13));
  expect(middle[0]).toEqual({ text: 'nst', role: 'keyword' });
  // Degenerate windows are empty.
  expect(Highlighter.Class.sliceSpans(spans, 5, 5)).toEqual([]);
  expect(
    Highlighter.Class.sliceSpans(spans, line.length, line.length + 4),
  ).toEqual([]);
});

test('sliceSpans cuts at grapheme boundaries, never inside a cluster', () => {
  const spans = [{ text: 'ab👍cd', role: 'string' as const }];
  expect(Highlighter.Class.sliceSpans(spans, 1, 4)).toEqual([
    { text: 'b👍c', role: 'string' },
  ]);
  expect(Highlighter.Class.sliceSpans(spans, 2, 3)).toEqual([
    { text: '👍', role: 'string' },
  ]);
});

test('horizontal display-column slicing preserves logical roles at an astral boundary', () => {
  const line = '// prefix 👍 tailcomment afterfind';
  const logicalLineSpans = Highlighter.Class.highlightLine(line, 'typescript');
  const astralGraphemeIndex =
    TextCoordinates.Class.graphemes(line).indexOf('👍');
  const scrollLeft =
    TextCoordinates.Class.displayColumn(line, astralGraphemeIndex) + 1;
  const viewportWidth = 24;
  let windowStartGraphemeIndex = TextCoordinates.Class.graphemeAtDisplayColumn(
    line,
    scrollLeft,
  );
  if (
    TextCoordinates.Class.displayColumn(line, windowStartGraphemeIndex) <
    scrollLeft
  ) {
    windowStartGraphemeIndex += 1;
  }
  const windowEndGraphemeIndex =
    TextCoordinates.Class.graphemeAtDisplayColumn(
      line,
      scrollLeft + viewportWidth,
    ) + 1;
  const windowText = line.slice(
    TextCoordinates.Class.graphemeToU16(line, windowStartGraphemeIndex),
    TextCoordinates.Class.graphemeToU16(line, windowEndGraphemeIndex),
  );
  const windowSpans = Highlighter.Class.sliceSpans(
    logicalLineSpans,
    windowStartGraphemeIndex,
    windowEndGraphemeIndex,
  );

  expect(windowText.startsWith(' tailcomment')).toBe(true);
  expect(windowSpans.map((span) => span.text).join('')).toBe(windowText);
  expect(windowSpans.every((span) => span.role === 'comment')).toBe(true);
  const postFindStartGraphemeIndex = TextCoordinates.Class.u16ToGrapheme(
    windowText,
    windowText.indexOf('afterfind'),
  );
  const postFindSpans = Highlighter.Class.sliceSpans(
    windowSpans,
    postFindStartGraphemeIndex,
    TextCoordinates.Class.graphemeCount(windowText),
  );
  expect(postFindSpans.map((span) => span.text).join('')).toBe('afterfind');
  expect(postFindSpans.every((span) => span.role === 'comment')).toBe(true);
});

test('wrap continuation rows of a long // comment slice to all-comment spans', () => {
  const line =
    '// alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima';
  const wrapWidth = 24;
  const segments = EditorWrap.Class.wrapLine(line, wrapWidth);
  expect(segments.length).toBeGreaterThan(2);
  const lineSpans = Highlighter.Class.highlightLine(line, 'typescript');
  for (const segment of segments) {
    const segmentSpans = Highlighter.Class.sliceSpans(
      lineSpans,
      segment.startGrapheme,
      segment.endGrapheme,
    );
    const segmentText = line.slice(
      TextCoordinates.Class.graphemeToU16(line, segment.startGrapheme),
      TextCoordinates.Class.graphemeToU16(line, segment.endGrapheme),
    );
    expect(segmentSpans.map((span) => span.text).join('')).toBe(segmentText);
    expect(segmentSpans.every((span) => span.role === 'comment')).toBe(true);
  }
});

test('css: selectors, properties, colors, units, at-rules, strings — lossless', () => {
  const line = '.btn { color: #ff0; width: 12px; content: "x"; } /* c */';
  expect(textOf(line, 'css')).toBe(line); // lossless
  const spans = Highlighter.Class.highlightLine(line, 'css');
  expect(spans.find((span) => span.text === '.btn')?.role).toBe('type');
  expect(spans.find((span) => span.text === 'color')?.role).toBe('keyword'); // property (before ':')
  expect(
    spans.some((span) => span.role === 'number' && span.text === '#ff0'),
  ).toBe(true); // hex color
  expect(
    spans.some((span) => span.role === 'number' && span.text === '12px'),
  ).toBe(true); // unit
  expect(
    spans.some((span) => span.role === 'string' && span.text === '"x"'),
  ).toBe(true);
  expect(
    spans.some(
      (span) => span.role === 'comment' && span.text.includes('/* c */'),
    ),
  ).toBe(true);
  expect(
    Highlighter.Class.highlightLine('@media screen {', 'css').find(
      (span) => span.text === '@media',
    )?.role,
  ).toBe('keyword');
});
