import { useCallback } from 'react';
import { useLayoutStore } from '../framework/layout';

const ACTIVITY_ITEMS = [
  { id: 'file-explorer' as const, icon: '📁', label: 'Explorer' },
  { id: 'fulltext-search' as const, icon: '🔍', label: 'Search' },
  { id: 'bookmarks' as const, icon: '⭐', label: 'Bookmarks' },
];

export function ActivityBar() {
  const activePanel = useLayoutStore((s) => s.layout.id);
  const leftPlugin = useLayoutStore((s) => s.layout.left.pluginId);
  const rightPlugin = useLayoutStore((s) => s.layout.right.pluginId);

  const currentPlugin = (activePanel === 'left' || activePanel === 'right')
    ? useLayoutStore.getState().layout[activePanel].pluginId
    : leftPlugin;

  const handleClick = useCallback((pluginId: string) => {
    const layout = useLayoutStore.getState().layout;
    const targetSide = layout.id === 'left' || layout.id === 'right' ? layout.id : 'left';
    useLayoutStore.getState().setPanelPlugin(
      targetSide as 'left' | 'right',
      pluginId,
      pluginId === 'file-explorer' ? 'browser' : pluginId === 'fulltext-search' ? 'search' : 'list',
    );
  }, []);

  return (
    <div className="w-10 flex-shrink-0 bg-surface-light border-r border-border flex flex-col items-center py-2 gap-1">
      {ACTIVITY_ITEMS.map((item) => (
        <button
          key={item.id}
          className={`w-8 h-8 flex items-center justify-center rounded text-sm transition-colors ${
            currentPlugin === item.id
              ? 'bg-accent/20 text-accent'
              : 'text-text-muted hover:text-text-secondary hover:bg-surface-lighter'
          }`}
          onClick={() => handleClick(item.id)}
          title={item.label}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}
