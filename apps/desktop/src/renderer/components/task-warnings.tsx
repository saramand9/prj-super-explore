export function TaskWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <details data-testid="task-warnings" className="px-3 py-2 text-xs text-amber-500 border-b border-border">
      <summary className="cursor-pointer">任务有提示，结果可能不完整（{warnings.length}）</summary>
      <div className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words">{warnings.join('\n')}</div>
    </details>
  );
}
