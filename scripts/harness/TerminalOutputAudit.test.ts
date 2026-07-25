import { expect, test } from 'bun:test';
import { TerminalOutputAudit } from './TerminalOutputAudit';

function clipboardSequence(text: string): string {
  return `\x1b]52;c;${Buffer.from(text, 'utf8').toString('base64')}\x07`;
}

test('recognizes an intact clipboard emission after a synchronized frame boundary', () => {
  const output = `\x1b[?2026hframe\x1b[?2026l${clipboardSequence('copy 🦊')}`;
  expect(TerminalOutputAudit.Class.clipboardEmissions(output)).toEqual([
    {
      startOffset: 21,
      endOffset: output.length,
      sequence: clipboardSequence('copy 🦊'),
      base64Payload: Buffer.from('copy 🦊', 'utf8').toString('base64'),
      decodedText: 'copy 🦊',
      hasValidBase64Payload: true,
      synchronizedFrameDepth: 0,
      startedWithinControlSequence: false,
    },
  ]);
});

test('reports clipboard bytes inserted inside a frame or another escape sequence', () => {
  const output = `\x1b[?2026h\x1b[38;2;${clipboardSequence('spliced')}255;0;0m\x1b[?2026l`;
  expect(TerminalOutputAudit.Class.clipboardEmissions(output)).toEqual([
    expect.objectContaining({
      decodedText: 'spliced',
      hasValidBase64Payload: true,
      synchronizedFrameDepth: 1,
      startedWithinControlSequence: true,
    }),
  ]);
});

test('accepts the string-terminator form and rejects malformed base64', () => {
  const validSequence = `\x1b]52;c;${Buffer.from('valid').toString('base64')}\x1b\\`;
  const malformedSequence = '\x1b]52;c;%%%INVALID%%%\x07';
  expect(
    TerminalOutputAudit.Class.clipboardEmissions(validSequence)[0],
  ).toEqual(expect.objectContaining({
    decodedText: 'valid',
    hasValidBase64Payload: true,
  }));
  expect(
    TerminalOutputAudit.Class.clipboardEmissions(malformedSequence)[0],
  ).toEqual(expect.objectContaining({
    hasValidBase64Payload: false,
  }));
});
