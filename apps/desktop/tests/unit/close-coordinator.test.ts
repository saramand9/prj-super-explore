import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloseCoordinator } from '../../src/main/services/close-coordinator';

describe('close save coordination', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const actions = () => ({
    requestSave: vi.fn(),
    cancelSave: vi.fn(),
    close: vi.fn(),
    askTimeout: vi.fn().mockResolvedValue('cancel'),
  });

  it('waits for the matching save and clears its timeout', async () => {
    const calls = actions();
    const coordinator = new CloseCoordinator(calls);
    coordinator.begin();
    coordinator.begin();
    expect(calls.requestSave).toHaveBeenCalledTimes(1);
    const id = calls.requestSave.mock.calls[0][0];
    coordinator.resolve(id + 1, true);
    expect(calls.close).not.toHaveBeenCalled();
    coordinator.resolve(id, true);
    await vi.advanceTimersByTimeAsync(8000);
    expect(calls.close).toHaveBeenCalledOnce();
    expect(calls.askTimeout).not.toHaveBeenCalled();
  });

  it('offers recovery on timeout and ignores late successful saves after returning', async () => {
    const calls = actions();
    const coordinator = new CloseCoordinator(calls);
    coordinator.begin();
    const id = calls.requestSave.mock.calls[0][0];
    await vi.advanceTimersByTimeAsync(8000);
    expect(calls.cancelSave).toHaveBeenCalledWith(id);
    expect(calls.askTimeout).toHaveBeenCalledOnce();
    coordinator.resolve(id, true);
    expect(calls.close).not.toHaveBeenCalled();
  });

  it('does not time out while the user is deciding whether to discard changes', async () => {
    const calls = actions();
    const coordinator = new CloseCoordinator(calls);
    coordinator.begin();
    coordinator.userIsDeciding(calls.requestSave.mock.calls[0][0]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls.askTimeout).not.toHaveBeenCalled();
  });

  it('uses a new request on retry and supports explicit discard', async () => {
    const calls = actions();
    calls.askTimeout.mockResolvedValueOnce('retry').mockResolvedValueOnce('discard');
    const coordinator = new CloseCoordinator(calls);
    coordinator.begin();
    const first = calls.requestSave.mock.calls[0][0];
    await vi.advanceTimersByTimeAsync(8000);
    expect(calls.requestSave.mock.calls[1][0]).not.toBe(first);
    coordinator.resolve(first, true);
    expect(calls.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(8000);
    expect(calls.close).toHaveBeenCalledOnce();
  });
});
