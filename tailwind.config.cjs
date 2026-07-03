/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        /* Layered cool grays — boox.com works with a gray rhythm, not pure b/w */
        ink: {
          50:  '#F7F8FA',   /* page background */
          100: '#F0F1F3',   /* tile surfaces */
          200: '#E4E5E8',   /* borders, dividers */
          300: '#D1D3D6',
          400: '#8E9194',   /* muted labels */
          500: '#75787B',   /* secondary text */
          600: '#55585B',
          700: '#3B3E41',
          800: '#232528',   /* dark surfaces */
          900: '#17191B',   /* primary text, footer */
          950: '#0D0E0F',
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
