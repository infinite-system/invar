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
  ).toEqual(
    expect.objectContaining({
      decodedText: 'valid',
      hasValidBase64Payload: true,
    }),
  );
  expect(
    TerminalOutputAudit.Class.clipboardEmissions(malformedSequence)[0],
  ).toEqual(
    expect.objectContaining({
      hasValidBase64Payload: false,
    }),
  );
});

test('preserves parser state and absolute emission offsets across chunks', () => {
  const firstSequence = clipboardSequence('first');
  const secondSequence = `\x1b]52;c;${Buffer.from('second').toString('base64')}\x1b\\`;
  const output = `prefix\x1b[?2026hframe\x1b[?2026l${firstSequence}between${secondSequence}`;
  const wholeStringEmissions =
    TerminalOutputAudit.Class.clipboardEmissions(output);
  for (let splitOffset = 0; splitOffset <= output.length; splitOffset += 1) {
    const terminalOutputAudit = new TerminalOutputAudit.Class();
    terminalOutputAudit.consume(output.slice(0, splitOffset));
    terminalOutputAudit.consume(output.slice(splitOffset));
    expect(terminalOutputAudit.emissions).toEqual(wholeStringEmissions);
    expect(
      terminalOutputAudit.emissions.map((emission) => emission.startOffset),
    ).toEqual([output.indexOf(firstSequence), output.indexOf(secondSequence)]);
  }
});

test('recognizes an OSC sequence spliced into a CSI across chunk boundaries', () => {
  const splicedSequence = clipboardSequence('spliced across chunks');
  const output = `\x1b[?2026h\x1b[38;2;${splicedSequence}255;0;0m\x1b[?2026l`;
  const spliceOffset = output.indexOf(splicedSequence);
  const terminalOutputAudit = new TerminalOutputAudit.Class();
  terminalOutputAudit.consume(output.slice(0, spliceOffset + 1));
  terminalOutputAudit.consume(output.slice(spliceOffset + 1, spliceOffset + 8));
  terminalOutputAudit.consume(output.slice(spliceOffset + 8));

  expect(terminalOutputAudit.emissions).toEqual([
    expect.objectContaining({
      startOffset: spliceOffset,
      endOffset: spliceOffset + splicedSequence.length,
      decodedText: 'spliced across chunks',
      synchronizedFrameDepth: 1,
      startedWithinControlSequence: true,
    }),
  ]);
});
