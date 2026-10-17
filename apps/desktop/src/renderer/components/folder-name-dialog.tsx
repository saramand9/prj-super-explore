import { useEffect, useRef, useState } from 'react';
import { FolderPlus, X } from 'lucide-react';
import { activeSide, createFolder, runCommand } from './file-commands';
import { useFileStore } from '../plugins/file-explorer/store';

export function useFolderDialog() {
  const [request, setRequest] = useState<{ side: 'left' | 'right'; path: string } | null>(null);
  const open = () => {
    const side = activeSide();
    const path = useFileStore.getState()[side].path;
    if (path) setRequest({ side, path });
  };
  return {
    open,
    dialog: request && (
      <FolderNameDialog
        onClose={() => setRequest(null)}
        onSubmit={(name) => {
          setRequest(null);
          void runCommand(() => createFolder(name, request.side, request.path));
        }}
      />
    ),
  };
}

function FolderNameDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('新建文件夹');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="command-dialog"
      aria-label="新建文件夹"
      aria-modal="true"
      onCancel={onClose}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
      >
        <div className="command-dialog__heading">
          <FolderPlus size={19} />
          <h2>新建文件夹</h2>
          <button type="button" className="chrome-icon-button" aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <label className="command-dialog__label" htmlFor="command-folder-name">
          文件夹名称
        </label>
        <input
          id="command-folder-name"
          autoFocus
          value={name}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="command-dialog__actions">
          <button type="button" className="command-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="command-button command-button--primary" disabled={!name.trim()}>
            创建文件夹
          </button>
        </div>
      </form>
    </dialog>
  );
}
