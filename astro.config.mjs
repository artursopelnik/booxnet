import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://booxnet.com',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'ru'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    mdx(),
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', es: 'es', fr: 'fr', ru: 'ru' },
      },
    }),
    tailwind(),
  ],
});
