import { useCallback } from 'react';
import { Folder, Search, Star, FileText, Smile } from 'lucide-react';
import { useLayoutStore } from '../framework/layout';
import { pluginManager } from '../framework/plugin-system';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  folder: Folder,
  search: Search,
  star: Star,
  '📁': Folder,
  '🔍': Search,
  '⭐': Star,
  '📄': FileText,
  '👋': Smile,
};

function getIcon(iconName: string) {
  const Icon = ICON_MAP[iconName] ?? Folder;
  return Icon;
}

export function ActivityBar({
  onPluginChange,
}: {
  onPluginChange: (side: 'left' | 'right', pluginId: string, panelId: string) => void;
}) {
  const activePanel = useLayoutStore((s) => s.layout.id);
  const leftPlugin = useLayoutStore((s) => s.layout.left.pluginId);
  const rightPlugin = useLayoutStore((s) => s.layout.right.pluginId);

  const currentPlugin =
    activePanel === 'left' || activePanel === 'right'
      ? useLayoutStore.getState().layout[activePanel].pluginId
      : leftPlugin;

  const items = pluginManager.getActivityBarPanels();

  const handleClick = useCallback(
    (pluginId: string, panelId: string) => {
      const layout = useLayoutStore.getState().layout;
      const targetSide = layout.id === 'left' || layout.id === 'right' ? layout.id : 'left';
      onPluginChange(targetSide, pluginId, panelId);
    },
    [onPluginChange],
  );

  return (
    <div className="w-10 flex-shrink-0 bg-surface-light border-r border-border flex flex-col items-center py-2 gap-1">
      {items.map((item) => {
        const Icon = getIcon(item.icon ?? '');
        const isCurrent = currentPlugin === item.pluginId;
        return (
          <button
            key={item.id}
            className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
              isCurrent
                ? 'bg-accent/15 text-accent'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-lighter'
            }`}
            onClick={() => handleClick(item.pluginId, item.panelId)}
            title={item.title}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}
