import { expect, test } from 'bun:test';
import { ChannelFrame } from './ChannelFrame';

test('frame parsing preserves every boundary across split reads', () => {
  const first = ChannelFrame.Class.encode(
    ChannelFrame.Class.FRAME_KIND.Request,
    {
      requestId: 'one',
      method: 'drop.upload',
    },
  );
  const second = ChannelFrame.Class.encode(
    ChannelFrame.Class.FRAME_KIND.StreamData,
    { streamId: 'file' },
    new Uint8Array([0, 1, 2, 255]),
  );
  const bytes = new Uint8Array(first.length + second.length);
  bytes.set(first);
  bytes.set(second, first.length);
  for (let splitOffset = 0; splitOffset <= bytes.length; splitOffset += 1) {
    const decoder = new ChannelFrame.Class();
    const frames = [
      ...decoder.push(bytes.slice(0, splitOffset)),
      ...decoder.push(bytes.slice(splitOffset)),
    ];
    expect(frames.map((frame) => frame.kind)).toEqual([
      ChannelFrame.Class.FRAME_KIND.Request,
      ChannelFrame.Class.FRAME_KIND.StreamData,
    ]);
    expect(frames[1]?.body).toEqual(new Uint8Array([0, 1, 2, 255]));
  }
});

test('invalid magic is a loud framing failure', () => {
  const encoded = ChannelFrame.Class.encode(
    ChannelFrame.Class.FRAME_KIND.Hello,
    {
      versions: ['1.0'],
    },
  );
  encoded[0] = 0;
  expect(() => new ChannelFrame.Class().push(encoded)).toThrow('magic');
});
