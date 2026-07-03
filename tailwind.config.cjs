/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        /* Neutral tech grays — boox.com-style clean palette */
        ink: {
          50:  '#FAFAFA',
          100: '#F5F5F7',
          200: '#E8E8ED',
          300: '#D2D2D7',
          400: '#86868B',
          500: '#6E6E73',
          600: '#515154',
          700: '#3A3A3C',
          800: '#1D1D1F',
          900: '#111113',
          950: '#000000',
        },
        /* Clean-tech blue accent */
        accent: {
          50:  '#F0F7FF',
          100: '#DEEDFF',
          200: '#B6D9FF',
          300: '#7ABAFF',
          400: '#3395F7',
          500: '#0071E3',
          600: '#005BB8',
          700: '#00478F',
          800: '#003567',
          900: '#002344',
        },
        /* Link blue */
        link: '#0066CC',
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'ui-sans-serif', 'sans-serif'],
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
            '--tw-prose-body': '#3A3A3C',
            '--tw-prose-headings': '#111113',
            '--tw-prose-links': '#0066CC',
            '--tw-prose-bold': '#111113',
            '--tw-prose-code': '#1D1D1F',
            '--tw-prose-pre-bg': '#111113',
            '--tw-prose-th-borders': '#E8E8ED',
            '--tw-prose-td-borders': '#E8E8ED',
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
