import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VueSingleFileComponentPlugin } from './VueSingleFileComponentPlugin';

describe('VueSingleFileComponentPlugin', () => {
  test('builds the real SFC entry graph', async () => {
    const result = await Bun.build({
      entrypoints: [join(import.meta.dir, 'app.ts')],
      target: 'browser',
      plugins: [VueSingleFileComponentPlugin.Class.create()],
    });
    expect(result.success).toBe(true);
    expect(result.outputs.some((output) => output.path.endsWith('.js'))).toBe(
      true,
    );
  });

  test('rejects a component without script setup', async () => {
    const scratchDirectory = mkdtempSync(
      join(tmpdir(), 'invariant-field-vue-loader-control-'),
    );
    const componentPath = join(scratchDirectory, 'MissingScriptSetup.vue');
    writeFileSync(componentPath, '<template><p>Control</p></template>\n');
    try {
      expect(() =>
        VueSingleFileComponentPlugin.Class.compile(
          componentPath,
          '<template><p>Control</p></template>\n',
        ),
      ).toThrow('must use script setup');
    } finally {
      rmSync(scratchDirectory, { recursive: true });
    }
  });
});
