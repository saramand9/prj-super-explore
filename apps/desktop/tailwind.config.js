/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#1a1a2e',
          light: '#16213e',
          lighter: '#0f3460',
        },
        accent: {
          DEFAULT: '#4a9eff',
          blue: '#1e5fbb',
        },
      },
    },
  },
  plugins: [],
};
