export type ThemeName = 'linear' | 'vscode' | 'mono' | 'sakura';

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

export const themes: Record<ThemeName, { label: string; vars: ThemeVars }> = {
  linear: {
    label: 'Linear',
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
};
