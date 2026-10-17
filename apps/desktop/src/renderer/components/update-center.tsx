import { useEffect, useRef } from 'react';
import { CheckCircle2, CircleAlert, Download, Info, Loader2 } from 'lucide-react';
import { UPDATE_CHANNELS, type UpdateStatus } from '@explore/shared';
import { ipc } from '../framework/bridge/ipc-client';
import { connectUpdates, isPreparingUpdate, useUpdateStore } from '../framework/store/update-store';
import { saveBeforeUpdate } from './update-persistence';

const LABELS: Record<UpdateStatus, string> = {
  disabled: '开发模式不检查更新',
  idle: '暂无更新',
  checking: '正在检查更新…',
  available: '发现新版本',
  downloading: '正在下载安装包…',
  downloaded: '更新已下载',
  preparing: '正在保存工作空间与设置…',
  installing: '正在启动安装程序…',
  error: '更新未完成',
};

export function UpdateCenter() {
  const { state, setOpen } = useUpdateStore();
  const busy = state?.status === 'preparing' || state?.status === 'installing';

  useEffect(() => {
    const disconnect = connectUpdates();
    const offSave = ipc.on(
      UPDATE_CHANNELS.beforeInstall,
      ({ requestId }) => void saveBeforeUpdate(requestId),
    );
    // Freeze edits synchronously while the main process waits for a persistence acknowledgement.
    const preventEdits = (event: Event) => {
      if (!isPreparingUpdate()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const inputs = ['keydown', 'keyup', 'pointerdown', 'click', 'drop', 'paste'] as const;
    for (const name of inputs) window.addEventListener(name, preventEdits, true);
    return () => {
      disconnect();
      offSave();
      for (const name of inputs) window.removeEventListener(name, preventEdits, true);
    };
  }, []);

  const showBadge =
    state && ['available', 'downloading', 'downloaded', 'preparing', 'installing'].includes(state.status);
  return (
    <>
      {showBadge && (
        <button
          className="mx-2 rounded px-2 py-0.5 text-xs text-accent hover:bg-accent/10"
          onClick={() => setOpen(true)}
          data-testid="update-badge"
        >
          {state.status === 'downloading' ? `下载 ${Math.floor(state.percent ?? 0)}%` : LABELS[state.status]}
        </button>
      )}
      <UpdateDialog />
      {busy && (
        <div
          role="status"
          className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 text-sm text-white"
        >
          {LABELS[state.status]}
        </div>
      )}
    </>
  );
}

function UpdateDialog() {
  const { state, open, setOpen, run } = useUpdateStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = state?.status === 'preparing' || state?.status === 'installing';
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="update-title"
      className="update-dialog m-auto w-[460px] max-w-[90vw] rounded-xl border border-border bg-surface-light p-6 text-text-primary shadow-2xl backdrop:bg-black/60"
      aria-modal={open ? true : undefined}
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else setOpen(false);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onClose={() => setOpen(false)}
    >
      <h2 id="update-title" className="text-lg font-semibold">
        Explore 更新
      </h2>
      <p className="mt-1 text-xs text-text-secondary">GitHub Releases · 正式版本 · 手动确认安装</p>
      <UpdateDetails />
      <details className="update-dialog__notes">
        <summary>
          安装与安全说明 <span>安装包未签名</span>
        </summary>
        <ul>
          <li>下载会校验完整性，但不等于发布者签名验证。</li>
          <li>安装前先保存工作空间和设置；文件操作未完成时不会重启。</li>
          <li>关闭应用不会自动安装更新，安装始终由你确认。</li>
        </ul>
      </details>
      <div className="mt-5 flex justify-end gap-2 text-sm">
        <button
          autoFocus
          className="rounded border border-border px-3 py-1.5 disabled:opacity-50"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          稍后
        </button>
        {state && ['idle', 'error'].includes(state.status) && (
          <button className="rounded bg-accent px-3 py-1.5 text-white" onClick={() => void run('check')}>
            检查更新
          </button>
        )}
        {state?.status === 'available' && (
          <button className="rounded bg-accent px-3 py-1.5 text-white" onClick={() => void run('download')}>
            下载更新
          </button>
        )}
        {state?.status === 'downloaded' && (
          <button className="rounded bg-accent px-3 py-1.5 text-white" onClick={() => void run('install')}>
            重启并安装
          </button>
        )}
      </div>
    </dialog>
  );
}

function UpdateDetails() {
  const { state, error } = useUpdateStore();
  const current = state?.status === 'idle' && !!state.checkedAt;
  const Icon =
    error || state?.status === 'error'
      ? CircleAlert
      : current
        ? CheckCircle2
        : state?.status === 'checking' || state?.status === 'preparing'
          ? Loader2
          : state?.availableVersion
            ? Download
            : Info;
  const label = state
    ? current
      ? `已是最新版本 ${state.currentVersion}`
      : state.status === 'idle'
        ? '尚未检查更新'
        : LABELS[state.status]
    : '正在读取更新状态…';
  return (
    <div
      className={`update-dialog__status${current ? ' update-dialog__status--current' : ''}`}
      aria-live="polite"
    >
      <div className="update-dialog__result">
        <Icon size={24} strokeWidth={1.6} aria-hidden="true" />
        <p>{label}</p>
      </div>
      <p>当前版本：{state?.currentVersion ?? '读取中…'}</p>
      {state?.availableVersion && <p className="mt-1">可用版本：{state.availableVersion}</p>}
      {state?.status === 'downloading' && (
        <>
          <progress
            aria-label="更新下载进度"
            className="mt-3 h-2 w-full accent-accent"
            max={100}
            value={state.percent ?? 0}
          />
          <p className="mt-1 text-xs">{Math.floor(state.percent ?? 0)}%</p>
        </>
      )}
      {state?.checkedAt && (
        <p className="mt-2 text-xs text-text-secondary">
          最近检查：{new Date(state.checkedAt).toLocaleString()}
        </p>
      )}
      {(state?.message || error) && (
        <p role="alert" className="mt-3 text-xs text-amber-400">
          {error ?? state?.message}
        </p>
      )}
    </div>
  );
}
