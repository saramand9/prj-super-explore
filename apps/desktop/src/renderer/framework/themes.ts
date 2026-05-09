export type ThemeName = 'linear' | 'vscode' | 'mono' | 'sakura' | 'glass' | 'neon' | 'aurora' | 'mecha';

export interface ThemeVars {
  '--bg-app': string;
  '--bg-pattern': string;
  '--bg-surface': string;
  '--bg-surface-elevated': string;
  '--bg-surface-hover': string;
  '--bg-toolbar': string;
  '--text-primary': string;
  '--text-secondary': string;
  '--text-muted': string;
  '--accent': string;
  '--accent-rgb': string;
  '--accent-muted': string;
  '--accent-subtle': string;
  '--border-color': string;
  '--border-color-strong': string;
  '--green': string;
  '--red': string;
  '--yellow': string;
  '--scrollbar-thumb': string;
  '--scrollbar-thumb-hover': string;
  '--shadow-sm': string;
  '--shadow-md': string;
  '--shadow-lg': string;
}

export interface ThemeDef {
  label: string;
  className: string;
  vars: ThemeVars;
}

export const themes: Record<ThemeName, ThemeDef> = {
  linear: {
    label: 'Linear',
    className: '',
    vars: {
      '--bg-app': '#0d0f13',
      '--bg-pattern': 'none',
      '--bg-surface': '#181a21',
      '--bg-surface-elevated': '#1e2029',
      '--bg-surface-hover': '#252832',
      '--bg-toolbar': '#15171d',
      '--text-primary': '#e3e5e9',
      '--text-secondary': '#989ba4',
      '--text-muted': '#5c5f6b',
      '--accent': '#5b8def',
      '--accent-rgb': '91 141 239',
      '--accent-muted': '#3b5fa0',
      '--accent-subtle': 'rgba(91,141,239,0.08)',
      '--border-color': '#1e2028',
      '--border-color-strong': '#2a2d36',
      '--green': '#33b074',
      '--red': '#eb5757',
      '--yellow': '#e5a54b',
      '--scrollbar-thumb': '#2a2d36',
      '--scrollbar-thumb-hover': '#3a3d48',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.4)',
      '--shadow-md': '0 4px 12px rgba(0,0,0,0.5)',
      '--shadow-lg': '0 8px 24px rgba(0,0,0,0.6)',
    },
  },
  vscode: {
    label: 'VS Code',
    className: '',
    vars: {
      '--bg-app': '#1e1e2e',
      '--bg-pattern': 'none',
      '--bg-surface': '#252538',
      '--bg-surface-elevated': '#2d2d42',
      '--bg-surface-hover': '#353550',
      '--bg-toolbar': '#222233',
      '--text-primary': '#ccccd6',
      '--text-secondary': '#9d9dae',
      '--text-muted': '#6a6a7a',
      '--accent': '#569cd6',
      '--accent-rgb': '86 156 214',
      '--accent-muted': '#3a6d9e',
      '--accent-subtle': 'rgba(86,156,214,0.08)',
      '--border-color': '#3a3a50',
      '--border-color-strong': '#4a4a60',
      '--green': '#4ec9b0',
      '--red': '#f44747',
      '--yellow': '#dcdcaa',
      '--scrollbar-thumb': '#3a3a50',
      '--scrollbar-thumb-hover': '#4a4a60',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.5)',
      '--shadow-md': '0 4px 12px rgba(0,0,0,0.6)',
      '--shadow-lg': '0 8px 24px rgba(0,0,0,0.7)',
    },
  },
  mono: {
    label: '极简',
    className: '',
    vars: {
      '--bg-app': '#0a0a0a',
      '--bg-pattern': 'none',
      '--bg-surface': '#141414',
      '--bg-surface-elevated': '#1a1a1a',
      '--bg-surface-hover': '#222222',
      '--bg-toolbar': '#111111',
      '--text-primary': '#f0f0f0',
      '--text-secondary': '#999999',
      '--text-muted': '#555555',
      '--accent': '#aaaaaa',
      '--accent-rgb': '170 170 170',
      '--accent-muted': '#777777',
      '--accent-subtle': 'rgba(255,255,255,0.06)',
      '--border-color': '#202020',
      '--border-color-strong': '#333333',
      '--green': '#888888',
      '--red': '#999999',
      '--yellow': '#aaaaaa',
      '--scrollbar-thumb': '#2a2a2a',
      '--scrollbar-thumb-hover': '#3a3a3a',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.6)',
      '--shadow-md': '0 4px 12px rgba(0,0,0,0.7)',
      '--shadow-lg': '0 8px 24px rgba(0,0,0,0.8)',
    },
  },
  sakura: {
    label: '桜',
    className: 'anime-bg',
    vars: {
      '--bg-app': '#1a1220',
      '--bg-pattern': `
        radial-gradient(ellipse 80% 60% at 20% 30%, rgba(247,139,200,0.06) 0%, transparent 50%),
        radial-gradient(ellipse 60% 50% at 80% 70%, rgba(180,120,220,0.05) 0%, transparent 50%),
        radial-gradient(circle at 70% 20%, rgba(255,200,230,0.04) 0%, transparent 30%),
        radial-gradient(circle at 30% 80%, rgba(200,160,230,0.04) 0%, transparent 30%),
        radial-gradient(circle at 50% 50%, rgba(255,180,210,0.03) 0%, transparent 40%),
        radial-gradient(ellipse 40% 30% at 15% 60%, rgba(247,139,200,0.05) 0%, transparent 50%),
        radial-gradient(ellipse 50% 30% at 85% 40%, rgba(180,140,220,0.04) 0%, transparent 50%),
        radial-gradient(circle at 10% 15%, rgba(255,220,240,0.06) 0%, transparent 25%),
        radial-gradient(circle at 90% 85%, rgba(240,160,200,0.05) 0%, transparent 25%),
        radial-gradient(circle at 60% 10%, rgba(220,180,240,0.04) 0%, transparent 20%)
      `,
      '--bg-surface': '#241830',
      '--bg-surface-elevated': '#2e1e3c',
      '--bg-surface-hover': '#382548',
      '--bg-toolbar': '#1e1428',
      '--text-primary': '#f0e0f4',
      '--text-secondary': '#c8a8d8',
      '--text-muted': '#8a6a98',
      '--accent': '#f78bc8',
      '--accent-rgb': '247 139 200',
      '--accent-muted': '#b86090',
      '--accent-subtle': 'rgba(247,139,200,0.10)',
      '--border-color': '#3a2650',
      '--border-color-strong': '#4e3870',
      '--green': '#7ee8c8',
      '--red': '#f08898',
      '--yellow': '#f8c878',
      '--scrollbar-thumb': '#3a2650',
      '--scrollbar-thumb-hover': '#4e3870',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.5)',
      '--shadow-md': '0 4px 12px rgba(0,0,0,0.6)',
      '--shadow-lg': '0 8px 24px rgba(0,0,0,0.7)',
    },
  },
  glass: {
    label: '玻璃',
    className: 'theme-glass',
    vars: {
      '--bg-app': '#0b0d11',
      '--bg-pattern': `
        radial-gradient(ellipse 60% 40% at 20% 30%, rgba(120,130,160,0.04) 0%, transparent 50%),
        radial-gradient(ellipse 50% 40% at 80% 20%, rgba(100,110,140,0.03) 0%, transparent 50%),
        radial-gradient(ellipse 40% 30% at 50% 70%, rgba(90,100,130,0.04) 0%, transparent 40%)
      `,
      '--bg-surface': 'rgba(22,24,30,0.50)',
      '--bg-surface-elevated': 'rgba(28,30,38,0.65)',
      '--bg-surface-hover': 'rgba(34,36,46,0.78)',
      '--bg-toolbar': 'rgba(16,18,22,0.40)',
      '--text-primary': '#e0e2e6',
      '--text-secondary': '#9498a0',
      '--text-muted': '#565960',
      '--accent': '#99a5c9',
      '--accent-rgb': '153 165 201',
      '--accent-muted': '#6e7896',
      '--accent-subtle': 'rgba(153,165,201,0.06)',
      '--border-color': 'rgba(255,255,255,0.05)',
      '--border-color-strong': 'rgba(255,255,255,0.10)',
      '--green': '#8ab89a',
      '--red': '#d49595',
      '--yellow': '#c9b882',
      '--scrollbar-thumb': 'rgba(255,255,255,0.06)',
      '--scrollbar-thumb-hover': 'rgba(255,255,255,0.12)',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.3)',
      '--shadow-md': '0 8px 32px rgba(0,0,0,0.35)',
      '--shadow-lg': '0 16px 48px rgba(0,0,0,0.45)',
    },
  },
  neon: {
    label: '霓虹赛博',
    className: 'theme-neon',
    vars: {
      '--bg-app': '#0a0c14',
      '--bg-pattern': 'none',
      '--bg-surface': '#0f111d',
      '--bg-surface-elevated': '#141724',
      '--bg-surface-hover': '#1a1e30',
      '--bg-toolbar': '#0c0e18',
      '--text-primary': '#e0e0f0',
      '--text-secondary': '#8890b0',
      '--text-muted': '#4a5068',
      '--accent': '#00d4ff',
      '--accent-rgb': '0 212 255',
      '--accent-muted': '#007a99',
      '--accent-subtle': 'rgba(0,212,255,0.06)',
      '--border-color': '#1a1e2e',
      '--border-color-strong': '#282e44',
      '--green': '#00e676',
      '--red': '#ff3d5c',
      '--yellow': '#ffab00',
      '--scrollbar-thumb': '#1a1e30',
      '--scrollbar-thumb-hover': '#2a2e44',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.5)',
      '--shadow-md': '0 4px 16px rgba(0,200,255,0.08)',
      '--shadow-lg': '0 8px 32px rgba(0,200,255,0.12)',
    },
  },
  aurora: {
    label: '极光渐变',
    className: 'theme-aurora',
    vars: {
      '--bg-app': '#0d1618',
      '--bg-pattern': `
        radial-gradient(ellipse 60% 50% at 30% 20%, rgba(0,200,180,0.06) 0%, transparent 50%),
        radial-gradient(ellipse 50% 40% at 70% 50%, rgba(80,150,200,0.05) 0%, transparent 50%),
        radial-gradient(ellipse 40% 50% at 50% 80%, rgba(120,200,160,0.05) 0%, transparent 40%)
      `,
      '--bg-surface': '#131f22',
      '--bg-surface-elevated': '#18272b',
      '--bg-surface-hover': '#1e3035',
      '--bg-toolbar': '#101a1c',
      '--text-primary': '#d8e8e6',
      '--text-secondary': '#8aa8a4',
      '--text-muted': '#4a6a66',
      '--accent': '#5cc9b4',
      '--accent-rgb': '92 201 180',
      '--accent-muted': '#3a8a7a',
      '--accent-subtle': 'rgba(92,201,180,0.06)',
      '--border-color': '#1a2c2a',
      '--border-color-strong': '#284440',
      '--green': '#4ec9b0',
      '--red': '#e06c75',
      '--yellow': '#d4b86a',
      '--scrollbar-thumb': '#1a2c2a',
      '--scrollbar-thumb-hover': '#2a3c3a',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.4)',
      '--shadow-md': '0 4px 16px rgba(0,0,0,0.4)',
      '--shadow-lg': '0 8px 32px rgba(0,0,0,0.5)',
    },
  },
  mecha: {
    label: '机甲橙线',
    className: 'theme-mecha',
    vars: {
      '--bg-app': '#08080c',
      '--bg-pattern': 'none',
      '--bg-surface': '#0e0e14',
      '--bg-surface-elevated': '#14141c',
      '--bg-surface-hover': '#1a1a24',
      '--bg-toolbar': '#0a0a10',
      '--text-primary': '#deded8',
      '--text-secondary': '#909088',
      '--text-muted': '#4a4a44',
      '--accent': '#ff6d3a',
      '--accent-rgb': '255 109 58',
      '--accent-muted': '#b84520',
      '--accent-subtle': 'rgba(255,109,58,0.06)',
      '--border-color': '#18181a',
      '--border-color-strong': '#2a2a2e',
      '--green': '#66cc66',
      '--red': '#ff4444',
      '--yellow': '#ff9944',
      '--scrollbar-thumb': '#1a1a1c',
      '--scrollbar-thumb-hover': '#2a2a2c',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.6)',
      '--shadow-md': '0 4px 12px rgba(0,0,0,0.6)',
      '--shadow-lg': '0 8px 24px rgba(255,109,58,0.08)',
    },
  },
};
