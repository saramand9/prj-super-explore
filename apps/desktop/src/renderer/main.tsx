import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app';
import { bootstrapPlugins } from './plugins';
import { ipc } from './framework/bridge/ipc-client';
import './styles/globals.css';

// Expose for external plugins
(window as any).__EXPLORE__ = { React, ipc };

async function init() {
  await bootstrapPlugins();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

init();
