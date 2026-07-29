import { expect, test } from 'bun:test';
import { StdinParser, type StdinEvent } from '@opentui/core';
import { BracketedPasteInput } from './BracketedPasteInput';

for (const payloadByteCount of [10, 1024, 65_536]) {
  test(`one exact ${payloadByteCount}-byte paste survives marker-edge input chunks`, () => {
    const payload = 'x'.repeat(payloadByteCount);
    const parser = new StdinParser({ armTimeouts: false });
    const events: StdinEvent[] = [];

    for (const chunk of BracketedPasteInput.Class.splitAtMarkerEdges(
      payload,
      997,
    )) {
      parser.push(chunk);
      parser.drain((event) => events.push(event));
    }

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('paste');
    if (events[0]?.type !== 'paste')
      throw new Error('Expected one paste event');
    expect(new TextDecoder().decode(events[0].bytes)).toBe(payload);
    parser.destroy();
  });
}
