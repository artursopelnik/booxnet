import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.enum(['news', 'review', 'comparison', 'guide']),
    coverImage: z.string().optional(),
    tags: z.array(z.string()).default([]),
    affiliateLinks: z
      .array(
        z.object({
          label: z.string(),
          url: z.string().url(),
        })
      )
      .optional(),
  }),
});

export const collections = { posts };
