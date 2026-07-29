import { expect, test } from 'bun:test';
import { AgentPermissions } from './AgentPermissions';

test('a plain boolean passes through and undefined is false', () => {
  expect(AgentPermissions.Class.resolveLive(true)).toBe(true);
  expect(AgentPermissions.Class.resolveLive(false)).toBe(false);
  expect(AgentPermissions.Class.resolveLive(undefined)).toBe(false);
});

test('a getter is read live each call', () => {
  let bypassPermissions = true;
  const resolveBypassPermissions = () => bypassPermissions;
  expect(AgentPermissions.Class.resolveLive(resolveBypassPermissions)).toBe(
    true,
  );
  bypassPermissions = false;
  expect(AgentPermissions.Class.resolveLive(resolveBypassPermissions)).toBe(
    false,
  );
  bypassPermissions = true;
  expect(AgentPermissions.Class.resolveLive(resolveBypassPermissions)).toBe(
    true,
  );
});
