import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

// Global error registry and diagnostics setup
const globalErrors: any[] = [];

function isIgnoredError(message: string, filename?: string, lineno?: number, colno?: number, stack?: string | null): boolean {
  const msg = (message || '').toLowerCase();
  const file = (filename || '').toLowerCase();
  const stk = (stack || '').toLowerCase();

  // 1. Se o erro contiver “@vite/client”, ignorar no painel de diagnóstico.
  if (msg.includes('@vite/client') || file.includes('@vite/client') || stk.includes('@vite/client')) {
    return true;
  }

  // 2. Se o erro contiver “WebSocket closed without opened”, ignorar no painel de diagnóstico.
  if (msg.includes('websocket closed without opened')) {
    return true;
  }

  // 3. Se o erro for “Script error.” sem stack, sem arquivo, sem linha e sem coluna, ignorar no painel de diagnóstico.
  if (msg === 'script error.' || msg.includes('script error')) {
    const hasStack = !!stk;
    const hasFile = !!file && file !== 'http://localhost:3000/' && file !== 'https://localhost:3000/' && !file.includes(window.location.host);
    const hasLineCol = (lineno && lineno > 0) || (colno && colno > 0);
    if (!hasStack && !hasFile && !hasLineCol) {
      return true;
    }
  }

  return false;
}

function escapeHtml(str: string) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function updateDiagnosticsPanel() {
  const activeErrors = globalErrors.filter(err => !isIgnoredError(err.message, err.filename, err.lineno, err.colno, err.stack || err.reason));

  let panel = document.getElementById('tech-diagnostics-panel');
  if (activeErrors.length === 0) {
    if (panel) {
      panel.remove();
    }
    return;
  }

  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'tech-diagnostics-panel';
    panel.style.position = 'fixed';
    panel.style.bottom = '16px';
    panel.style.left = '16px';
    panel.style.right = '16px';
    panel.style.maxHeight = '320px';
    panel.style.overflowY = 'auto';
    panel.style.backgroundColor = '#0f172a'; // slate-900
    panel.style.color = '#f8fafc'; // slate-50
    panel.style.padding = '18px';
    panel.style.borderRadius = '16px';
    panel.style.border = '2px solid #ef4444'; // red-500
    panel.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.4), 0 10px 10px -5px rgba(0,0,0,0.3)';
    panel.style.zIndex = '999999';
    panel.style.fontFamily = 'monospace';
    panel.style.fontSize = '12px';
    panel.style.lineHeight = '1.5';
    document.body.appendChild(panel);
  }

  panel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-b: 1px solid #334155; padding-bottom: 10px; margin-bottom: 12px;">
      <span style="font-weight: bold; color: #f87171; display: flex; align-items: center; gap: 6px;">
        🛑 Diagnóstico técnico — V0.4.0-rc2
      </span>
      <button onclick="document.getElementById('tech-diagnostics-panel').remove()" style="background: #ef4444; border: none; color: white; cursor: pointer; font-size: 11px; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-family: sans-serif;">FECHAR</button>
    </div>
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="color: #94a3b8; font-size: 11px; background-color: #1e293b; padding: 8px 12px; border-radius: 8px; border: 1px dashed #475569;">
        <strong>Origem Comum:</strong> "Script error." geralmente ocorre quando scripts de terceiros ou extensões do navegador (fora do Vistoria Fácil) falham dentro do iframe do AI Studio devido à política de CORS.
      </div>
      ${activeErrors.map((err, idx) => `
        <div style="background-color: #020617; padding: 12px; border-radius: 8px; border: 1px solid #1e293b; border-left: 4px solid #ef4444;">
          <div style="font-weight: bold; color: #ef4444; margin-bottom: 6px;">[Erro #${idx + 1}]: ${escapeHtml(err.message)}</div>
          ${err.filename ? `<div style="color: #38bdf8; font-size: 11px; margin-bottom: 4px;">Arquivo: ${escapeHtml(err.filename)} : ${err.lineno}:${err.colno}</div>` : ''}
          ${err.stack ? `<pre style="margin: 8px 0 0 0; white-space: pre-wrap; font-size: 10px; color: #94a3b8; background: #0b0f19; padding: 8px; border-radius: 6px; border: 1px solid #1e293b; overflow-x: auto;">${escapeHtml(err.stack)}</pre>` : ''}
          ${err.reason ? `<div style="color: #fb923c; margin-top: 6px; font-size: 11px;">Rejeição da Promise: ${escapeHtml(err.reason)}</div>` : ''}
        </div>
      `).join('')}
    </div>
    <div style="font-size: 10px; color: #475569; margin-top: 12px; text-align: right; border-top: 1px solid #1e293b; padding-top: 8px;">
      Vistoria Fácil IA • Ambiente de Diagnóstico Ativo
    </div>
  `;
}

// 1. window.onerror capturing
window.onerror = function (message, filename, lineno, colno, error) {
  globalErrors.push({
    message: String(message),
    filename: filename || '',
    lineno: lineno || 0,
    colno: colno || 0,
    stack: error?.stack || null
  });
  updateDiagnosticsPanel();
  return false; // Do not return true to avoid supressing the original error
};

// 2. window.addEventListener("error") for resources or other script compilation problems
window.addEventListener('error', (event) => {
  // Prevent duplicate registering of errors already captured by window.onerror
  if (event.error) return; 
  
  const target = event.target as any;
  if (target && (target.src || target.href)) {
    globalErrors.push({
      message: `Falha de carregamento de recurso de rede (${target.tagName}): ${target.src || target.href}`,
      filename: target.src || target.href || ''
    });
    updateDiagnosticsPanel();
  }
}, true); // Use capture phase to catch resource loading errors

// 3. window.addEventListener("unhandledrejection")
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  globalErrors.push({
    message: `Rejeição de Promise não tratada: ${reason instanceof Error ? reason.message : String(reason)}`,
    stack: reason instanceof Error ? reason.stack : null,
    reason: String(reason)
  });
  updateDiagnosticsPanel();
});

import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);


