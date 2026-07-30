import { afterEach, expect, test } from 'bun:test';
import { App } from '../app/App';
import { Kernel } from './Kernel';
import { KernelTargets } from './KernelTargets';

afterEach(() => {
  Kernel.Class.instance.reset();
});

test('the public application target publishes its composed class at seal', () => {
  KernelTargets.Class.register();
  Kernel.Class.instance.extend('example/test', 'invar/app/App', (Base) => {
    return class extends Base {
      readonly targetMarker = true;
    };
  });

  Kernel.Class.instance.seal();

  expect(
    (new App.Class() as App.Instance & { targetMarker: boolean }).targetMarker,
  ).toBe(true);
});
