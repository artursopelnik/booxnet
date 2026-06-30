/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f5f5f0',
          100: '#e8e8e0',
          200: '#d0d0c0',
          300: '#b0b0a0',
          400: '#909080',
          500: '#707060',
          600: '#585850',
          700: '#404038',
          800: '#282820',
          900: '#141410',
          950: '#0a0a08',
        },
        accent: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
