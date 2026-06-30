/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        /* Warm near-black ink palette */
        ink: {
          50:  '#FAFAF8',
          100: '#F3F3EF',
          200: '#E6E6E0',
          300: '#C8C8C0',
          400: '#9A9A90',
          500: '#6A6A60',
          600: '#4A4A42',
          700: '#2E2E28',
          800: '#1C1C18',
          900: '#0E0E0C',
          950: '#080806',
        },
        /* Orange-amber accent — editorial energy */
        accent: {
          50:  '#FFF5EC',
          100: '#FFE4CC',
          200: '#FFC490',
          300: '#FF9D4E',
          400: '#FF7A1F',
          500: '#E85D04',
          600: '#C24800',
          700: '#9C3800',
          800: '#762B00',
          900: '#552000',
        },
        /* Link blue */
        link: '#1A56DB',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'ui-serif', 'serif'],
        sans:    ['Inter', 'system-ui', 'ui-sans-serif', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        editorial: '0.08em',
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            '--tw-prose-body': '#2E2E28',
            '--tw-prose-headings': '#0E0E0C',
            '--tw-prose-links': '#1A56DB',
            '--tw-prose-bold': '#0E0E0C',
            '--tw-prose-code': '#1C1C18',
            '--tw-prose-pre-bg': '#0E0E0C',
            '--tw-prose-th-borders': '#E6E6E0',
            '--tw-prose-td-borders': '#E6E6E0',
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
