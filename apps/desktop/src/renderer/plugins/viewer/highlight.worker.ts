import hljs from 'highlight.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

self.onmessage = (e: MessageEvent<{ content: string; lang?: string; version: number }>) => {
  const { content, lang, version } = e.data;
  try {
    const result = lang ? hljs.highlight(content, { language: lang }) : hljs.highlightAuto(content);
    self.postMessage({ lines: result.value.split('\n'), version });
  } catch {
    self.postMessage({ lines: escapeHtml(content).split('\n'), version });
  }
};
