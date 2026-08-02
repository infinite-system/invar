import { expect, test } from 'bun:test';
import type { PanelContentFactory } from './PanelContentFactory.interface';
import { PanelContentFactories } from './PanelContentFactories';

test('a factory is available only while its registration is active', () => {
  const factories = new PanelContentFactories.Class();
  const factory = {
    kind: 'database',
    instanceLabel: 'Database',
    createPane: () => {
      throw new Error('The registry test does not create a pane');
    },
  } satisfies PanelContentFactory;

  const unregister = factories.register(factory);

  expect(factories.factory('database')).toBe(factory);
  unregister();
  expect(factories.factory('database')).toBeNull();
});

test('two factories cannot claim the same pane kind', () => {
  const factories = new PanelContentFactories.Class();
  const firstFactory = {
    kind: 'database',
    instanceLabel: 'Database',
    createPane: () => {
      throw new Error('The registry test does not create a pane');
    },
  } satisfies PanelContentFactory;
  const secondFactory = { ...firstFactory };

  factories.register(firstFactory);

  expect(() => factories.register(secondFactory)).toThrow(
    'Panel content factory kind already belongs to another factory: database',
  );
});
