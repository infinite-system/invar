import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChannelDropNotification } from './ChannelDropNotification';

test('drop notification accepts only content-addressed files in the dropzone', () => {
  const directory = mkdtempSync(join(tmpdir(), 'invar-drop-notification-'));
  const path = join(directory, `${'a'.repeat(64)}-file.txt`);
  writeFileSync(path, 'cargo');
  const previous = process.env.INVAR_DROPZONE_DIRECTORY;
  process.env.INVAR_DROPZONE_DIRECTORY = directory;
  try {
    const token = ChannelDropNotification.Class.encode(path);
    expect(ChannelDropNotification.Class.decode(`'${token}'`)).toEqual([path]);
    expect(
      ChannelDropNotification.Class.decode(
        ChannelDropNotification.Class.encode('/etc/passwd'),
      ),
    ).toBeNull();
  } finally {
    if (previous === undefined) delete process.env.INVAR_DROPZONE_DIRECTORY;
    else process.env.INVAR_DROPZONE_DIRECTORY = previous;
  }
});
