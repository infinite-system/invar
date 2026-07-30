import { expect, test } from 'bun:test';
import { Kernel } from './Kernel';

test('kernel runs hooks in order at seal and freezes', () => {
  const kernel = new Kernel.Class();
  const order: number[] = [];
  kernel.register(() => order.push(1));
  kernel.register(() => order.push(2));
  expect(kernel.isSealed).toBe(false);
  kernel.seal();
  expect(kernel.isSealed).toBe(true);
  expect(order).toEqual([1, 2]);
});

test('registering after seal throws', () => {
  const kernel = new Kernel.Class();
  kernel.seal();
  expect(() => kernel.register(() => {})).toThrow('cannot register after seal');
});

test('assertSealed throws before seal, passes after', () => {
  const kernel = new Kernel.Class();
  expect(() => kernel.assertSealed()).toThrow('kernel is sealed');
  kernel.seal();
  expect(() => kernel.assertSealed()).not.toThrow();
});

test('double seal is idempotent', () => {
  const kernel = new Kernel.Class();
  let count = 0;
  kernel.register(() => count++);
  kernel.seal();
  kernel.seal();
  expect(count).toBe(1);
});

test('the selected class owns one process-wide instance', () => {
  expect(Kernel.Class.instance).toBe(Kernel.Class.instance);
});

test('named extensions compose in order before seal and reset restores the base', () => {
  const kernel = new Kernel.Class();
  class Base {
    readonly path = ['base'];
  }
  let Selected = Base;
  kernel.defineClass('invar/test/Base', Base, (selectedClass) => {
    Selected = selectedClass as typeof Base;
  });
  kernel.extend('example/first', 'invar/test/Base', (Parent) => {
    return class extends Parent {
      readonly first = true;
    };
  });
  kernel.extend('example/second', 'invar/test/Base', (Parent) => {
    return class extends Parent {
      readonly second = true;
    };
  });
  kernel.seal();
  expect(new Selected()).toMatchObject({ first: true, second: true });
  kernel.reset();
  expect(new Selected()).toEqual({ path: ['base'] });
});
