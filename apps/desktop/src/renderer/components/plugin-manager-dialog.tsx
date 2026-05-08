import { useState, useCallback, useEffect } from 'react';
import { pluginManager } from '../framework/plugin-system';
import type { PluginRegistration } from '../framework/plugin-system';
import { useAppStore } from '../framework/store/app-store';
import { ipc } from '../framework/bridge/ipc-client';

export function PluginManagerDialog() {
  const show = useAppStore((s) => s.showPluginManager);
  const setShow = useAppStore((s) => s.setShowPluginManager);
  const [plugins, setPlugins] = useState<PluginRegistration[]>(pluginManager.getPlugins());
  const [installing, setInstalling] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'info' | 'error' } | null>(null);

  useEffect(() => {
    if (show) setPlugins(pluginManager.getPlugins());
  }, [show]);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    setMsg(null);
    try {
      const result = await ipc.invoke('dialog:openFolder', {});
      if (!result) { setInstalling(false); return; }

      const installResult = await ipc.invoke('plugin:install', { sourcePath: result });
      if (!installResult.success) {
        setMsg({ text: `Install failed: ${installResult.error}`, type: 'error' });
        setInstalling(false);
        return;
      }

      // Load the newly installed plugin
      const pluginId = installResult.pluginId!;
      const jsContent = await ipc.invoke('plugin:readFile', { pluginId, file: 'main.js' });
      const blob = new Blob([jsContent], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const mod = await import(/* @vite-ignore */ url);
      URL.revokeObjectURL(url);

      if (typeof mod.createPlugin === 'function') {
        pluginManager.registerPlugin(mod.createPlugin());
        await pluginManager.activatePlugin(pluginId);
        setMsg({ text: `Plugin "${pluginId}" installed and activated`, type: 'info' });
      }

      setPlugins(pluginManager.getPlugins());
    } catch (err: any) {
      setMsg({ text: `Error: ${err.message}`, type: 'error' });
    }
    setInstalling(false);
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center pt-[15vh]"
      onClick={() => setShow(false)}
    >
      <div
        className="bg-[#1c1c25] border border-border rounded-lg shadow-2xl w-[420px] max-h-[500px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary">Plugin Manager</span>
          <button
            className="text-text-muted hover:text-text-primary transition-colors"
            onClick={() => setShow(false)}
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        {msg && (
          <div className={`px-4 py-2 text-xs ${
            msg.type === 'error' ? 'text-red-400 bg-red-400/10' : 'text-green-400 bg-green-400/10'
          }`}>
            {msg.text}
          </div>
        )}

        {/* Plugin List */}
        <div className="flex-1 overflow-y-auto py-1">
          {plugins.length === 0 ? (
            <div className="px-4 py-8 text-text-muted text-xs text-center">No plugins installed</div>
          ) : (
            plugins.map((reg) => (
              <div
                key={reg.manifest.id}
                className="px-4 py-2.5 flex items-center gap-3 hover:bg-surface-lighter/50"
              >
                <span className="text-sm">
                  {reg.activated ? '🟢' : '⭕'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary truncate">{reg.manifest.name}</div>
                  <div className="text-[10px] text-text-muted">
                    {reg.manifest.id} · v{reg.manifest.version}
                    {reg.activated ? ' · active' : ' · inactive'}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border/40 flex items-center justify-between text-xs">
          <span className="text-text-muted">{plugins.length} plugin(s)</span>
          <button
            className="px-3 py-1 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleInstall}
            disabled={installing}
          >
            {installing ? 'Installing...' : '+ Install'}
          </button>
        </div>
      </div>
    </div>
  );
}
