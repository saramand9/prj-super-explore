/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#181a21',
          light: '#1e2029',
          lighter: '#252832',
        },
        accent: {
          DEFAULT: '#5b8def',
          muted: '#3b5fa0',
        },
        'text-primary': '#e3e5e9',
        'text-secondary': '#989ba4',
        'text-muted': '#5c5f6b',
        border: '#1e2028',
        'border-strong': '#2a2d36',
        green: '#33b074',
      },
    },
  },
  plugins: [],
};
