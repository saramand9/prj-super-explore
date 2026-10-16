import { EVENT_CHANNELS, REQUEST_CHANNELS, type ExploreApi } from '@explore/shared';

interface Transport {
  invoke(channel: string, payload: unknown): Promise<unknown>;
  on(channel: string, listener: (event: unknown, payload: unknown) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, payload: unknown) => void): unknown;
}

export function createBridge(transport: Transport, runtime: ExploreApi['runtime']): ExploreApi {
  // Keys come only from the exhaustive shared contract; no generic invoke is exposed.
  const requests = Object.fromEntries(
    Object.keys(REQUEST_CHANNELS).map((channel) => [
      channel,
      (payload: unknown) => transport.invoke(channel, payload),
    ]),
  ) as ExploreApi['requests'];
  const events = Object.fromEntries(
    Object.keys(EVENT_CHANNELS).map((channel) => [
      channel,
      (callback: (payload: unknown) => void) => {
        if (typeof callback !== 'function') throw new TypeError('Expected an event callback');
        const listener = (_event: unknown, payload: unknown) => callback(payload);
        transport.on(channel, listener);
        return () => {
          transport.removeListener(channel, listener);
        };
      },
    ]),
  ) as ExploreApi['events'];
  return Object.freeze({
    runtime: Object.freeze(runtime),
    requests: Object.freeze(requests),
    events: Object.freeze(events),
  });
}
