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
const isCsv = (path: string) => path.toLowerCase().endsWith('.csv');

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      } else if (ch !== '\r') {
        field += ch;
      }
    }
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);

  return rows;
}

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
  const isCsvFile = filePath ? isCsv(filePath) : false;

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

  const csvRows = useMemo(() => {
    if (!content) return null;
    return parseCsv(content);
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

  const showPreview = isMarkdown && preview;

  return (
    <div className="h-full flex flex-col bg-surface">
      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative"
      >
        {/* Markdown toggle — floating */}
        {isMarkdown && (
          <div className="absolute top-2 right-2 z-10">
            <button
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors shadow-md ${
                showPreview
                  ? 'bg-accent/40 text-white'
                  : 'bg-surface-light/90 text-text-muted hover:text-text-primary border border-border/30'
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
          </div>
        )}
        {showPreview ? (
          <div
            className="p-6 text-sm text-text-primary select-text leading-relaxed markdown-body"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        ) : isCsvFile && csvRows && csvRows.length > 0 ? (
          <CsvTable rows={csvRows} />
        ) : (
          <div className="flex font-mono text-sm leading-relaxed">
            <div
              className="flex-shrink-0 py-4 select-none text-right text-text-muted/50 border-r border-border/30 bg-surface-light/30"
              style={{ minWidth: `${maxLineDigits * 0.75 + 2}em`, paddingRight: '0.75em', paddingLeft: '0.75em' }}
            >
              {sourceLines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
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

function CsvTable({ rows }: { rows: string[][] }) {
  const header = rows[0];
  const data = rows.length > 1 ? rows.slice(1) : [];

  return (
    <div className="overflow-auto">
      <table className="text-xs border-collapse w-max min-w-full">
        <thead>
          <tr className="sticky top-0 z-10">
            <th className="sticky left-0 z-20 bg-surface-light px-3 py-1.5 border-b border-r border-border/50 text-text-muted font-medium text-right select-none w-8">
              #
            </th>
            {header.map((col, i) => (
              <th
                key={i}
                className="bg-surface-light px-3 py-1.5 border-b border-r border-border/50 text-text-primary font-medium whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={ri} className="hover:bg-surface-lighter/30 transition-colors">
              <td className="sticky left-0 bg-surface px-3 py-1 border-b border-r border-border/30 text-text-muted/60 text-right select-none">
                {ri + 1}
              </td>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-3 py-1 border-b border-r border-border/20 text-text-secondary whitespace-nowrap max-w-[400px] truncate"
                  title={cell}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && (
        <div className="p-6 text-center text-text-muted text-sm">
          Empty CSV (header only)
        </div>
      )}
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
