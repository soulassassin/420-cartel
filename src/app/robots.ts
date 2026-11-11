import type { MetadataRoute } from 'next';

/**
 * 420 CARTEL :: Search Engine Robots Directives
 *
 * Directs search and AI crawler traffic to public brand discovery pages while
 * strictly forbidding indexing of member authentication, checkout, account pass,
 * terminal POS, and back-office administrative routes.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://420cartel.co.za').replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/about', '/onboarding', '/contact', '/login'],
        disallow: ['/admin', '/pos', '/api', '/account', '/checkout', '/pass', '/shop'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
