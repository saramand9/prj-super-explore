import { expect, it, vi } from 'vitest';
import { ServiceContainer } from '../../src/main/service-container';

it('releases all services in reverse order even when one cleanup fails', async () => {
  const container = new ServiceContainer();
  const calls: string[] = [];
  container.register('first', () => ({
    dispose: () => {
      calls.push('first');
    },
  }));
  container.register('broken', () => ({
    dispose: () => {
      calls.push('broken');
      throw new Error('cleanup');
    },
  }));
  const last = vi.fn(() => {
    calls.push('last');
  });
  container.register('last', () => ({ dispose: last }));
  await expect(container.disposeAll()).rejects.toThrow('Some services could not be disposed');
  expect(calls).toEqual(['last', 'broken', 'first']);
  expect(container.tryGet('first')).toBeUndefined();
  await container.disposeAll();
  expect(last).toHaveBeenCalledOnce();
});
