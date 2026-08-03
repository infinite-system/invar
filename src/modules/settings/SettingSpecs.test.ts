import { expect, test } from 'bun:test';
import { SettingSpecs } from './SettingSpecs';

test('a dynamic enum resolves its current options when the settings view asks', () => {
  let options: readonly string[] = ['first'];
  const spec = SettingSpecs.Class.dynamicEnum(() => options);

  expect(spec.kind).toBe('dynamic-enum');
  if (spec.kind !== 'dynamic-enum') throw new Error('Expected a dynamic enum');
  expect(spec.resolveOptions()).toEqual(['first']);

  options = ['second', 'third'];
  expect(spec.resolveOptions()).toEqual(['second', 'third']);
});
