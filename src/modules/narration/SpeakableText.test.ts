// The markdown → speech transform: strip syntax, announce code blocks, simplify paths so piper reads
// prose instead of spelling out punctuation (the "bebebe" babble).
import { test, expect } from 'bun:test';
import { SpeakableText } from './SpeakableText';

const speak = (markdown: string) => SpeakableText.Class.forSpeech(markdown);

test('a fenced code block becomes a spoken placeholder, not the source', () => {
  expect(speak('Here is the fix:\n```ts\nconst x = 1;\n```\nDone.')).toBe('Here is the fix: code block Done.');
});

test('inline code keeps code expressions and paths verbatim while removing the backticks', () => {
  expect(speak('call `render()` again')).toBe('call render() again');
  expect(speak('edit `/tmp/wt-voice/src/main.ts`')).toBe(
    'edit /tmp/wt-voice/src/main.ts',
  );
});

test('inline code keeps identifiers verbatim while removing the backticks', () => {
  expect(speak('the `hasDocument` getter')).toBe('the hasDocument getter');
  expect(speak('call `attachWordWrap` here')).toBe('call attachWordWrap here');
  expect(speak('open `Editor.ts` now')).toBe('open Editor.ts now');
  expect(speak('the `parseHTML` step')).toBe('the parseHTML step');
});

test('a bare absolute path in prose is read as its last segment (no slash-spelling)', () => {
  expect(speak('I committed to /tmp/wt-voice and pushed')).toBe('I committed to wt-voice and pushed');
});

test('a single-slash word like and/or is NOT treated as a path', () => {
  expect(speak('pick one and/or the other')).toBe('pick one and/or the other');
});

test('headings, bullets, and blockquotes drop their leading markers', () => {
  expect(speak('# Summary\n- first\n- second\n> a note')).toBe('Summary first second a note');
});

test('emphasis wrappers are removed', () => {
  expect(speak('this is **bold** and *italic* and __also__ and _more_')).toBe('this is bold and italic and also and more');
});

test('a link is read as its visible text', () => {
  expect(speak('see [the docs](https://example.com/a/b/c) for details')).toBe('see the docs for details');
});

test('plain prose passes through unchanged (whitespace normalized)', () => {
  expect(speak('The quick brown fox.')).toBe('The quick brown fox.');
  expect(speak('  spaced\n\nout   text  ')).toBe('spaced out text');
});

test('the first reported babble case reads cleanly (paths + filenames)', () => {
  const input = 'I ran `/tmp/wt-voice/scripts/merge-gate.sh` and it passed. See `SpeakableText.ts`.';
  expect(speak(input)).toBe(
    'I ran /tmp/wt-voice/scripts/merge-gate.sh and it passed. See SpeakableText.ts.',
  );
});

test('dense inline code retains every span content while dropping only backticks', () => {
  const input =
    'The ivue pattern is disciplined everywhere I looked. `Editor.ts` defines ' +
    '`get hasDocument() { return ref(false) }`, and `createX()` plus `attachWordWrap` follow suit.';
  const spokenText = speak(input);
  expect(spokenText).toBe(
    'The ivue pattern is disciplined everywhere I looked. Editor.ts defines ' +
      'get hasDocument() { return ref(false) }, and createX() plus attachWordWrap follow suit.',
  );
  expect(spokenText).not.toContain('`');
});

