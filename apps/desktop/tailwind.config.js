/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'var(--bg-surface)',
          light: 'var(--bg-surface-elevated)',
          lighter: 'var(--bg-surface-hover)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          muted: 'var(--accent-muted)',
        },
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        border: 'var(--border-color)',
        'border-strong': 'var(--border-color-strong)',
        green: 'var(--green)',
      },
    },
  },
  plugins: [],
};
