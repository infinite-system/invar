import { expect, test } from 'bun:test';
import { MockBackend } from './MockBackend';

test('the mock backend records writes and delivers scripted child bytes', () => {
  const backend = new MockBackend.Class();
  const decodedData: string[] = [];
  backend.onData((bytes) => decodedData.push(new TextDecoder().decode(bytes)));

  backend.write('input');
  backend.feed('output');

  expect(backend.writes).toEqual(['input']);
  expect(decodedData).toEqual(['output']);
});
