import type { MetadataRoute } from 'next';

/**
 * 420 CARTEL :: Search Engine Sitemap
 *
 * Exposes canonical customer-facing routes with crawl frequencies and priorities.
 * Private member vault, POS, and administrative back-office routes are deliberately excluded.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://420cartel.co.za').replace(/\/$/, '');

  const routes: Array<{
    path: string;
    changeFrequency: 'daily' | 'weekly' | 'monthly';
    priority: number;
  }> = [
    { path: '/', changeFrequency: 'daily', priority: 1.0 },
    { path: '/about', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/onboarding', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/contact', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/login', changeFrequency: 'monthly', priority: 0.5 },
  ];

  return routes.map((route) => ({
    url: route.path === '/' ? `${siteUrl}/` : `${siteUrl}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
