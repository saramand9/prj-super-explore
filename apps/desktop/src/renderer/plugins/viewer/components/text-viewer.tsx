import { useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js';
import { marked } from 'marked';
import { Eye, Code2 } from 'lucide-react';
import { useViewerStore } from '../store';
import { useLayoutStore } from '../../../framework/store/layout-store';
import '../styles/hljs.css';

function extToLang(filePath: string): string | undefined {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  const map: Record<string, string> = {
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript',
    '.json': 'json', '.jsonc': 'json',
    '.html': 'xml', '.htm': 'xml', '.xml': 'xml', '.svg': 'xml',
    '.css': 'css', '.scss': 'scss', '.less': 'less',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'golang',
    '.java': 'java',
    '.rb': 'ruby',
    '.php': 'php',
    '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
    '.md': 'markdown',
    '.yaml': 'yaml', '.yml': 'yaml',
    '.toml': 'ini',
    '.ini': 'ini', '.cfg': 'ini', '.conf': 'ini',
    '.c': 'c', '.h': 'c',
    '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
    '.sql': 'sql',
    '.diff': 'diff', '.patch': 'diff',
  };
  return map[ext];
}

const isMd = (path: string) => path.toLowerCase().endsWith('.md');

export function TextViewer({ side }: { side: 'left' | 'right' }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const filePath = useLayoutStore((s) => s.layout[side].path);
  const content = useViewerStore((s) => s.content);
  const loading = useViewerStore((s) => s.loading);
  const error = useViewerStore((s) => s.error);
  const loadFile = useViewerStore((s) => s.loadFile);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (filePath) {
      loadFile(filePath);
      setPreview(filePath.toLowerCase().endsWith('.md'));
    }
  }, [filePath, loadFile]);

  const lang = filePath ? extToLang(filePath) : undefined;
  const isMarkdown = filePath ? isMd(filePath) : false;

  const sourceLines = useMemo(() => {
    if (!content) return [];
    try {
      const result = lang
        ? hljs.highlight(content, { language: lang })
        : hljs.highlightAuto(content);
      return result.value.split('\n');
    } catch {
      return escapeHtml(content).split('\n');
    }
  }, [content, lang]);

  const maxLineDigits = String(sourceLines.length).length;

  const previewHtml = useMemo(() => {
    if (!content) return '';
    try {
      return marked.parse(content) as string;
    } catch {
      return escapeHtml(content);
    }
  }, [content]);

  if (!filePath) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        No file selected
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400 text-sm px-4 text-center">
        {error}
      </div>
    );
  }

  const langName = lang ?? 'plain text';
  const showPreview = isMarkdown && preview;

  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="flex-shrink-0 px-3 py-1 border-b border-border text-xs text-text-muted flex items-center gap-2">
        <span className="truncate">{filePath}</span>
        <span className="text-text-muted/50 text-[10px] uppercase tracking-wider">{langName}</span>
        <span className="flex-1" />
        {isMarkdown && (
          <button
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
              showPreview
                ? 'bg-accent/20 text-accent'
                : 'text-text-muted hover:text-text-primary hover:bg-white/5'
            }`}
            onClick={() => setPreview((v) => !v)}
            title={showPreview ? 'Show source' : 'Show preview'}
          >
            {showPreview ? (
              <><Code2 className="w-3 h-3" /> Source</>
            ) : (
              <><Eye className="w-3 h-3" /> Preview</>
            )}
          </button>
        )}
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
      >
        {showPreview ? (
          <div
            className="p-6 text-sm text-text-primary select-text leading-relaxed markdown-body"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        ) : (
          <div className="flex font-mono text-sm leading-relaxed">
            {/* Line numbers */}
            <div
              className="flex-shrink-0 py-4 select-none text-right text-text-muted/50 border-r border-border/30 bg-surface-light/30"
              style={{ minWidth: `${maxLineDigits * 0.75 + 2}em`, paddingRight: '0.75em', paddingLeft: '0.75em' }}
            >
              {sourceLines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            {/* Code */}
            <pre className="flex-1 p-4 whitespace-pre-wrap break-words select-text overflow-x-auto">
              <code className={`hljs ${lang ? `language-${lang}` : ''}`}>
                {sourceLines.map((lineHtml, i) => (
                  <div key={i} dangerouslySetInnerHTML={{ __html: lineHtml || ' ' }} />
                ))}
              </code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
