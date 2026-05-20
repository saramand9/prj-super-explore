import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Eye, Code2, ScrollText } from 'lucide-react';
import { useViewerStore, type SearchHighlight } from '../store';
import { useLayoutStore } from '../../../framework/store/layout-store';
import HighlightWorker from '../highlight.worker?worker';
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
const defaultTailMode = (path: string) => /\.(log|txt)$/i.test(path);

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
  const content = useViewerStore((s) => s[side].content);
  const loading = useViewerStore((s) => s[side].loading);
  const error = useViewerStore((s) => s[side].error);
  const watchError = useViewerStore((s) => s[side].watchError);
  const readInfo = useViewerStore((s) => s[side].readInfo);
  const loadFile = useViewerStore((s) => s.loadFile);
  const loadFullFile = useViewerStore((s) => s.loadFullFile);
  const searchHighlight = useViewerStore((s) => s[side].searchHighlight);
  const [preview, setPreview] = useState(false);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [tailMode, setTailMode] = useState(false);

  useEffect(() => {
    if (filePath) {
      loadFile(side, filePath);
      setPreview(filePath.toLowerCase().endsWith('.md'));
      setTailMode(defaultTailMode(filePath));
      setActiveLine(null);
    }
  }, [filePath, side, loadFile]);

  const lang = filePath ? extToLang(filePath) : undefined;
  const isMarkdown = filePath ? isMd(filePath) : false;
  const isCsvFile = filePath ? isCsv(filePath) : false;

  const workerRef = useRef<Worker | null>(null);
  const contentVersionRef = useRef(0);
  const [highlightedLines, setHighlightedLines] = useState<string[] | null>(null);

  // 纯文本兜底：content 变化时同步派生，永不空白
  const plainLines = useMemo(() => {
    if (!content) return [];
    return escapeHtml(content).split('\n');
  }, [content]);
  const rawLines = useMemo(() => {
    if (!content) return [];
    return content.split('\n').map((line) => line.replace(/\r$/, ''));
  }, [content]);

  const sourceLines = highlightedLines ?? plainLines;

  // Worker 异步高亮
  useEffect(() => {
    if (!content) {
      setHighlightedLines(null);
      return;
    }
    // 清掉旧高亮，先显示纯文本
    setHighlightedLines(null);
    const version = ++contentVersionRef.current;

    if (!workerRef.current) {
      workerRef.current = new HighlightWorker();
    }
    const worker = workerRef.current;
    worker.onmessage = (e) => {
      if (e.data.version === contentVersionRef.current) {
        setHighlightedLines(e.data.lines);
      }
    };
    worker.postMessage({ content, lang, version });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, lang]);

  const maxLineDigits = String(sourceLines.length).length;
  const colWidth = `${maxLineDigits * 0.75 + 2}em`;

  const virtualizer = useVirtualizer({
    count: sourceLines.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 23,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 20,
  });

  const isSearchHighlightForFile =
    !!filePath &&
    !!searchHighlight &&
    normalizePath(searchHighlight.filePath) === normalizePath(filePath);

  useEffect(() => {
    if (!isSearchHighlightForFile || !searchHighlight || sourceLines.length === 0) return;
    const lineIdx = Math.max(0, Math.min(searchHighlight.lineNumber - 1, sourceLines.length - 1));
    setActiveLine(lineIdx);
    setTailMode(false);
    setPreview(false);
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(lineIdx, { align: 'center' });
    });
  }, [isSearchHighlightForFile, searchHighlight, sourceLines.length, virtualizer]);

  // tail -f: 内容变更时自动滚到底部
  const tailRef = useRef(tailMode);
  tailRef.current = tailMode;
  useEffect(() => {
    if (isSearchHighlightForFile) return;
    if (!tailRef.current || !containerRef.current) return;
    requestAnimationFrame(() => {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [content, isSearchHighlightForFile]);

  // 手动滚动时关掉 tail 模式
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    if (!atBottom && tailRef.current) setTailMode(false);
  }, []);

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

  const showSearchSource = isSearchHighlightForFile;
  const showPreview = isMarkdown && preview && !showSearchSource;

  return (
    <div className="h-full flex flex-col bg-surface">
      {readInfo?.partial && (
        <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
          <span className="min-w-0 truncate">
            文件较大，仅加载前 {formatBytes(readInfo.bytesRead)} / {formatBytes(readInfo.size)}。
          </span>
          {readInfo.canContinue && (
            <button
              className="flex-shrink-0 px-2 py-0.5 rounded border border-yellow-400/40 text-yellow-100 hover:bg-yellow-400/20"
              onClick={() => loadFullFile(side)}
            >
              继续加载完整文件
            </button>
          )}
        </div>
      )}
      {watchError && (
        <div className="flex-shrink-0 border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 whitespace-pre-wrap break-words">
          {watchError}
        </div>
      )}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative"
        onScroll={handleScroll}
      >
        {/* Tail + Markdown toggle — floating */}
        <div className="absolute top-2 right-2 z-10 flex gap-1">
          <button
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors shadow-md ${
              tailMode
                ? 'bg-accent/40 text-white'
                : 'bg-surface-light/90 text-text-muted hover:text-text-primary border border-border/30'
            }`}
            onClick={() => { setTailMode((v) => !v); }}
            title={tailMode ? 'Tail mode on — auto-scroll' : 'Tail mode off'}
          >
            <ScrollText className="w-3 h-3" /> Tail
          </button>
          {isMarkdown && (
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
          )}
        </div>
        {showPreview ? (
          <div
            className="p-6 text-sm text-text-primary select-text leading-relaxed markdown-body"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        ) : isCsvFile && csvRows && csvRows.length > 0 && !showSearchSource ? (
          <CsvTable rows={csvRows} />
        ) : (
          <div className="relative font-mono text-sm leading-relaxed py-4"
            style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((vItem) => {
              const i = vItem.index;
              const lineHtml = sourceLines[i];
              const isActive = i === activeLine;
              const displayLineHtml =
                showSearchSource && searchHighlight && i === searchHighlight.lineNumber - 1
                  ? highlightRawLineFirst(rawLines[i] ?? '', searchHighlight)
                  : lineHtml;
              const activeCls = isActive ? 'bg-accent/15' : '';
              return (
                <div
                  key={i}
                  ref={virtualizer.measureElement}
                  data-index={i}
                  className="absolute left-0 w-full grid"
                  style={{
                    gridTemplateColumns: colWidth + ' 1fr',
                    transform: `translateY(${vItem.start}px)`,
                  }}
                >
                  <div
                    className={`text-right text-text-muted/30 select-none cursor-pointer hover:bg-surface-lighter/50 ${activeCls}`}
                    style={{ paddingRight: '1em', paddingLeft: '0.75em' }}
                    onClick={() => setActiveLine(i)}
                  >
                    {i + 1}
                  </div>
                  <code
                    className={`hljs ${lang ? `language-${lang}` : ''} whitespace-pre-wrap break-words cursor-pointer hover:bg-surface-lighter/50 ${activeCls}`}
                    style={{ paddingLeft: '1rem', paddingRight: '1rem' }}
                    onClick={() => setActiveLine(i)}
                  >
                    <div dangerouslySetInnerHTML={{ __html: displayLineHtml || ' ' }} />
                  </code>
                </div>
              );
            })}
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

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function highlightRawLineFirst(line: string, highlight: SearchHighlight): string {
  const rangeStart =
    typeof highlight.columnStart === 'number' && highlight.columnStart > 0
      ? highlight.columnStart - 1
      : -1;
  const rangeEnd =
    typeof highlight.columnEnd === 'number' && highlight.columnEnd > rangeStart
      ? highlight.columnEnd - 1
      : -1;

  let start = rangeStart;
  let end = rangeEnd;

  const rangeText = start >= 0 && end > start ? line.slice(start, Math.min(end, line.length)) : '';
  const expected = highlight.text.trim();
  const rangeMatches =
    !expected ||
    rangeText.toLowerCase() === expected.toLowerCase();

  if (start < 0 || end <= start || start >= line.length || !rangeMatches) {
    const needle = highlight.text.trim();
    if (!needle) return escapeHtml(line);
    start = line.toLowerCase().indexOf(needle.toLowerCase());
    if (start < 0) return escapeHtml(line);
    end = start + needle.length;
  }

  end = Math.min(end, line.length);

  return [
    escapeHtml(line.slice(0, start)),
    '<mark class="bg-yellow-300 text-black rounded-sm px-0.5">',
    escapeHtml(line.slice(start, end)),
    '</mark>',
    escapeHtml(line.slice(end)),
  ].join('');
}
