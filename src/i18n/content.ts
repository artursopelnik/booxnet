import { getCollection, type CollectionEntry } from 'astro:content';
import { type Locale, contentFallbackLocale } from './ui';

export interface LocalizedPost {
  /** Slug without the locale folder prefix (used in URLs) */
  slug: string;
  /** The chosen entry for the requested locale (or fallback) */
  entry: CollectionEntry<'posts'>;
  /** Locale the entry is actually written in */
  contentLocale: string;
}

/**
 * Posts live in locale folders: src/content/posts/<locale>/<slug>.md
 * For a requested locale, return that locale's version of each post,
 * falling back to the contentFallbackLocale (English) when missing.
 */
export async function getLocalizedPosts(lang: Locale): Promise<LocalizedPost[]> {
  const all = await getCollection('posts');

  const bySlug = new Map<string, Map<string, CollectionEntry<'posts'>>>();
  for (const entry of all) {
    const [locale, ...rest] = entry.slug.split('/');
    const clean = rest.join('/');
    if (!clean) continue; // ignore files not inside a locale folder
    if (!bySlug.has(clean)) bySlug.set(clean, new Map());
    bySlug.get(clean)!.set(locale, entry);
  }

  const result: LocalizedPost[] = [];
  for (const [slug, versions] of bySlug) {
    const entry = versions.get(lang) ?? versions.get(contentFallbackLocale) ?? [...versions.values()][0];
    if (!entry) continue;
    const contentLocale = entry.slug.split('/')[0];
    result.push({ slug, entry, contentLocale });
  }

  return result.sort((a, b) => b.entry.data.pubDate.valueOf() - a.entry.data.pubDate.valueOf());
}