test('hostile inline-code shapes restore every extracted span exactly once', () => {
  const hostileCases = [
    {
      description: 'adjacent spans',
      markdown: '`a``b`',
      expectedSpokenText: 'ab',
    },
    {
      description: 'message start and end',
      markdown: '`start` through `end`',
      expectedSpokenText: 'start through end',
    },
    {
      description: 'bold link text and list transforms',
      markdown: '**`boldCode`** [`linkCode`](https://example.com)\n- `listCode`',
      expectedSpokenText: 'boldCode linkCode listCode',
    },
    {
      description: 'unterminated backtick',
      markdown: 'keep `unterminated',
      expectedSpokenText: 'keep `unterminated',
    },
    {
      description: 'multiple spans in one sentence',
      markdown: 'one `alpha` two `beta` three `gamma`',
      expectedSpokenText: 'one alpha two beta three gamma',
    },
    {
      description: 'placeholder-like content',
      markdown: 'keep `INLINE_CODE_PLACEHOLDER_0` verbatim',
      expectedSpokenText: 'keep INLINE_CODE_PLACEHOLDER_0 verbatim',
    },
    {
      description: 'multiple paragraphs',
      markdown: 'first `alpha`\n\nsecond `beta`',
      expectedSpokenText: 'first alpha second beta',
    },
  ];

  for (const hostileCase of hostileCases) {
    const speechPreparation = SpeakableText.Class.prepareForSpeech(
      hostileCase.markdown,
    );
    expect(
      speechPreparation.text,
      hostileCase.description,
    ).toBe(hostileCase.expectedSpokenText);
    expect(
      speechPreparation.usedOriginalFallback,
      hostileCase.description,
    ).toBe(false);
    expect(speechPreparation.text, hostileCase.description).not.toMatch(
      /[\uE000-\uF8FF]/u,
    );
  }
});

test('a transform that removes an extracted token degrades to the untouched original', () => {
  const markdown = '[visible text](`inlineDestination`)';
  const speechPreparation = SpeakableText.Class.prepareForSpeech(markdown);

  expect(speechPreparation).toEqual({
    text: markdown,
    usedOriginalFallback: true,
  });
  expect(speechPreparation.text).not.toMatch(/[\uE000-\uF8FF]/u);
});

test('user content matching the initial token alphabet remains content, not a registry token', () => {
  const tokenLikeContent = '\uE0000\uE001';
  const speechPreparation = SpeakableText.Class.prepareForSpeech(
    `keep \`${tokenLikeContent}\` verbatim`,
  );

  expect(speechPreparation).toEqual({
    text: `keep ${tokenLikeContent} verbatim`,
    usedOriginalFallback: false,
  });
});

test('bare (un-backticked) prose: paths + filenames + multi-word identifiers, but brand words spared', () => {
  expect(speak('committed to /tmp/wt-voice/Editor.ts today')).toBe('committed to Editor today');
  expect(speak('the attachWordWrap helper')).toBe('the attach Word Wrap helper'); // 2 humps → split
  expect(speak('built with GitHub and JavaScript on iPhone')).toBe('built with GitHub and JavaScript on iPhone'); // 1 hump each → spared
});

test('empty / whitespace-only input yields empty string', () => {
  expect(speak('')).toBe('');
  expect(speak('   \n  ')).toBe('');
});

test('babble tokens become spoken stand-ins: hashes, UUIDs, colors, base64, escapes', () => {
  expect(speak('landed in commit `f11d070` after 4cd1bd7')).toBe('landed in commit hash after hash');
  expect(speak('session faf7e858-c256-4735-9bbd-ba8dca8023dd done')).toBe('session identifier done');
  expect(speak('background #1e1e2e here')).toBe('background color here');
  expect(speak('payload QUNUSVZFLVRSQU5TQ1JJUFQ= arrived')).toBe('payload encoded data arrived');
  expect(speak('send \\x1b[27;6;97~ to open')).toBe('send escape sequence to open');
});

test('shell operators and option flags read as words', () => {
  expect(speak('run `bunx tsc --noEmit && bun test` now')).toBe('run bunx tsc no Emit and bun test now');
  expect(speak('true || false')).toBe('true or false');
});

test('markdown tables lose pipe walls and separator rows', () => {
  expect(speak('| column | value |\n|---|---|\n| width | 120 |')).toBe('column, value, width, 120');
});

test('emphasis spanning a line break still sheds its markers', () => {
  expect(speak('so **first\nsecond** done')).toBe('so first second done');
});

test('bare URLs speak as their host, not spelled segments', () => {
  expect(speak('see https://github.com/infinite-system/invar/pull/42 for details')).toBe('see github.com link for details');
});

test('a bare version number stays a number, brand words stay intact', () => {
  expect(speak('version 1200000 of GitHub')).toBe('version 1200000 of GitHub');
});
