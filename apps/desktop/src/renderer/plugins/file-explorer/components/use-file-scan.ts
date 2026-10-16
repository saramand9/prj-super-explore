import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileEntry, ScanSummary } from '@explore/shared';
import { ipc, getIpcErrorMessage } from '../../../framework/bridge/ipc-client';
import { useLayoutStore } from '../../../framework/store/layout-store';

export function useFileScan(
  open: boolean,
  side: 'left' | 'right',
  onResults: (entries: FileEntry[]) => void,
) {
  const path = useLayoutStore((state) => state.layout[side].path);
  const [building, setBuilding] = useState(false);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const queryRef = useRef('');
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!open) return;
    if (!path) {
      setBuilding(false);
      setCount(0);
      setSummary(null);
      setError(null);
      onResults([]);
      return;
    }
    const scanId = `files:${side}:${crypto.randomUUID()}`;
    const worker = new Worker(new URL('./file-search.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    let disposed = false;
    let stopped = false;
    let receiving = true;
    let busy = false;
    let indexed = 0;
    const queue: FileEntry[][] = [];
    setBuilding(true);
    setCount(0);
    setError(null);
    setSummary(null);
    onResults([]);

    const pump = () => {
      if (disposed || busy) return;
      const entries = queue.shift();
      if (entries) {
        busy = true;
        worker.postMessage({ type: 'append', entries });
      } else if (!receiving) setBuilding(false);
    };
    worker.onmessage = (
      event: MessageEvent<{ type: string; count: number; query: string; results: FileEntry[] }>,
    ) => {
      if (disposed) return;
      indexed = event.data.count;
      setCount(indexed);
      if (event.data.query === queryRef.current) onResults(event.data.results);
      if (event.data.type === 'append') {
        busy = false;
        pump();
      }
    };
    const stop = () => {
      stopped = true;
      receiving = false;
      queue.length = 0;
      setBuilding(false);
      setSummary((value) => ({
        scanned: indexed,
        directories: 0,
        skipped: 0,
        truncated: false,
        warnings: [],
        ...value,
        cancelled: true,
      }));
      void ipc.invoke('file:cancelScan', { scanId }).catch(() => {});
    };
    stopRef.current = stop;
    worker.onerror = (event) => {
      stop();
      setError(event.message || '文件索引失败，请重试');
    };
    const off = ipc.on('file:scanProgress', (progress) => {
      if (disposed || stopped || progress.scanId !== scanId) return;
      setSummary(progress);
      if (progress.entries.length) queue.push(progress.entries);
      pump();
    });
    worker.postMessage({ type: 'query', query: queryRef.current });
    void ipc
      .invoke('file:scan', { path, scanId })
      .then((value) => {
        if (!disposed && !stopped) {
          setSummary(value);
          receiving = false;
          pump();
        }
      })
      .catch((reason) => {
        if (!disposed && !stopped) {
          setError(getIpcErrorMessage(reason, '目录扫描失败'));
          receiving = false;
          pump();
        }
      });
    return () => {
      disposed = true;
      stopRef.current = () => {};
      off();
      worker.terminate();
      workerRef.current = null;
      queue.length = 0;
      void ipc.invoke('file:cancelScan', { scanId }).catch(() => {});
    };
  }, [open, side, path, revision, onResults]);

  const search = useCallback((query: string) => {
    queryRef.current = query;
    workerRef.current?.postMessage({ type: 'query', query });
  }, []);
  return {
    building,
    count,
    summary,
    error,
    search,
    stop: useCallback(() => stopRef.current(), []),
    retry: useCallback(() => setRevision((value) => value + 1), []),
  };
}
