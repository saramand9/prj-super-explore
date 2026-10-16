import { describe, expect, it, vi } from 'vitest';
import { createBridge } from '../../src/preload/bridge';
import { REQUEST_CHANNELS, EVENT_CHANNELS } from '@explore/shared';

describe('preload capabilities', () => {
  it('exposes only fixed named request functions', async () => {
    const transport = { invoke: vi.fn().mockResolvedValue('1'), on: vi.fn(), removeListener: vi.fn() };
    const api = createBridge(transport, { sandboxed: true, contextIsolated: true });
    expect(Object.keys(api.requests)).toEqual(Object.keys(REQUEST_CHANNELS));
    expect(Object.keys(api.events)).toEqual(Object.keys(EVENT_CHANNELS));
    expect(api).not.toHaveProperty('invoke');
    expect(api.requests).not.toHaveProperty('arbitrary:channel');
    await api.requests['app:getVersion'](undefined);
    expect(transport.invoke).toHaveBeenCalledWith('app:getVersion', undefined);
  });
  it('strips the Electron event object and provides cleanup', () => {
    const transport = { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
    const callback = vi.fn();
    const unsubscribe = createBridge(transport, { sandboxed: true, contextIsolated: true }).events[
      'launcher:show'
    ](callback);
    const listener = transport.on.mock.calls[0][1];
    listener({ sender: 'privileged object' }, undefined);
    expect(callback).toHaveBeenCalledWith(undefined);
    unsubscribe();
    expect(transport.removeListener).toHaveBeenCalledWith('launcher:show', listener);
  });
});
