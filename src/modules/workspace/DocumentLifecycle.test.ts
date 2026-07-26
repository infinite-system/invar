import { expect, test } from 'bun:test';
import { DocumentHandle } from './DocumentHandle';
import { DocumentLifecycle } from './DocumentLifecycle';

test('document lifecycle sends one stable handle through every phase', () => {
  const lifecycle = new DocumentLifecycle.Class();
  const handle = new DocumentHandle.Class(Symbol('document'), '/one.ts');
  const phases: string[] = [];
  lifecycle.register({
    opened: (received) => phases.push(`opened:${received === handle}`),
    becameActive: (received) => phases.push(`active:${received === handle}`),
    closed: (received) => phases.push(`closed:${received === handle}`),
  });
  lifecycle.opened(handle);
  lifecycle.becameActive(handle);
  lifecycle.closed(handle);
  expect(phases).toEqual(['opened:true', 'active:true', 'closed:true']);
});
