import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        headline: ['Inter', 'sans-serif'],
        body: ['DM Sans', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        xs: '10px',
        s: '16px',
        m: '22px',
      },
      colors: {
        gold: {
          DEFAULT: '#FFB700',
          dark: '#E59A00',
          light: '#FFB700',
        },
        green: {
          deep: '#7A8F6A',
          DEFAULT: '#7A8F6A',
          soft: '#9AB08A',
        },
        parchment: '#F3F3F3',
        'red-soft': '#C94B3B',
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary: 'var(--bg-tertiary)',
        },
        border: {
          DEFAULT: 'var(--border)',
          light: 'var(--border-light)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
      },
    },
  },
  plugins: [],
};

export default config;
