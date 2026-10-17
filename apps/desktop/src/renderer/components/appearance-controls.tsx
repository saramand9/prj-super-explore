import { Columns2, PanelLeft, Palette, Type } from 'lucide-react';
import { useLayoutStore } from '../framework/store/layout-store';
import { themes } from '../framework/themes';

export function AppearanceControls() {
  const { theme, setTheme, fontScale, setFontScale, layout, setMode } = useLayoutStore();
  const scales = [...new Set([100, 120, 130, 140, 160, 180, 200, fontScale])].sort((a, b) => a - b);
  const LayoutIcon = layout.mode === 'dual' ? Columns2 : PanelLeft;
  return (
    <div className="appearance-controls" role="group" aria-label="外观设置">
      <label className="appearance-controls__field">
        <Palette aria-hidden="true" size={14} />
        <select
          title="主题"
          aria-label="主题"
          value={theme}
          onChange={(event) => setTheme(event.target.value)}
        >
          {Object.entries(themes).map(([id, value]) => (
            <option key={id} value={id}>
              {value.label}
            </option>
          ))}
        </select>
      </label>
      <label className="appearance-controls__field appearance-controls__field--scale">
        <Type aria-hidden="true" size={14} />
        <select
          title="字号"
          aria-label="字号"
          value={fontScale}
          onChange={(event) => setFontScale(Number(event.target.value))}
        >
          {scales.map((value) => (
            <option key={value} value={value}>
              {value}%
            </option>
          ))}
        </select>
      </label>
      <button
        className="chrome-icon-button"
        title={layout.mode === 'dual' ? '切换为单栏' : '切换为双栏'}
        aria-label={layout.mode === 'dual' ? '切换为单栏' : '切换为双栏'}
        aria-pressed={layout.mode === 'dual'}
        onClick={() => setMode(layout.mode === 'dual' ? 'single' : 'dual')}
      >
        <LayoutIcon size={16} strokeWidth={1.7} />
      </button>
    </div>
  );
}
