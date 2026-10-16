import { useEffect, useState } from 'react';

type AlertType = 'info' | 'warning' | 'error';
type ChoiceType = 'none' | 'info' | 'error' | 'question' | 'warning';

export interface AppChoiceButton {
  id: string;
  label: string;
}

interface AppDialogHostApi {
  alert: (options: { title?: string; message: string; type?: AlertType }) => Promise<void>;
  confirm: (options: { title?: string; message: string }) => Promise<boolean>;
  choice: (options: {
    title?: string;
    message: string;
    buttons: AppChoiceButton[];
    defaultId?: string;
    cancelId?: string;
    type?: ChoiceType;
  }) => Promise<string | null>;
}

type ActiveDialog =
  | {
      kind: 'alert';
      title?: string;
      message: string;
      type: AlertType;
      resolve: () => void;
    }
  | {
      kind: 'confirm';
      title?: string;
      message: string;
      resolve: (value: boolean) => void;
    }
  | {
      kind: 'choice';
      title?: string;
      message: string;
      buttons: AppChoiceButton[];
      defaultId?: string;
      cancelId?: string;
      type?: ChoiceType;
      resolve: (value: string | null) => void;
    };

let hostApi: AppDialogHostApi | null = null;

function requireHost(): AppDialogHostApi {
  if (!hostApi) {
    throw new Error('AppDialogHost is not mounted');
  }
  return hostApi;
}

export const appDialog = {
  alert(options: { title?: string; message: string; type?: AlertType }) {
    return requireHost().alert(options);
  },
  confirm(options: { title?: string; message: string }) {
    return requireHost().confirm(options);
  },
  choice(options: {
    title?: string;
    message: string;
    buttons: AppChoiceButton[];
    defaultId?: string;
    cancelId?: string;
    type?: ChoiceType;
  }) {
    return requireHost().choice(options);
  },
};

export function AppDialogHost() {
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const [hoveredChoiceId, setHoveredChoiceId] = useState<string | null>(null);

  useEffect(() => {
    const api: AppDialogHostApi = {
      alert: ({ title, message, type = 'info' }) =>
        new Promise<void>((resolve) => {
          setDialog({ kind: 'alert', title, message, type, resolve });
        }),
      confirm: ({ title, message }) =>
        new Promise<boolean>((resolve) => {
          setDialog({ kind: 'confirm', title, message, resolve });
        }),
      choice: ({ title, message, buttons, defaultId, cancelId, type }) =>
        new Promise<string | null>((resolve) => {
          setDialog({ kind: 'choice', title, message, buttons, defaultId, cancelId, type, resolve });
        }),
    };
    hostApi = api;
    return () => {
      if (hostApi === api) hostApi = null;
    };
  }, []);

  useEffect(() => {
    setHoveredChoiceId(null);
  }, [dialog]);

  if (!dialog) return null;

  const closeAlert = () => {
    if (dialog.kind !== 'alert') return;
    dialog.resolve();
    setDialog(null);
  };

  const closeConfirm = (value: boolean) => {
    if (dialog.kind !== 'confirm') return;
    dialog.resolve(value);
    setDialog(null);
  };

  const closeChoice = (value: string | null) => {
    if (dialog.kind !== 'choice') return;
    dialog.resolve(value);
    setDialog(null);
  };

  const title = dialog.title ?? getDefaultTitle(dialog);

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50"
      onClick={() => {
        if (dialog.kind === 'alert') closeAlert();
        if (dialog.kind === 'confirm') closeConfirm(false);
        if (dialog.kind === 'choice') closeChoice(dialog.cancelId ?? null);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-surface-light border border-border rounded-lg shadow-2xl p-4 min-w-[360px] max-w-[min(720px,90vw)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium text-text-primary mb-3">{title}</div>
        <div className="text-xs leading-relaxed text-text-secondary whitespace-pre-wrap max-h-[60vh] overflow-auto pr-1">
          {dialog.message}
        </div>

        {dialog.kind === 'alert' && (
          <div className="flex justify-end mt-4">
            <button className="px-4 py-1 text-xs bg-accent text-white rounded" onClick={closeAlert}>
              确定
            </button>
          </div>
        )}

        {dialog.kind === 'confirm' && (
          <div className="flex justify-end gap-2 mt-4">
            <button
              className="px-4 py-1 text-xs text-text-muted hover:text-text-primary border border-border rounded"
              onClick={() => closeConfirm(false)}
            >
              取消
            </button>
            <button
              className="px-4 py-1 text-xs bg-accent text-white rounded"
              onClick={() => closeConfirm(true)}
            >
              确定
            </button>
          </div>
        )}

        {dialog.kind === 'choice' && (
          <div
            className="grid gap-2 mt-4"
            style={{ gridTemplateColumns: `repeat(${dialog.buttons.length}, minmax(0, 1fr))` }}
          >
            {dialog.buttons.map((button) => (
              <button
                key={button.id}
                className={getChoiceButtonClass(
                  button.id,
                  dialog.defaultId,
                  dialog.cancelId,
                  hoveredChoiceId,
                )}
                onMouseEnter={() => setHoveredChoiceId(button.id)}
                onMouseLeave={() => setHoveredChoiceId(null)}
                onFocus={() => setHoveredChoiceId(button.id)}
                onBlur={() => setHoveredChoiceId(null)}
                onClick={() => closeChoice(button.id)}
              >
                {button.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getDefaultTitle(dialog: ActiveDialog): string {
  if (dialog.kind === 'confirm') return '确认操作';
  if (dialog.kind === 'choice') return dialog.type === 'warning' ? '请选择处理方式' : '请选择';
  if (dialog.type === 'error') return '操作失败';
  if (dialog.type === 'warning') return '操作结果';
  return '提示';
}

function getChoiceButtonClass(
  id: string,
  defaultId?: string,
  cancelId?: string,
  hoveredId?: string | null,
): string {
  if (hoveredId === id) {
    if (id === 'overwrite' || id === 'delete' || id === 'permanent-delete') {
      return 'px-4 py-1 text-xs bg-red-600/80 border border-red-500/80 text-white rounded';
    }
    return 'px-4 py-1 text-xs bg-accent border border-accent text-white rounded';
  }
  if (id === cancelId || id === 'cancel') {
    return 'px-4 py-1 text-xs text-text-muted hover:text-text-primary border border-border rounded';
  }
  if (id === 'delete' || id === 'permanent-delete') {
    return 'px-4 py-1 text-xs bg-red-600/80 hover:bg-red-600 text-white rounded';
  }
  if (id === 'overwrite') {
    return 'px-4 py-1 text-xs text-text-secondary border border-border rounded hover:bg-red-600/80 hover:border-red-500/80 hover:text-white';
  }
  if (id === defaultId) {
    if (hoveredId) {
      return 'px-4 py-1 text-xs text-text-secondary hover:text-text-primary border border-border rounded';
    }
    return 'px-4 py-1 text-xs bg-accent text-white rounded';
  }
  return 'px-4 py-1 text-xs text-text-secondary hover:text-text-primary border border-border rounded';
}
