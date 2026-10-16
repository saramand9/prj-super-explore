import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app';
import { bootstrapPlugins } from './plugins';
import { ipc } from './framework/bridge/ipc-client';
import { useLayoutStore } from './framework/store/layout-store';
import './styles/globals.css';
import { ErrorBoundary } from './components/error-boundary';
import { registerErrorReporting, reportError } from './framework/diagnostics';

registerErrorReporting();

// Expose for external plugins
(window as any).__EXPLORE__ = { React, ipc };

async function init() {
  await useLayoutStore.getState().loadPreferences();
  await bootstrapPlugins();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary name="App">
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

void init().catch((error) => {
  reportError('renderer-startup', error);
  const root = document.getElementById('root')!;
  root.textContent = '应用启动失败。';
  const retry = document.createElement('button');
  retry.textContent = '重新加载';
  retry.onclick = () => window.location.reload();
  const copy = document.createElement('button');
  copy.textContent = '复制诊断信息';
  copy.onclick = () => {
    void ipc
      .invoke('app:copyDiagnostics', { source: 'renderer-startup', message: String(error) })
      .catch(() => {});
  };
  root.append(retry, copy);
});
