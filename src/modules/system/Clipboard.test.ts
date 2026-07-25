import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { Clipboard } from './Clipboard';

afterEach(() => {
  Clipboard.Class.setOsc52Emitter(null);
  Clipboard.Class.setToolForTest(null);
});

test('copy sends exact Unicode text through the configured OSC 52 emitter', async () => {
  const emittedSequences: string[] = [];
  Clipboard.Class.setToolForTest(null);
  const disposeEmitter = Clipboard.Class.setOsc52Emitter((sequence) => {
    emittedSequences.push(sequence);
    return true;
  });

  const copiedText = 'frame-safe 🦊 clipboard';
  expect(await Clipboard.Class.copy(copiedText)).toBe(true);
  expect(emittedSequences).toEqual([
    `\x1b]52;c;${Buffer.from(copiedText, 'utf8').toString('base64')}\x07`,
  ]);
  expect(Clipboard.Class.lastBackend).toBe('osc52');
  expect(Clipboard.Class.lastCopiedTextHash).toBe(
    createHash('sha256').update(copiedText, 'utf8').digest('hex'),
  );

  disposeEmitter();
  expect(await Clipboard.Class.copy('no renderer')).toBe(false);
  expect(emittedSequences).toHaveLength(1);
  expect(Clipboard.Class.lastBackend).toBeNull();
});

test('a stale renderer disposer cannot clear a newer OSC 52 emitter', async () => {
  const firstEmissions: string[] = [];
  const secondEmissions: string[] = [];
  Clipboard.Class.setToolForTest(null);
  const disposeFirst = Clipboard.Class.setOsc52Emitter((sequence) => {
    firstEmissions.push(sequence);
    return true;
  });
  Clipboard.Class.setOsc52Emitter((sequence) => {
    secondEmissions.push(sequence);
    return true;
  });

  disposeFirst();
  expect(await Clipboard.Class.copy('new renderer')).toBe(true);
  expect(firstEmissions).toEqual([]);
  expect(secondEmissions).toEqual([
    `\x1b]52;c;${Buffer.from('new renderer', 'utf8').toString('base64')}\x07`,
  ]);
});
