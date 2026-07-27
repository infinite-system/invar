import { expect, test } from 'bun:test';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import { TextInputModel } from '../editor/TextInputModel';
import { ThemePalettes } from '../theme/ThemePalettes';
import { TextFieldPainter, type TextFieldState } from './TextFieldPainter';

const palette = ThemePalettes.Class.DARK;

function paintedText(
  result: ReturnType<typeof TextFieldPainter.Class.paint>,
): string {
  return result.chunks.map((chunk) => chunk.text).join('');
}

function caretChunkText(
  result: ReturnType<typeof TextFieldPainter.Class.paint>,
  caretColumn: number,
): string {
  let chunkStartColumn = 0;
  for (const chunk of result.chunks) {
    const chunkEndColumn =
      chunkStartColumn + EditorCoordinates.Class.lineWidth(chunk.text);
    if (caretColumn >= chunkStartColumn && caretColumn < chunkEndColumn) {
      return chunk.text;
    }
    chunkStartColumn = chunkEndColumn;
  }
  throw new Error(`No painted chunk at column ${caretColumn}`);
}

function paintField(
  value: string,
  caret: number,
  state: TextFieldState,
  width: number | null = 20,
): ReturnType<typeof TextFieldPainter.Class.paint> {
  const input = new TextInputModel.Class();
  input.setValue(value, caret);
  return TextFieldPainter.Class.paint({
    prefix: '> ',
    input,
    tone: TextFieldPainter.Class.toneFor(palette, state),
    surfaceBackground: palette.panel,
    caretVisible: state !== 'idle',
    width,
  });
}

function relativeLuminance(hexColor: string): number {
  const channelValues = [1, 3, 5].map((offset) => {
    const channel =
      Number.parseInt(hexColor.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * (channelValues[0] ?? 0) +
    0.7152 * (channelValues[1] ?? 0) +
    0.0722 * (channelValues[2] ?? 0)
  );
}

test('the caret cell sits at the model caret offset and never shifts the text', () => {
  const result = paintField('alpha beta', 6, 'focused');
  expect(result.caretColumn).toBe('> alpha '.length);
  expect(result.caretWidth).toBe(1);
  expect(caretChunkText(result, result.caretColumn)).toBe('b');
  // The caret replaces a cell instead of inserting one: the row still reads the field's own text.
  expect(paintedText(result)).toBe('> alpha beta        ');
});

test('a caret at the end of the text keeps a visible cell inside the field', () => {
  const result = paintField('done', 4, 'focused');
  expect(result.caretColumn).toBe('> done'.length);
  expect(caretChunkText(result, result.caretColumn)).toBe(' ');
  expect(result.paintedWidth).toBe(20);
});

test('wide glyphs before the caret move it by display columns not characters', () => {
  const wideResult = paintField('漢字x', 2, 'focused');
  expect(wideResult.caretColumn).toBe('> '.length + 4);
  expect(caretChunkText(wideResult, wideResult.caretColumn)).toBe('x');
  const emojiResult = paintField('😀a', 1, 'focused');
  expect(emojiResult.caretColumn).toBe('> '.length + 2);
  expect(caretChunkText(emojiResult, emojiResult.caretColumn)).toBe('a');
});

test('a caret on a wide glyph covers both of its cells', () => {
  const result = paintField('a漢b', 1, 'focused');
  expect(result.caretColumn).toBe('> a'.length);
  expect(result.caretWidth).toBe(2);
  expect(caretChunkText(result, result.caretColumn)).toBe('漢');
});

test('field geometry is identical across idle focused and hovered', () => {
  const widths = (['idle', 'focused', 'hovered'] as TextFieldState[]).map(
    (state) => {
      const result = paintField('alpha beta', 6, state);
      return {
        paintedWidth: result.paintedWidth,
        caretColumn: result.caretColumn,
        text: paintedText(result),
      };
    },
  );
  expect(widths[1]).toEqual(widths[0]);
  expect(widths[2]).toEqual(widths[0]);
});

test('the three tones differ and focus lifts one step while hover is vivid', () => {
  const idle = TextFieldPainter.Class.toneFor(palette, 'idle');
  const focused = TextFieldPainter.Class.toneFor(palette, 'focused');
  const hovered = TextFieldPainter.Class.toneFor(palette, 'hovered');
  const backgrounds = [idle.background, focused.background, hovered.background];
  expect(new Set(backgrounds).size).toBe(3);
  expect(
    new Set([idle.foreground, focused.foreground, hovered.foreground]).size,
  ).toBe(3);
  // Idle recesses below the popup surface, focus lifts one step above it, hover is the vivid step:
  // the focus highlight is therefore strictly quieter than the hover highlight.
  expect(relativeLuminance(idle.background ?? '')).toBeLessThan(
    relativeLuminance(palette.panel),
  );
  expect(relativeLuminance(palette.panel)).toBeLessThan(
    relativeLuminance(focused.background ?? ''),
  );
  expect(relativeLuminance(focused.background ?? '')).toBeLessThan(
    relativeLuminance(hovered.background ?? ''),
  );
});

test('hover wins over focus so a pointed field keeps its hover affordance', () => {
  expect(
    TextFieldPainter.Class.stateFor({ focused: true, hovered: true }),
  ).toBe('hovered');
  expect(
    TextFieldPainter.Class.stateFor({ focused: true, hovered: false }),
  ).toBe('focused');
  expect(
    TextFieldPainter.Class.stateFor({ focused: false, hovered: false }),
  ).toBe('idle');
});

test('a caret past the right edge pulls the window without widening the field', () => {
  const result = paintField('0123456789abcdef', 16, 'focused', 10);
  expect(result.paintedWidth).toBe(10);
  expect(result.caretColumn).toBe(9);
  expect(caretChunkText(result, result.caretColumn)).toBe(' ');
  expect(paintedText(result)).toBe('789abcdef ');
});

test('an unfocused field paints the caret cell as ordinary text', () => {
  const focused = paintField('word', 2, 'focused');
  const idle = paintField('word', 2, 'idle');
  expect(caretChunkText(idle, idle.caretColumn)).toBe(
    caretChunkText(focused, focused.caretColumn),
  );
  expect(idle.paintedWidth).toBe(focused.paintedWidth);
});

test('an inline field paints only its own columns', () => {
  const result = paintField('hi', 2, 'focused', null);
  expect(paintedText(result)).toBe('> hi ');
  expect(result.paintedWidth).toBe(5);
  expect(result.caretColumn).toBe(4);
});
