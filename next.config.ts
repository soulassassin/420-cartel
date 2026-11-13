import type { NextConfig } from 'next';

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const isStaticExport = process.env.VERCEL_STATIC_EXPORT === '1';

const nextConfig: NextConfig = {
  output: isStaticExport ? 'export' : undefined,
  reactStrictMode: true,
  transpilePackages: ['three'],
  images: {
    // Resize and re-encode on every deployment. Only a static export has no
    // image server to do it, so only that build ships the originals.
    // `next dev` skips it too: AVIF encoding costs ~10s per image on first
    // request, which left the dev home page loading for minutes. Local files
    // need no resizing to arrive instantly, and production is unchanged.
    unoptimized: isStaticExport || process.env.NODE_ENV === 'development',
    formats: ['image/avif', 'image/webp'],
    qualities: [75],
    // Product photography changes rarely; keep optimised variants for a month.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      ...(supabaseHost
        ? ([{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }] as const)
        : []),
      { protocol: 'https', hostname: 'cdn.higgsfield.ai', pathname: '/**' },
      { protocol: 'https', hostname: 'storage.googleapis.com', pathname: '/**' },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '8mb' },
    // Import only the icons and primitives a page uses, not the whole barrel.
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  // Files in /public are not fingerprinted, so they cannot be immutable; a day
  // of browser cache plus a week of stale-while-revalidate stops the hero
  // video, poster and logo being re-downloaded on every visit.
  ...(isStaticExport
    ? {}
    : {
        async headers() {
          return [
            {
              source: '/:all*(webp|png|jpg|jpeg|mp4|svg|ico)',
              headers: [
                { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
              ],
            },
          ];
        },
      }),

};

export default nextConfig;
