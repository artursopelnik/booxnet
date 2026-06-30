import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

function screenshotPath(name: string, project: string) {
  const dir = path.join(SCREENSHOT_DIR, project);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${name}.png`);
}

const pages = [
  { name: 'home', path: '/' },
  { name: 'blog-overview', path: '/blog' },
  { name: 'blog-news', path: '/blog?category=news' },
  { name: 'blog-reviews', path: '/blog?category=review' },
  { name: 'blog-comparisons', path: '/blog?category=comparison' },
  { name: 'blog-guides', path: '/blog?category=guide' },
  { name: 'article-review', path: '/blog/onyx-boox-tab-ultra-c-pro-review' },
  { name: 'article-comparison', path: '/blog/boox-note-air3-c-vs-supernote' },
  { name: 'article-guide', path: '/blog/getting-started-with-boox' },
  { name: 'article-news', path: '/blog/boox-palma-2-news' },
  { name: 'about', path: '/about' },
  { name: 'affiliate-disclosure', path: '/affiliate-disclosure' },
  { name: 'contact', path: '/contact' },
];

for (const page of pages) {
  test(`screenshot: ${page.name}`, async ({ page: pw, browserName }, testInfo) => {
    const project = testInfo.project.name;
    await pw.goto(page.path);
    await pw.waitForLoadState('networkidle');

    // Close mobile menu if accidentally open
    await pw.evaluate(() => window.scrollTo(0, 0));

    const outPath = screenshotPath(page.name, project);
    await pw.screenshot({
      path: outPath,
      fullPage: true,
    });

    // Verify key structural elements exist (use ARIA roles to avoid matching Astro toolbar internals)
    await expect(pw).toHaveTitle(/.+/);
    await expect(pw.getByRole('banner')).toBeVisible();
    await expect(pw.getByRole('contentinfo')).toBeVisible();

    console.log(`✓ Saved: tests/screenshots/${project}/${page.name}.png`);
  });
}

// Additional interaction test: mobile menu toggle
test('mobile nav: hamburger toggles menu', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'mobile') test.skip();
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const btn = page.locator('#mobile-menu-button');
  await expect(btn).toBeVisible();
  await btn.click();
  const menu = page.locator('#mobile-menu');
  await expect(menu).toBeVisible();
  await page.screenshot({
    path: screenshotPath('mobile-nav-open', testInfo.project.name),
    fullPage: false,
  });
});

// Verify affiliate disclosure appears on posts with affiliate links
test('article: affiliate disclosure shown', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'desktop') test.skip();
  await page.goto('/blog/onyx-boox-tab-ultra-c-pro-review');
  await page.waitForLoadState('networkidle');
  const disclosure = page.locator('aside').filter({ hasText: 'Affiliate-Hinweis' });
  await expect(disclosure).toBeVisible();
  await page.screenshot({
    path: screenshotPath('article-affiliate-disclosure-detail', 'desktop'),
    fullPage: false,
    clip: { x: 0, y: 400, width: 1280, height: 400 },
  });
});

// Verify TOC appears on articles with enough headings
test('article: table of contents shown', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'desktop') test.skip();
  await page.goto('/blog/onyx-boox-tab-ultra-c-pro-review');
  await page.waitForLoadState('networkidle');
  const toc = page.locator('nav[aria-label="Inhaltsverzeichnis"]');
  await expect(toc).toBeVisible();
});

// Verify robots.txt
test('robots.txt is served', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'desktop') test.skip();
  const resp = await page.goto('/robots.txt');
  expect(resp?.status()).toBe(200);
  const text = await page.content();
  expect(text).toContain('User-agent');
  expect(text).toContain('Sitemap');
});
